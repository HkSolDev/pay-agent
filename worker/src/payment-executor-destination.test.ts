import { describe, expect, it } from "vitest";
import { paymentMethodToPayoutDestination } from "./payment-executor-destination.js";

describe("paymentMethodToPayoutDestination", () => {
  it("maps a UPI payment method to a upi PayoutDestination", () => {
    expect(paymentMethodToPayoutDestination({ kind: "upi", vpa: "riya@okaxis" }))
      .toEqual({ destination: { kind: "upi", vpa: "riya@okaxis" }, rail: "upi" });
  });

  it("maps a bank_neft payment method to a bank_transfer PayoutDestination", () => {
    expect(paymentMethodToPayoutDestination({ kind: "bank_neft", accountNumber: "123456789012", ifsc: "HDFC0001234" }))
      .toEqual({
        destination: { kind: "bank_transfer", accountNumber: "123456789012", ifsc: "HDFC0001234" },
        rail: "bank_transfer",
      });
  });
});
