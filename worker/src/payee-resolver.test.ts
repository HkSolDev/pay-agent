import { describe, expect, it } from "vitest";
import { resolvePayee, type ApprovedPayee, type PaymentMethod } from "./payee-resolver.js";

const upi = (vpa: string): PaymentMethod => ({ kind: "upi", vpa });
const noGrant: ApprovedPayee["grant"] = {
  autoPayEnabled: false,
  payeeStatus: "approved",
  perPaymentCapInr: null,
  totalCapInr: null,
  maxPayments: null,
  expiresAt: null,
};
const approved: ApprovedPayee[] = [{
  payeeId: "riya-1",
  senderAddr: "riya@example.com",
  recipientNickname: "riya-perflo",
  paymentMethod: upi("riya@okaxis"),
  grant: noGrant,
}];

describe("Payee resolver — owner-approved identity and rail matching", () => {
  it("resolves only an exact approved sender and normalized payment-method match", () => {
    expect(resolvePayee({ senderAddr: "RIYA@EXAMPLE.COM", paymentMethod: upi("Riya@OKAXIS") }, approved))
      .toEqual({ status: "resolved", payeeId: "riya-1", recipientNickname: "riya-perflo" });
  });

  it("marks a familiar sender with changed UPI details as details_changed", () => {
    expect(resolvePayee({ senderAddr: "riya@example.com", paymentMethod: upi("riya-new@ybl") }, approved))
      .toEqual({ status: "details_changed", payeeId: "riya-1", priorNickname: "riya-perflo" });
  });

  it("marks a known UPI from an unapproved sender as unknown_sender", () => {
    expect(resolvePayee({ senderAddr: "attacker@example.com", paymentMethod: upi("riya@okaxis") }, approved))
      .toEqual({ status: "unknown_sender", payeeId: "riya-1", knownNickname: "riya-perflo" });
  });

  it("treats a completely new identity and method as a new payee", () => {
    expect(resolvePayee({ senderAddr: "aman@example.com", paymentMethod: upi("aman@icici") }, approved))
      .toEqual({ status: "new_payee" });
  });

  it("reports an identity-and-method conflict when both are known but belong to different payees", () => {
    const records: ApprovedPayee[] = [...approved, {
      payeeId: "aman-1",
      senderAddr: "aman@example.com",
      recipientNickname: "aman-perflo",
      paymentMethod: upi("aman@icici"),
      grant: noGrant,
    }];

    expect(resolvePayee({ senderAddr: "riya@example.com", paymentMethod: upi("aman@icici") }, records))
      .toEqual({ status: "identity_method_conflict", senderPayeeId: "riya-1", methodPayeeId: "aman-1" });
  });

  it("never resolves a malformed payment method", () => {
    expect(resolvePayee({ senderAddr: "riya@example.com", paymentMethod: { kind: "upi", vpa: "not-a-vpa" } }, approved))
      .toEqual({ status: "invalid_payment_method" });
  });
});
