import { describe, expect, it } from "vitest";
import { normalizePaymentMethod, validatePaymentMethod } from "./payment-method-validation.js";

describe("Payment-method validation — one shared trust boundary", () => {
  it.each(["billing@gmail.com", "vendor@outlook.com", "person@yahoo.com", "hello@example.com"])(
    "never accepts an ordinary email address (%s) as a UPI VPA",
    (vpa) => expect(validatePaymentMethod({ kind: "upi", vpa })).toBe(false),
  );

  it("accepts and canonicalizes a genuine UPI VPA", () => {
    expect(normalizePaymentMethod({ kind: "upi", vpa: "Riya.Sharma@OKAXIS" }))
      .toEqual({ kind: "upi", vpa: "riya.sharma@okaxis" });
  });

  it("requires both a valid account number and IFSC for NEFT", () => {
    expect(validatePaymentMethod({ kind: "bank_neft", accountNumber: "5010023456789", ifsc: "HDFC0001234" })).toBe(true);
    expect(validatePaymentMethod({ kind: "bank_neft", accountNumber: "123", ifsc: "HDFC0001234" })).toBe(false);
  });
});
