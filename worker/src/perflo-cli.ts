import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PerfloPayResult {
  paymentReference: string;
}

export interface PerfloTxStatusResult {
  providerReference: string;
  status: "processing" | "paid" | "failed" | "unknown";
  failureReason?: string;
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
export class PerfloUnknownOutcomeError extends Error {
  constructor(message: string, public readonly paymentReference?: string) {
    super(message);
  }
}

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

  // Verified 4 Sep 2026 against a real `beneficiary pay` call: the fields
  // are top-level on the response, not nested under `data` (that was a
  // guess from the CLI's help text, wrong). Real shape observed:
  // {"ok":true,"status":"timeout","moved":true,"confirmed":false,
  //  "paymentId":"...","txHash":"0x..."}. `confirmed:false` (seen live,
  // via `tx status` afterward, that specific payment had actually failed)
  // means Perflo itself doesn't yet know the outcome -- that is exactly
  // FR-27's "any timeout or unknown result -> unknown_outcome, reconcile,
  // never retried", even though `ok:true` and a txHash are both present.
  const reference =
    (parsed.txHash as string | undefined) ??
    (parsed.paymentId as string | undefined) ??
    (parsed.paymentRef as string | undefined) ??
    (parsed.reference as string | undefined) ??
    (parsed.id as string | undefined);

  if (!reference) {
    // ok:true but no reference we recognize — Perflo likely says it worked;
    // we just couldn't read the proof. Presume it may have paid, not that
    // it didn't — unknown, not a safe retry.
    throw new PerfloUnknownOutcomeError(
      `Perflo reported success but no payment reference was found in the response: ${jsonLine}`,
    );
  }

  if (parsed.confirmed === false) {
    // A reference exists but Perflo hasn't confirmed the payment landed --
    // the reconciler must resolve this via `tx status`/`activity`, not this
    // function assuming success just because a txHash came back.
    throw new PerfloUnknownOutcomeError(
      `Perflo returned a reference but confirmed:false (status: ${String(parsed.status)}) — outcome unresolved, reference: ${reference}`,
      reference,
    );
  }

  return { paymentReference: reference };
}

/** Maps `perflo --json tx status <txHash>` onto the provider-neutral payout states. */
export function classifyPerfloTxStatusStdout(paymentReference: string, ...rawOutput: string[]): PerfloTxStatusResult {
  const jsonLine = extractJsonLine(...rawOutput);
  if (jsonLine === null) {
    throw new PerfloUnknownOutcomeError("Perflo transaction status returned no parseable JSON.", paymentReference);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonLine) as Record<string, unknown>;
  } catch {
    throw new PerfloUnknownOutcomeError("Perflo transaction status returned unparseable output.", paymentReference);
  }

  if (parsed.ok === false) {
    const error = (parsed as unknown as PerfloJsonError).error;
    throw new Error(`Perflo transaction status lookup failed: ${error.message} (${error.code})`);
  }

  const providerReference = typeof parsed.txHash === "string" ? parsed.txHash : paymentReference;
  switch (parsed.status) {
    case "success":
      return { providerReference, status: "paid" };
    case "failed":
      return { providerReference, status: "failed", failureReason: "Perflo transaction failed." };
    case "submitted":
    case "processing":
    case "executing":
      return { providerReference, status: "processing" };
    default:
      return { providerReference, status: "unknown", failureReason: `Unrecognized Perflo transaction status: ${String(parsed.status)}` };
  }
}

function isPerfloPayoutId(paymentReference: string): boolean {
  return /^pout_[A-Za-z0-9]+$/.test(paymentReference);
}

function containsPerfloReference(value: unknown, paymentReference: string): boolean {
  if (typeof value === "string") return value === paymentReference;
  if (Array.isArray(value)) return value.some((item) => containsPerfloReference(item, paymentReference));
  if (value !== null && typeof value === "object") {
    return Object.values(value).some((item) => containsPerfloReference(item, paymentReference));
  }
  return false;
}

function findPerfloActivityRecord(value: unknown, paymentReference: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findPerfloActivityRecord(item, paymentReference);
      if (match) return match;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (typeof record.status === "string" && containsPerfloReference(record, paymentReference)) return record;
  for (const item of Object.values(record)) {
    const match = findPerfloActivityRecord(item, paymentReference);
    if (match) return match;
  }
  return null;
}

