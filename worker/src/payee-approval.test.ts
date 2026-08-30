import { describe, expect, it } from "vitest";
import { approvePayee, type ApprovePayeeDeps } from "./payee-approval.js";

function deps(): ApprovePayeeDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    findExistingApproval: async () => null,
    saveApprovedPayee: async (record) => { calls.push(`save:${record.senderAddr}`); return { payeeId: "riya-1", created: true }; },
    createPerfloRecipient: async () => { calls.push("recipient"); return { recipientNickname: "riya-perflo" }; },
    enablePerfloGrant: async () => { calls.push("grant"); return { grantId: "grant-1" }; },
  };
}

const request = {
  ownerConfirmed: true,
  name: "Riya Sharma",
  senderAddr: "riya@example.com",
  paymentMethod: { kind: "upi" as const, vpa: "riya@okaxis" },
  grant: { perPaymentCapInr: "1000.00", totalCapInr: "5000.00", maxPayments: 5, expiresAt: "2026-12-31" },
};

describe("Payee approval — an owner-controlled setup event", () => {
  it("does not create a recipient, grant, or mapping without explicit owner confirmation", async () => {
    const d = deps();
    await expect(approvePayee({ ...request, ownerConfirmed: false }, d)).resolves.toEqual({ status: "confirmation_required" });
    expect(d.calls).toEqual([]);
  });

  it("creates a recipient and grant only for an explicitly approved normalized identity and rail", async () => {
    const d = deps();
    await expect(approvePayee(request, d)).resolves.toEqual({ status: "approved", payeeId: "riya-1", grantId: "grant-1" });
    expect(d.calls).toEqual(["recipient", "grant", "save:riya@example.com"]);
  });

  it("is idempotent: repeating the same approval never creates another recipient or grant", async () => {
    const d = deps();
    d.findExistingApproval = async () => ({ payeeId: "riya-1" });
    await expect(approvePayee(request, d)).resolves.toEqual({ status: "already_approved", payeeId: "riya-1" });
    expect(d.calls).toEqual([]);
  });

  it("rejects invalid payment rails and unsafe grant caps before any external call", async () => {
    for (const badRequest of [
      { ...request, paymentMethod: { kind: "upi" as const, vpa: "invalid" } },
      { ...request, grant: { ...request.grant, perPaymentCapInr: "0" } },
      { ...request, grant: { ...request.grant, maxPayments: 0 } },
    ]) {
      const d = deps();
      await expect(approvePayee(badRequest, d)).resolves.toEqual({ status: "invalid_request" });
      expect(d.calls).toEqual([]);
    }
  });
});
