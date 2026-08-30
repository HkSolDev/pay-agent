import { describe, expect, it } from "vitest";
import { payoutResultToLegacyPayResult } from "./payment-executor-adapter.js";
import { PaymentDefiniteFailure, PaymentUnknownOutcomeError } from "./payment-executor.js";

describe("payoutResultToLegacyPayResult", () => {
  it("returns a paymentReference for a paid result", () => {
    expect(payoutResultToLegacyPayResult({ providerReference: "ref-1", status: "paid" }))
      .toEqual({ paymentReference: "ref-1" });
  });

  it("throws PaymentUnknownOutcomeError for an unknown result, never PaymentDefiniteFailure", () => {
    expect(() => payoutResultToLegacyPayResult({ providerReference: "ref-1", status: "unknown", failureReason: "timeout" }))
      .toThrow(PaymentUnknownOutcomeError);
  });

  it("throws PaymentDefiniteFailure for a failed result", () => {
    expect(() => payoutResultToLegacyPayResult({ providerReference: "ref-1", status: "failed", failureReason: "insufficient balance" }))
      .toThrow(PaymentDefiniteFailure);
  });

  // Previously the provider's own reference was dropped entirely on
  // failure/unknown, so a stuck payment had no id a reconciliation job could
  // later look up. Both error classes must carry it through.
  it("carries the provider's reference through on an unknown outcome", () => {
    try {
      payoutResultToLegacyPayResult({ providerReference: "pout_123", status: "unknown", failureReason: "timeout" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentUnknownOutcomeError);
      expect((err as PaymentUnknownOutcomeError).providerReference).toBe("pout_123");
    }
  });

  it("carries the provider's reference through on a definite failure", () => {
    try {
      payoutResultToLegacyPayResult({ providerReference: "pout_456", status: "failed", failureReason: "bad ifsc" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentDefiniteFailure);
      expect((err as PaymentDefiniteFailure).providerReference).toBe("pout_456");
    }
  });

  it("treats a still-processing result as an unknown outcome — the UI has no in-flight state to show yet", () => {
    expect(() => payoutResultToLegacyPayResult({ providerReference: "ref-1", status: "processing" }))
      .toThrow(PaymentUnknownOutcomeError);
  });
});