/** Maps `perflo --json activity` payout records onto provider-neutral states. */
export function classifyPerfloActivityStdout(paymentReference: string, ...rawOutput: string[]): PerfloTxStatusResult {
  const jsonLine = extractJsonLine(...rawOutput);
  if (jsonLine === null) {
    throw new PerfloUnknownOutcomeError("Perflo activity lookup returned no parseable JSON.", paymentReference);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLine) as unknown;
  } catch {
    throw new PerfloUnknownOutcomeError("Perflo activity lookup returned unparseable output.", paymentReference);
  }

  if (parsed !== null && typeof parsed === "object" && (parsed as Record<string, unknown>).ok === false) {
    const error = (parsed as unknown as PerfloJsonError).error;
    throw new Error(`Perflo activity lookup failed: ${error.message} (${error.code})`);
  }

  const record = findPerfloActivityRecord(parsed, paymentReference);
  if (!record) {
    throw new PerfloUnknownOutcomeError(
      `Perflo activity contained no record for payout ${paymentReference}.`,
      paymentReference,
    );
  }

  const providerReference =
    (typeof record.txHash === "string" && record.txHash) ||
    (typeof record.transactionHash === "string" && record.transactionHash) ||
    paymentReference;
  const status = String(record.status).toLowerCase();
  switch (status) {
    case "success":
    case "succeeded":
    case "paid":
    case "processed":
    case "completed":
    case "settled":
      return { providerReference, status: "paid" };
    case "failed":
    case "rejected":
    case "cancelled":
    case "canceled":
      return {
        providerReference,
        status: "failed",
        failureReason:
          (typeof record.failureReason === "string" && record.failureReason) ||
          (typeof record.errorReason === "string" && record.errorReason) ||
          "Perflo payout failed.",
      };
    case "submitted":
    case "processing":
    case "executing":
    case "pending":
    case "queued":
    case "in_progress":
    case "timeout":
      return { providerReference, status: "processing" };
    default:
      return { providerReference, status: "unknown", failureReason: `Unrecognized Perflo payout status: ${String(record.status)}` };
  }
}

/** Read-only authoritative lookup for a Perflo transaction already submitted. */
export async function getPerfloTxStatus(paymentReference: string): Promise<PerfloTxStatusResult> {
  const [cmd, ...prefixArgs] = (process.env.PERFLO_CLI_PATH ?? "npx @perflo/cli@latest").split(" ");
  const payoutId = isPerfloPayoutId(paymentReference);
  const cliArgs = payoutId
    ? [...prefixArgs, "--json", "activity", "--limit", "1000"]
    : [...prefixArgs, "--json", "tx", "status", paymentReference];

  try {
    const result = await execFileAsync(cmd, cliArgs, { timeout: 60_000 });
    return payoutId
      ? classifyPerfloActivityStdout(paymentReference, result.stdout, result.stderr)
      : classifyPerfloTxStatusStdout(paymentReference, result.stdout, result.stderr);
  } catch (error) {
    if (error instanceof PerfloUnknownOutcomeError) throw error;
    const execError = error as { stdout?: string; stderr?: string; message: string; killed?: boolean };
    if (execError.killed) {
      throw new PerfloUnknownOutcomeError(
        payoutId ? "Perflo activity lookup timed out." : "Perflo transaction status lookup timed out.",
        paymentReference,
      );
    }
    if (execError.stdout !== undefined || execError.stderr !== undefined) {
      return payoutId
        ? classifyPerfloActivityStdout(paymentReference, execError.stdout ?? "", execError.stderr ?? "")
        : classifyPerfloTxStatusStdout(paymentReference, execError.stdout ?? "", execError.stderr ?? "");
    }
    throw error;
  }
}

/**
 * Pure, same shape as classifyPerfloStdout, but for `beneficiary add`. The
 * nickname is chosen by the caller before the CLI is ever invoked, so unlike
 * a payment there is no reference to parse back out of the response — this
 * only needs to tell apart a clean success from a definite failure from a
 * genuinely unreadable/unknown result.
 */
export function classifyBeneficiaryAddStdout(...rawOutput: string[]): void {
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
    throw new PerfloUnknownOutcomeError(`Perflo CLI returned unparseable output: ${jsonLine}`);
  }

  if (parsed.ok === false) {
    const error = (parsed as unknown as PerfloJsonError).error;
    throw new PerfloDefiniteFailure(`Perflo: ${error.message} (${error.code})`);
  }
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

