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

  it("normalizes IFSC casing before storage", () => {
    expect(normalizePaymentMethod({ kind: "bank_neft", accountNumber: "5010023456789", ifsc: "hdfc0001234" }))
      .toEqual({ kind: "bank_neft", accountNumber: "5010023456789", ifsc: "HDFC0001234" });
  });

  it.each([
    ["malformed IFSC", { kind: "bank_neft" as const, accountNumber: "5010023456789", ifsc: "NOTIFSC" }],
    ["missing IFSC bank code digit", { kind: "bank_neft" as const, accountNumber: "5010023456789", ifsc: "HDFC1001234" }],
    ["account number too short", { kind: "bank_neft" as const, accountNumber: "12345", ifsc: "HDFC0001234" }],
    ["account number too long", { kind: "bank_neft" as const, accountNumber: "1".repeat(19), ifsc: "HDFC0001234" }],
    ["non-numeric account number", { kind: "bank_neft" as const, accountNumber: "5010ABCDE9012", ifsc: "HDFC0001234" }],
    ["malformed UPI VPA (no handle)", { kind: "upi" as const, vpa: "riya@" }],
    ["malformed UPI VPA (no domain)", { kind: "upi" as const, vpa: "riya" }],
  ])("rejects %s", (_label, method) => {
    expect(validatePaymentMethod(method)).toBe(false);
  });
});
