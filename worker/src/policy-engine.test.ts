import { describe, expect, it } from "vitest";
import { decidePolicy, GLOBAL_PAUSE_REASON, PAYEE_AUTOPAY_DISABLED_REASON, type PolicyInput } from "./policy-engine.js";

const safeInput = (): PolicyInput => ({
  classification: { kind: "invoice", confidence: 0.9, injectionDetected: false },
  extraction: {
    payeeNameConfidence: 0.9,
    amountConfidence: 0.9,
    paymentMethodConfidence: 0.9,
    referenceNumberConfidence: 0.9,
    currencyConfidence: 0.9,
  },
  resolution: { status: "resolved", payeeId: "riya-1", recipientNickname: "riya-perflo" },
  auth: { dmarcPass: true, alignedSpfDkimPass: false },
  verification: { hardFails: [], score: 80 },
  duplicate: false,
  grant: { active: true, notExpired: true, perPaymentCapOk: true, remainingAmountOk: true, remainingCountOk: true },
  amountWithinOwnerCeiling: true,
  amountAboveMinimum: true,
  paused: false,
});

describe("Policy engine — FR-19 is an all-of gate", () => {
  it("returns auto_pay only when every required condition passes", () => {
    expect(decidePolicy(safeInput())).toEqual({ decision: "auto_pay", reasons: [] });
  });

  it.each([
    ["classifier confidence below 0.9", (x: PolicyInput) => { x.classification.confidence = 0.899; }],
    ["any required extracted field below 0.9", (x: PolicyInput) => { x.extraction.amountConfidence = 0.89; }],
    ["authentication not aligned", (x: PolicyInput) => { x.auth = { dmarcPass: false, alignedSpfDkimPass: false }; }],
    ["verifier score below 80", (x: PolicyInput) => { x.verification.score = 79; }],
    ["grant cap exceeded", (x: PolicyInput) => { x.grant.perPaymentCapOk = false; }],
    ["owner ceiling exceeded", (x: PolicyInput) => { x.amountWithinOwnerCeiling = false; }],
    ["amount below the fee-safety minimum — ₹50 must not auto-pay", (x: PolicyInput) => { x.amountAboveMinimum = false; }],
    ["global pause enabled", (x: PolicyInput) => { x.paused = true; }],
    ["paid verifier result is unverified", (x: PolicyInput) => { x.verification.unverified = true; }],
  ])("returns needs_approval when %s", (_name, mutate) => {
    const input = safeInput(); mutate(input);
    expect(decidePolicy(input).decision).toBe("needs_approval");
  });

  it("treats resolved sender-and-rail identity as satisfying a low extracted payee-name confidence", () => {
    const input = safeInput();
    input.extraction.payeeNameConfidence = 0.75;
    expect(decidePolicy(input)).toEqual({ decision: "auto_pay", reasons: [] });
  });

  it.each([
    { status: "new_payee" },
    { status: "details_changed", payeeId: "riya-1", priorNickname: "riya-perflo" },
    { status: "unknown_sender", payeeId: "riya-1", knownNickname: "riya-perflo" },
    { status: "multiple_payment_methods" },
  ] as const)("keeps low extracted payee-name confidence gated for $status", (resolution) => {
    const input = safeInput();
    input.extraction.payeeNameConfidence = 0.75;
    input.resolution = resolution;
    const decision = decidePolicy(input);
    expect(decision.decision).toBe("needs_approval");
    expect(decision.reasons).toContain("payeeName confidence (0.75) below 0.9.");
  });

  it.each([
    { status: "new_payee" },
    { status: "details_changed", payeeId: "riya-1", priorNickname: "riya-perflo" },
    { status: "unknown_sender", payeeId: "riya-1", knownNickname: "riya-perflo" },
    { status: "multiple_payment_methods" },
  ] as const)("returns needs_approval for resolver status $status", (resolution) => {
    const input = safeInput(); input.resolution = resolution;
    expect(decidePolicy(input).decision).toBe("needs_approval");
  });

  it("quarantines injection, identity-method conflict, or any verifier hard fail", () => {
    const injected = safeInput(); injected.classification.injectionDetected = true;
    const conflict = safeInput(); conflict.resolution = { status: "identity_method_conflict", senderPayeeId: "riya-1", methodPayeeId: "aman-1" };
    const verifierFail = safeInput(); verifierFail.verification.hardFails = ["lookalike_domain"];
    for (const input of [injected, conflict, verifierFail]) expect(decidePolicy(input).decision).toBe("quarantine");
  });

  it("ignores a duplicate/replayed invoice rather than sending it to auto-pay", () => {
    const input = safeInput(); input.duplicate = true;
    expect(decidePolicy(input)).toEqual(expect.objectContaining({ decision: "ignore" }));
  });

  it("emits the exported runtime-reason constants, not ad-hoc strings, for the two toggleable blockers", () => {
    const paused = safeInput(); paused.paused = true;
    expect(decidePolicy(paused).reasons).toContain(GLOBAL_PAUSE_REASON);

    const payeeOptedOut = safeInput(); payeeOptedOut.payeeAutoPayEnabled = false;
    expect(decidePolicy(payeeOptedOut).reasons).toContain(PAYEE_AUTOPAY_DISABLED_REASON);
  });
});
