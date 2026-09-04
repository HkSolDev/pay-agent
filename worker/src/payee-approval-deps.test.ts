import { describe, expect, it } from "vitest";
import { beneficiaryFieldsFromRequest, grantExpiresDays } from "./payee-approval-deps.js";

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

describe("grantExpiresDays", () => {
  // Feeds --expires-days directly (perflo-cli.ts's buildGrantEnableArgs) —
  // traced end to end from the owner's chosen calendar date down to the
  // CLI flag, per payment-review's field-tracing requirement.
  it("converts a far-future ISO date to a whole number of days out", () => {
    const future = new Date(Date.now() + 40 * 86_400_000).toISOString();
    const days = grantExpiresDays(future);
    // Allow +/-1 for the moment the test itself runs vs. the fixed offset above.
    expect(days).toBeGreaterThanOrEqual(39);
    expect(days).toBeLessThanOrEqual(40);
  });

  it("floors at 1 rather than sending 0 or a negative count for today or a past date", () => {
    expect(grantExpiresDays(new Date().toISOString())).toBe(1);
    expect(grantExpiresDays(new Date(Date.now() - 86_400_000).toISOString())).toBe(1);
  });
});
