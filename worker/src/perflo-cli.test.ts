import { describe, expect, it } from "vitest";
import {
  buildBeneficiaryAddArgs,
  buildGrantEnableArgs,
  classifyBeneficiaryAddStdout,
  classifyPerfloStdout,
  extractApproveUrl,
  PerfloDefiniteFailure,
  PerfloUnknownOutcomeError,
} from "./perflo-cli.js";

describe("classifyPerfloStdout", () => {
  it("treats a clean {ok:false} response as a definite, retry-safe failure", () => {
    const stdout = JSON.stringify({
      ok: false,
      error: { code: "GUARDRAIL_DENIED", message: "outside grant", recoverable: false },
    });
    expect(() => classifyPerfloStdout(stdout)).toThrow(PerfloDefiniteFailure);
  });

  it("extracts a payment reference from a successful, confirmed response", () => {
    // Real shape, confirmed 4 Sep 2026 against a live `beneficiary pay` call:
    // fields are top-level, not nested under `data`.
    const stdout = JSON.stringify({ ok: true, confirmed: true, status: "success", txHash: "0xabc123", paymentId: "pmt_1" });
    expect(classifyPerfloStdout(stdout)).toEqual({ paymentReference: "0xabc123" });
  });

  it("treats a reference with confirmed:false as unknown outcome, not success — reproduced live 4 Sep 2026", () => {
    const stdout = JSON.stringify({ ok: true, status: "timeout", moved: true, confirmed: false, paymentId: "pmt_2", txHash: "0xghi789" });
    expect(() => classifyPerfloStdout(stdout)).toThrow(PerfloUnknownOutcomeError);
  });

  it("treats unparseable stdout as unknown, never as a safe-to-retry failure", () => {
    expect(() => classifyPerfloStdout("not json at all")).toThrow(PerfloUnknownOutcomeError);
  });

  it("treats ok:true with no recognizable reference as unknown, not a failure — the payment may have gone through", () => {
    const stdout = JSON.stringify({ ok: true, somethingUnexpected: 1 });
    expect(() => classifyPerfloStdout(stdout)).toThrow(PerfloUnknownOutcomeError);
  });

  // Reproduced for real against the live CLI: npm warning noise can land on
  // stdout while the actual result JSON lands on stderr. A version of this
  // function that only checked one stream — or picked whichever was
  // non-empty — misclassified every real error as "unknown outcome" here.
  it("finds the JSON on stderr even when stdout is npm warning noise", () => {
    const noisyStdout = 'npm warn Unknown env config "npm-globalconfig".\nnpm warn Unknown env config "dir".';
    const realStderr = JSON.stringify({
      ok: false,
      error: { code: "ERROR", message: "Not connected. Run `perflo login` first.", recoverable: false },
    });
    expect(() => classifyPerfloStdout(noisyStdout, realStderr)).toThrow(PerfloDefiniteFailure);
  });

  it("finds the JSON on stdout even when stderr has unrelated noise", () => {
    const realStdout = JSON.stringify({ ok: true, confirmed: true, status: "success", txHash: "0xdef456" });
    const noisyStderr = "npm warn deprecated some-package@1.0.0";
    expect(classifyPerfloStdout(realStdout, noisyStderr)).toEqual({ paymentReference: "0xdef456" });
  });
});

describe("classifyBeneficiaryAddStdout", () => {
  // Unlike a payment, the nickname is ours (we chose it before calling the
  // CLI) — this only needs to tell apart success / definite failure /
  // unknown, never parse a reference back out of the response.
  it("does not throw on a clean {ok:true} response", () => {
    const stdout = JSON.stringify({ ok: true });
    expect(() => classifyBeneficiaryAddStdout(stdout)).not.toThrow();
  });

  it("treats a clean {ok:false} response as a definite, retry-safe failure", () => {
    const stdout = JSON.stringify({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "invalid IFSC", recoverable: false },
    });
    expect(() => classifyBeneficiaryAddStdout(stdout)).toThrow(PerfloDefiniteFailure);
  });

  it("treats unparseable stdout as unknown, never as a safe-to-retry failure", () => {
    expect(() => classifyBeneficiaryAddStdout("not json at all")).toThrow(PerfloUnknownOutcomeError);
  });

  it("finds the JSON on stderr even when stdout is npm warning noise", () => {
    const noisyStdout = 'npm warn Unknown env config "npm-globalconfig".';
    const realStderr = JSON.stringify({
      ok: false,
      error: { code: "ERROR", message: "Not connected. Run `perflo login` first.", recoverable: false },
    });
    expect(() => classifyBeneficiaryAddStdout(noisyStdout, realStderr)).toThrow(PerfloDefiniteFailure);
  });
});

