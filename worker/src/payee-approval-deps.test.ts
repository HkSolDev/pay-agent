import { describe, expect, it } from "vitest";
import { beneficiaryFieldsFromRequest } from "./payee-approval-deps.js";

const baseRequest = {
  ownerConfirmed: true,
  name: "Riya Sharma",
  firstName: "Riya",
  lastName: "Sharma",
  senderAddr: "riya@example.com",
  grant: { perPaymentCapInr: "1000.00", totalCapInr: "5000.00", maxPayments: 5, expiresAt: "2026-12-31" },
};

describe("beneficiaryFieldsFromRequest", () => {
  it("extracts account number and IFSC from an approved bank rail", () => {
    expect(beneficiaryFieldsFromRequest({
      ...baseRequest,
      paymentMethod: { kind: "bank_neft", accountNumber: "5010023456789", ifsc: "hdfc0001234" },
    })).toEqual({ accountNumber: "5010023456789", ifsc: "HDFC0001234" });
  });

  // The connected Perflo account only has the bank.in.inr rail (confirmed
  // live via `beneficiary schemas --country IN`) — there is no UPI schema
  // to register a beneficiary against yet, so this must fail loudly rather
  // than silently fabricate a nickname the way the old placeholder deps did.
  it("refuses a UPI rail — Perflo has no UPI beneficiary schema for this account yet", () => {
    expect(() => beneficiaryFieldsFromRequest({
      ...baseRequest,
      paymentMethod: { kind: "upi", vpa: "riya@okaxis" },
    })).toThrow(/UPI/);
  });
});