/**
 * Shells out to `perflo beneficiary add` to register a payee's rail with
 * Perflo. Country/schema are hardcoded to India's only available rail
 * (`bank.in.inr`, confirmed live via `beneficiary schemas --country IN` —
 * there is still no UPI schema on this account). accountType is hardcoded to
 * "individual" — the PRD scopes payees to individuals only, so the
 * business/companyName branch of Perflo's schema is deliberately not wired
 * up here.
 *
 * `--purpose-code PERSONAL_TRANSFER` is required even though `beneficiary
 * schemas --country IN` doesn't list it as required for bank.in.inr —
 * reproduced live: the same call without it is rejected with
 * `{"ok":false,"error":{"code":"purpose_required",...,"details":
 * {"accepted_purposes":["FAMILY_SUPPORT","PERSONAL_TRANSFER"]}}}`. This app
 * pays vendors/invoices, not family support, so PERSONAL_TRANSFER is the
 * correct fixed choice here, not a guess between the two.
 */
export interface BeneficiaryAddArgs {
  nickname: string;
  firstName: string;
  lastName: string;
  accountNumber: string;
  ifsc: string;
}

/**
 * Pure: builds the `beneficiary add` CLI argument list. Split out from
 * createPerfloBeneficiary specifically so a missing/wrong flag (like the
 * absent `--purpose-code` that caused a live `purpose_required` rejection,
 * reproduced 4 Sep 2026 — not documented as required by `beneficiary
 * schemas --country IN`, but enforced anyway) is something a unit test can
 * catch directly, without needing a live CLI call every time.
 */
export function buildBeneficiaryAddArgs(args: BeneficiaryAddArgs): string[] {
  return [
    "--json", "beneficiary", "add",
    "--name", `${args.firstName} ${args.lastName}`,
    "--country", "IN",
    "--schema", "bank.in.inr",
    "--nickname", args.nickname,
    "--purpose-code", "PERSONAL_TRANSFER",
    "--field", "accountType=individual",
    "--field", `firstName=${args.firstName}`,
    "--field", `lastName=${args.lastName}`,
    "--field", `bank_identifier=${args.ifsc}`,
    "--field", `account_number=${args.accountNumber}`,
  ];
}

export async function createPerfloBeneficiary(args: BeneficiaryAddArgs): Promise<void> {
  const [cmd, ...prefixArgs] = (process.env.PERFLO_CLI_PATH ?? "npx @perflo/cli@latest").split(" ");
  const cliArgs = [...prefixArgs, ...buildBeneficiaryAddArgs(args)];

  try {
    const result = await execFileAsync(cmd, cliArgs, { timeout: 60_000 });
    classifyBeneficiaryAddStdout(result.stdout, result.stderr);
  } catch (err) {
    if (err instanceof PerfloDefiniteFailure || err instanceof PerfloUnknownOutcomeError) throw err;

    const execErr = err as { stdout?: string; stderr?: string; message: string; killed?: boolean };

    if (execErr.killed) {
      throw new PerfloUnknownOutcomeError(
        `Perflo CLI timed out — outcome unknown, do not retry: ${execErr.message}`,
      );
    }

    classifyBeneficiaryAddStdout(execErr.stdout ?? "", execErr.stderr ?? "");
  }
}

/**
 * Measured live 4 Sep 2026: ran `policy enable testpayee --per-payment
 * "1 INR" --total-cap "5 INR" --count 1 --expires-days 1 --json`,
 * deliberately never clicked the approval link, and let it run. The CLI
 * gave up on its own after 615.88s with a clean `{"ok":false,...}` denial
 * (see perflo-cli.test.ts). This constant is that real number rounded up
 * to a clean 11 minutes — comfortable margin so our own kill timer below
 * is a backstop for a genuinely hung process, not the thing that normally
 * ends the call. `Payee.pendingGrantExpiresAt` (payee-approval-deps.ts)
 * uses this same value as its app-side ceiling, so the UI's "waiting"
 * window and the process's own real timeout line up.
 */
export const GRANT_APPROVAL_TIMEOUT_MS = 660_000;

export interface GrantEnableArgs {
  nickname: string;
  perPaymentCapInr: string;
  totalCapInr: string;
  maxPayments: number;
  expiresDays: number;
}

/**
 * Pure: builds the `policy enable` CLI argument list. Flags confirmed
 * against the PRD's own worked example (§10.1: `perflo grant enable riya
 * --per-payment 6 --total-cap 72 --count 12 --expires-days 365`) and
 * re-confirmed live 4 Sep 2026 against the renamed `policy enable`
 * subcommand — the flag names survived the `grant`->`policy` rename, only
 * the subcommand itself changed (same pattern as `beneficiary add`).
 * Caps get an explicit "INR" currency suffix, the same reasoning FR-26
 * already applies to `beneficiary pay` — never a bare number.
 */
