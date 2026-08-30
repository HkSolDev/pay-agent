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

  it("treats a still-processing result as an unknown outcome — the UI has no in-flight state to show yet", () => {
    expect(() => payoutResultToLegacyPayResult({ providerReference: "ref-1", status: "processing" }))
      .toThrow(PaymentUnknownOutcomeError);
  });
});
