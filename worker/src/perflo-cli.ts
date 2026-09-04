import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PerfloPayResult {
  paymentReference: string;
}

interface PerfloJsonError {
  ok: false;
  error: { code: string; message: string; recoverable: boolean };
}

/**
 * Perflo gave a clear, definite answer: nothing was paid. Safe to retry —
 * matches FR-27's per-code table (GUARDRAIL_DENIED, validation errors, etc).
 */
export class PerfloDefiniteFailure extends Error {}

/**
 * We genuinely don't know whether the payment landed — the CLI call timed
 * out, crashed, or returned something we couldn't parse, after the request
 * may already have reached Perflo's servers. FR-27: "any timeout or unknown
 * result → unknown_outcome, reconcile, never retried." Retrying this blind
 * is exactly how a real payment gets sent twice.
 */
export class PerfloUnknownOutcomeError extends Error {}

/**
 * Confirmed by direct reproduction: npm/npx warning noise ("npm warn Unknown
 * env config...") can land on stdout while the actual result JSON lands on
 * stderr, or vice versa depending on the call — neither stream is reliably
 * "the clean one." Perflo's own JSON output is always a single line starting
 * with `{`. Scanning both streams for the last such line, rather than
 * trusting whichever stream happens to be non-empty, is what actually
 * finds it regardless of which stream it landed on.
 */
function extractJsonLine(...streams: string[]): string | null {
  for (const stream of streams) {
    const lines = stream.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{"));
    if (lines.length > 0) return lines[lines.length - 1];
  }
  return null;
}

/**
 * Pure: turns raw CLI output (stdout and/or stderr) into a result or the
 * correctly-classified error. Separated from the actual process spawn so
 * this logic — the part that decides "safe to retry" vs "do not retry" — is
 * testable with plain strings, no child_process mocking required.
 */
export function classifyPerfloStdout(...rawOutput: string[]): PerfloPayResult {
  const jsonLine = extractJsonLine(...rawOutput);
  if (jsonLine === null) {
    throw new PerfloUnknownOutcomeError(
      `Perflo CLI returned no parseable JSON: ${rawOutput.join(" | ")}`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonLine) as Record<string, unknown>;
  } catch {
    // Non-JSON where JSON was expected — not a definite "no", just unreadable.
    throw new PerfloUnknownOutcomeError(`Perflo CLI returned unparseable output: ${jsonLine}`);
  }

  if (parsed.ok === false) {
    const error = (parsed as unknown as PerfloJsonError).error;
    throw new PerfloDefiniteFailure(`Perflo: ${error.message} (${error.code})`);
  }

  // NOT independently verified against a real payment — this account's KYC
  // hasn't cleared yet, so a live success response was never observed. Field
  // names here are a best guess from the CLI's own help text; re-check this
  // the first time a real payment actually completes.
  const data = parsed.data as Record<string, unknown> | undefined;
  const reference =
    (data?.txHash as string | undefined) ??
    (data?.paymentRef as string | undefined) ??
    (data?.reference as string | undefined) ??
    (data?.id as string | undefined);

  if (!reference) {
    // ok:true but no reference we recognize — Perflo likely says it worked;
    // we just couldn't read the proof. Presume it may have paid, not that
    // it didn't — unknown, not a safe retry.
    throw new PerfloUnknownOutcomeError(
      `Perflo reported success but no payment reference was found in the response: ${jsonLine}`,
    );
  }

  return { paymentReference: reference };
}

/**
 * Shells out to the real Perflo CLI to move money. Uses execFile with an
 * argument array — not a shell string — so nothing in `nickname`/`amount`
 * (ultimately owner-typed input from the UI) can be interpreted as shell
 * syntax. This is the one function in the whole project that actually
 * spends money.
 *
 * Command prefix is configurable via PERFLO_CLI_PATH; defaults to the npx
 * form confirmed working on this machine (no global install required).
 */
export async function payViaPerfloCli(args: {
  nickname: string;
  amount: string;
  currency: string;
  // Accepted, not forwarded: confirmed directly against `perflo beneficiary
  // pay --help` — there is no --idempotency-key flag or equivalent, so
  // there's nowhere to put it on this call. It stays in the signature (the
  // caller still passes it) so that's an honest, visible fact about this
  // function rather than a silent drop. Real double-submit protection here
  // comes from two other layers instead: our own row lock (claimPayment in
  // actions.ts — a "claimed" row can't be claimed again) and Perflo's own
  // server-side per-recipient lock (the RECIPIENT_LOCK_UNAVAILABLE error
  // code exists specifically for this). If Perflo ever adds a client-supplied
  // idempotency mechanism to this command, this is where it would be wired in.
  idempotencyKey?: string;
}): Promise<PerfloPayResult> {
  const [cmd, ...prefixArgs] = (process.env.PERFLO_CLI_PATH ?? "npx @perflo/cli@latest").split(" ");
  // PRD FR-26 / Section 5.3: pass an explicit currency in every pay command
  // ("₹500"), never a bare number — a bare amount silently trusts whatever
  // "money mode" the account happens to be in.
  const amountArg = args.currency === "USD" ? args.amount : `₹${args.amount}`;
  // The CLI renamed `recipient` -> `beneficiary` and `grant` -> `policy`
  // after the PRD was written (26 Aug); this call target was updated to
  // match the installed @perflo/cli@6.1.0 on 4 Sep once Perflo was actually
  // connected and this command was run for the first time.
  const cliArgs = [...prefixArgs, "--json", "beneficiary", "pay", args.nickname, "--amount", amountArg];
  if (args.currency === "USD") cliArgs.push("--usd");

  try {
    const result = await execFileAsync(cmd, cliArgs, { timeout: 60_000 });
    return classifyPerfloStdout(result.stdout, result.stderr);
  } catch (err) {
    if (err instanceof PerfloDefiniteFailure || err instanceof PerfloUnknownOutcomeError) throw err;

    const execErr = err as { stdout?: string; stderr?: string; message: string; killed?: boolean };

    // A timeout kills the process — we cannot tell from here whether Perflo
    // had already accepted the payment before the kill. Ambiguous, not failed.
    if (execErr.killed) {
      throw new PerfloUnknownOutcomeError(
        `Perflo CLI timed out — outcome unknown, do not retry: ${execErr.message}`,
      );
    }

    // execFile throws on a non-zero exit. Which stream actually has the JSON
    // (npm/npx warning noise can land on either stdout or stderr) is decided
    // inside classifyPerfloStdout by scanning both — confirmed by direct
    // reproduction that neither stream is reliably "the clean one."
    return classifyPerfloStdout(execErr.stdout ?? "", execErr.stderr ?? "");
  }
}
