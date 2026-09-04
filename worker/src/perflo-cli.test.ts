import { describe, expect, it } from "vitest";
import { classifyPerfloStdout, PerfloDefiniteFailure, PerfloUnknownOutcomeError } from "./perflo-cli.js";

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