export function buildGrantEnableArgs(args: GrantEnableArgs): string[] {
  return [
    "--json", "policy", "enable", args.nickname,
    "--per-payment", `${args.perPaymentCapInr} INR`,
    "--total-cap", `${args.totalCapInr} INR`,
    "--count", String(args.maxPayments),
    "--expires-days", String(args.expiresDays),
  ];
}

/**
 * Pure: scans accumulated CLI output (stdout or stderr, called again as
 * more chunks arrive) for the approval URL. Real shape, confirmed live
 * 4 Sep 2026: `policy enable --json` prints `{"ok":true,
 * "status":"awaiting_browser","approveUrl":"https://..."}` as its first
 * line, then blocks — notably *not* the richer `{sid, approveUrl,
 * pollInterval, expiresIn}` CliSignStart shape Perflo's own `/cli/sign/
 * start` API docs describe; that's a different surface the CLI may or may
 * not sign-start-relay through internally, but it is not what `--json`
 * itself emits here. Scans every candidate line (not just the last, unlike
 * extractJsonLine above) since the approval URL only ever appears in the
 * *first* JSON line, well before the final result line this process
 * eventually exits with. Falls back to a plain URL regex only if no JSON
 * line parses with an `approveUrl` field — kept as a defensive fallback,
 * not the primary path, since the real output is already structured JSON.
 */
export function extractApproveUrl(buffer: string): string | null {
  const lines = buffer.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{"));
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (typeof parsed.approveUrl === "string" && parsed.approveUrl) return parsed.approveUrl;
    } catch {
      // Incomplete JSON — a chunk boundary can split a line mid-object.
      // Not an error, just nothing to read yet; keep scanning other lines.
    }
  }
  const match = buffer.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

/**
 * Shells out to `perflo policy enable` to grant real spending authority
 * against an already-registered beneficiary. Structurally different from
 * every other function in this file: `policy enable` prints an approval
 * URL and then *keeps running* while a human clicks it in a browser, for
 * up to several minutes (see GRANT_APPROVAL_TIMEOUT_MS above) — so this
 * needs `spawn` and its streaming `data` events, not `execFileAsync`,
 * which only ever returns output after the process has already exited
 * (useless here: by then there's nothing left to click). `onApproveUrl`
 * fires the moment the URL is found in either stream, independent of the
 * eventual exit outcome, so the caller (payee-approval-deps.ts) can
 * persist it to the database immediately rather than waiting on
 * `policy enable` to finish.
 *
 * Resolves on a clean `ok:true` exit. Throws PerfloDefiniteFailure on a
 * clean `ok:false` exit (including the CLI's own internal approval
 * timeout — confirmed live to be exactly this shape, see
 * perflo-cli.test.ts) — that's Perflo giving a definite "no", which the
 * caller resolves to `not_approved`/`lastGrantOutcome: "denied"`. Throws
 * PerfloUnknownOutcomeError if this function's own timer has to kill the
 * process, or the exit output is unparseable — an ambiguous result that
 * intentionally does *not* resolve the payee row here; the expiry sweep
 * (reconcile-grant-approvals.ts) is what eventually closes those out.
 */
export async function enableGrantViaPerfloCli(
  args: GrantEnableArgs & { timeoutMs: number; onApproveUrl: (url: string) => void },
): Promise<void> {
  const [cmd, ...prefixArgs] = (process.env.PERFLO_CLI_PATH ?? "npx @perflo/cli@latest").split(" ");
  const cliArgs = [...prefixArgs, ...buildGrantEnableArgs(args)];

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cliArgs);
    let stdout = "";
    let stderr = "";
    let urlCaptured = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, args.timeoutMs);

    function checkForUrl() {
      if (urlCaptured) return;
      const url = extractApproveUrl(stdout) ?? extractApproveUrl(stderr);
      if (url) {
        urlCaptured = true;
        args.onApproveUrl(url);
      }
    }

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); checkForUrl(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); checkForUrl(); });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new PerfloUnknownOutcomeError(`Perflo CLI failed to start: ${err.message}`));
    });

    child.on("close", () => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new PerfloUnknownOutcomeError(
          "Perflo CLI grant approval was killed after exceeding the process timeout — outcome unknown, do not treat as denied.",
        ));
        return;
      }
      try {
        classifyBeneficiaryAddStdout(stdout, stderr);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}
