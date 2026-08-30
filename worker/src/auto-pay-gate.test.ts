import { describe, expect, it } from "vitest";
import { attemptAutoPay, type AutoPayDeps } from "./auto-pay-gate.js";

function deps(): AutoPayDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    claimPayment: async () => { calls.push("claim"); return { idempotencyKey: "stable-key" }; },
    executePayment: async () => { calls.push("execute"); return { paymentReference: "pay-1" }; },
  };
}

describe("Auto-pay gate — default off and never bypass payment claiming", () => {
  it("does nothing while AUTO_PAY_MODE is off, even when policy says auto_pay", async () => {
    const d = deps();
    await expect(attemptAutoPay({ mode: "off", policyDecision: "auto_pay", emailId: "email-1" }, d))
      .resolves.toEqual({ status: "disabled" });
    expect(d.calls).toEqual([]);
  });

  it("does nothing for needs_approval, quarantine, or ignore while mode is on", async () => {
    for (const policyDecision of ["needs_approval", "quarantine", "ignore"] as const) {
      const d = deps();
      await attemptAutoPay({ mode: "on", policyDecision, emailId: "email-1" }, d);
      expect(d.calls).toEqual([]);
    }
  });

  it("uses the existing claim before executing, and never executes when claim refuses", async () => {
    const d = deps();
    await attemptAutoPay({ mode: "on", policyDecision: "auto_pay", emailId: "email-1" }, d);
    expect(d.calls).toEqual(["claim", "execute"]);

    const blocked: AutoPayDeps = { claimPayment: async () => null, executePayment: async () => { throw new Error("must not run"); } };
    await expect(attemptAutoPay({ mode: "on", policyDecision: "auto_pay", emailId: "email-1" }, blocked))
      .resolves.toEqual({ status: "already_claimed_or_not_payable" });
  });
});
