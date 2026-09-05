import { execFile, type ExecFileException } from "node:child_process";
import { promisify } from "node:util";
// Extensionless, not `.js` — this file is reachable from app/app/actions.ts
// (Next's server bundle), and a `.js`-suffixed value import breaks Turbopack
// there even though the target plainly exists (see hands-off.md's "Turbopack
// import-extension gotcha").
import { PerfloDefiniteFailure, PerfloUnknownOutcomeError } from "./perflo-cli";
import type { PaidPurchaseRequest, PaidPurchaseResult } from "./x402-verifier";

const execFileAsync = promisify(execFile);
// BigInt(n) calls, not `n`-suffixed literals — this file is reachable from
// app/app/actions.ts, whose tsconfig targets ES2017 (BigInt literal syntax
// needs ES2020+); BigInt() itself is a plain runtime global, so it works
// under either target.
const USDC_MINOR_PER_DOLLAR = BigInt(1_000_000);
const USDC_MINOR_PER_CENT = BigInt(10_000);

interface ExecResult {
  stdout: string;
  stderr: string;
}

type ExecFileAsync = (command: string, args: string[], options: { timeout: number }) => Promise<ExecResult>;

interface PerfloJsonError {
  code: string;
  message: string;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Perflo CLI returned an invalid object.");
  return value as Record<string, unknown>;
}

function extractJsonLine(...streams: string[]): string | null {
  for (const stream of streams) {
    const lines = stream.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("{"));
    if (lines.length > 0) return lines[lines.length - 1];
  }
  return null;
}

function parseOutput(...streams: string[]): Record<string, unknown> {
  const jsonLine = extractJsonLine(...streams);
  if (!jsonLine) throw new PerfloUnknownOutcomeError(`Perflo CLI returned no parseable JSON: ${streams.join(" | ")}`);

  let parsed: Record<string, unknown>;
  try {
    parsed = object(JSON.parse(jsonLine));
  } catch {
    throw new PerfloUnknownOutcomeError(`Perflo CLI returned unparseable output: ${jsonLine}`);
  }
  if (parsed.ok === false) {
    const error = object(parsed.error) as unknown as PerfloJsonError;
    throw new PerfloDefiniteFailure(`Perflo: ${error.message} (${error.code})`);
  }
  return parsed;
}

function usdToUsdcMinor(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new Error(`Invalid x402 USD budget: ${value}`);
  return BigInt(match[1]) * USDC_MINOR_PER_DOLLAR + BigInt((match[2] ?? "").padEnd(6, "0"));
}

function asMinor(value: unknown, fallback: bigint): bigint {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return /^\d+$/.test(text) ? BigInt(text) : fallback;
}

function centsFromUsdcMinor(value: bigint): number {
  const cents = (value + USDC_MINOR_PER_CENT - BigInt(1)) / USDC_MINOR_PER_CENT;
  const number = Number(cents);
  if (!Number.isSafeInteger(number)) throw new Error("Perflo returned an invalid service price.");
  return number;
}

function cliCommand(): [string, ...string[]] {
  return (process.env.PERFLO_CLI_PATH ?? "npx @perflo/cli@latest").split(" ") as [string, ...string[]];
}

export class PerfloCliX402Client {
  private readonly exec: ExecFileAsync;

  constructor(options: { execFile?: ExecFileAsync } = {}) {
    this.exec = options.execFile ?? (execFileAsync as unknown as ExecFileAsync);
  }

  private async run(args: string[]): Promise<Record<string, unknown>> {
    const [command, ...prefixArgs] = cliCommand();
    try {
      const result = await this.exec(command, [...prefixArgs, "--json", ...args], { timeout: 60_000 });
      return parseOutput(result.stdout, result.stderr);
    } catch (error) {
      if (error instanceof PerfloDefiniteFailure || error instanceof PerfloUnknownOutcomeError) throw error;
      const execError = error as ExecFileException & ExecResult;
      if (execError.killed) throw new PerfloUnknownOutcomeError(`Perflo CLI timed out — outcome unknown: ${execError.message}`);
      return parseOutput(execError.stdout ?? "", execError.stderr ?? "");
    }
  }

  async purchase(request: PaidPurchaseRequest): Promise<PaidPurchaseResult> {
    const vendor = object((await this.run(["best-vendor", request.capability])).best);
    const url = typeof vendor.url === "string" ? vendor.url : null;
    if (!url) throw new PerfloUnknownOutcomeError(`Perflo returned no URL for ${request.capability}.`);

    const checked = await this.run(["check", url]);
    const contract = object(checked.contract);
    const priceMinor = asMinor(contract.priceMinor, BigInt(-1));
    if (priceMinor < BigInt(0)) throw new PerfloUnknownOutcomeError(`Perflo returned no price for ${url}.`);
    const budgetMinor = usdToUsdcMinor(request.maxPriceUsd);
    if (priceMinor > budgetMinor) throw new PerfloDefiniteFailure(`${request.capability} price exceeds the invoice x402 budget.`);

    const method = typeof contract.method === "string" ? contract.method.toUpperCase() : "GET";
    const asset = typeof contract.asset === "string" ? contract.asset : "USDC";
    const fetched = await this.run([
      "fetch", url, "--method", method, "--body", JSON.stringify(request.input), "--price", budgetMinor.toString(), "--asset", asset,
    ]);
    const data = object(fetched.result ?? fetched);
    const nestedResult = data.result;
    const nested = nestedResult && typeof nestedResult === "object" && !Array.isArray(nestedResult) ? nestedResult as Record<string, unknown> : {};
    const txHash = typeof data.txHash === "string" ? data.txHash : typeof nested.txHash === "string" ? nested.txHash : null;
    const settlementStatus = data.settlementStatus === "settled" || data.settlementStatus === "unverified" || data.settlementStatus === "none"
      ? data.settlementStatus
      : txHash ? "settled" : "unverified";
    const actualPriceMinor = asMinor(data.priceMinor, priceMinor);

    return {
      settlementStatus,
      txHash,
      costMinor: centsFromUsdcMinor(actualPriceMinor),
      result: data,
    };
  }
}