describe("classifyBeneficiaryAddStdout applied to policy enable's exit line", () => {
  // Real shape, confirmed live 4 Sep 2026: ran `policy enable testpayee
  // --per-payment "1 INR" --total-cap "5 INR" --count 1 --expires-days 1
  // --json` and deliberately never clicked the approval link. The CLI itself
  // gave up after 615.88s and printed this as its final line before exiting
  // non-zero. This is a *definite* answer (ok:false, recoverable:false) —
  // the same shape every other Perflo error uses — not an ambiguous/killed
  // outcome, so it must classify as PerfloDefiniteFailure ("denied"), never
  // PerfloUnknownOutcomeError ("expired" is reserved for cases where *we*
  // never got a definite answer at all — see reconcile-grant-approvals.ts).
  it("treats the CLI's own internal approval timeout as a definite denial, not an ambiguous outcome", () => {
    const stdout = JSON.stringify({
      ok: false,
      error: { code: "ERROR", message: "policy allowing payments to testpayee timed out. Try again.", recoverable: false },
    });
    expect(() => classifyBeneficiaryAddStdout(stdout)).toThrow(PerfloDefiniteFailure);
  });
});

describe("extractApproveUrl", () => {
  // Real shape, confirmed live 4 Sep 2026 against `policy enable --json`:
  // this is printed immediately as the first stdout line, then the process
  // blocks waiting on the browser click. No separate sid/pollInterval/
  // expiresIn fields, unlike the CliSignStart shape in Perflo's /cli/sign/
  // start API docs — that richer schema turned out not to be what the CLI's
  // own --json output actually emits for this command.
  it("finds approveUrl in the real awaiting_browser JSON line", () => {
    const buffer = '{"ok":true,"status":"awaiting_browser","approveUrl":"https://app.perflo.ai/approve?sid=bWyiGUyGFTHacL71Vd5H927Qck4FiQRu47qRn1qNV98"}\n';
    expect(extractApproveUrl(buffer)).toBe("https://app.perflo.ai/approve?sid=bWyiGUyGFTHacL71Vd5H927Qck4FiQRu47qRn1qNV98");
  });

  it("finds the JSON line even with npm warning noise mixed into the same buffer", () => {
    const buffer = 'npm warn Unknown env config "npm-globalconfig".\n{"ok":true,"status":"awaiting_browser","approveUrl":"https://app.perflo.ai/approve?sid=xyz"}\nnpm warn deprecated some-package@1.0.0\n';
    expect(extractApproveUrl(buffer)).toBe("https://app.perflo.ai/approve?sid=xyz");
  });

  it("falls back to a plain URL regex when the buffer has no parseable JSON at all", () => {
    const buffer = "Approve this policy request in your browser: https://app.perflo.ai/approve?sid=plain-text-fallback\n";
    expect(extractApproveUrl(buffer)).toBe("https://app.perflo.ai/approve?sid=plain-text-fallback");
  });

  it("returns null on an empty or still-incomplete buffer, never throws", () => {
    expect(extractApproveUrl("")).toBeNull();
    // A chunk boundary can land mid-line — an incomplete JSON object must
    // not crash the streaming parser; it just means "nothing found yet."
    expect(extractApproveUrl('{"ok":true,"status":"awaiting_br')).toBeNull();
  });

  it("ignores a JSON line that has no approveUrl field", () => {
    const buffer = '{"ok":false,"error":{"code":"ERROR","message":"policy allowing payments to testpayee timed out. Try again.","recoverable":false}}\n';
    expect(extractApproveUrl(buffer)).toBeNull();
  });
});

describe("buildGrantEnableArgs", () => {
  // Flags confirmed against PRD §10.1's own worked example
  // (`perflo grant enable riya --per-payment 6 --total-cap 72 --count 12
  // --expires-days 365`) and re-confirmed live 4 Sep 2026 against the
  // renamed `policy enable` subcommand — same flag names survived the
  // grant->policy rename, only the subcommand changed.
  it("builds the exact policy enable invocation, with an explicit INR currency suffix on both caps", () => {
    const args = buildGrantEnableArgs({
      nickname: "testpayee",
      perPaymentCapInr: "1",
      totalCapInr: "5",
      maxPayments: 1,
      expiresDays: 1,
    });
    expect(args).toEqual([
      "--json", "policy", "enable", "testpayee",
      "--per-payment", "1 INR",
      "--total-cap", "5 INR",
      "--count", "1",
      "--expires-days", "1",
    ]);
  });
});

describe("buildBeneficiaryAddArgs", () => {
  // Reproduced live 4 Sep 2026: the exact same call without --purpose-code
  // is rejected with {"ok":false,"error":{"code":"purpose_required",...}}
  // even though `beneficiary schemas --country IN` doesn't list it as
  // required for bank.in.inr. Re-verified live with the flag present: ok:true.
  it("always includes --purpose-code — omitting it is rejected live with purpose_required", () => {
    const args = buildBeneficiaryAddArgs({
      nickname: "test-payee", firstName: "Test", lastName: "Payee",
      accountNumber: "99999999999", ifsc: "SBIN0050341",
    });
    const idx = args.indexOf("--purpose-code");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("PERSONAL_TRANSFER");
  });
});
