import { describe, expect, it } from "vitest";
import { approvePayee, type ApprovePayeeDeps } from "./payee-approval.js";

function deps(): ApprovePayeeDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    findExistingApproval: async () => null,
    createPerfloRecipient: async () => { calls.push("recipient"); return { recipientNickname: "riya-perflo" }; },
    startPendingGrant: async () => { calls.push("startPendingGrant"); return { status: "started", payeeId: "riya-1" }; },
    enablePerfloGrant: () => { calls.push("enablePerfloGrant"); },
  };
}

const request = {
  ownerConfirmed: true,
  name: "Riya Sharma",
  firstName: "Riya",
  lastName: "Sharma",
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

  it("creates a recipient and starts the grant approval for an explicitly approved normalized identity and rail", async () => {
    const d = deps();
    await expect(approvePayee(request, d)).resolves.toEqual({ status: "pending_grant", payeeId: "riya-1" });
    expect(d.calls).toEqual(["recipient", "startPendingGrant", "enablePerfloGrant"]);
  });

  it("supports an approved bank rail without exposing a payment execution path", async () => {
    const d = deps();
    let claimedInput: unknown;
    d.startPendingGrant = async (input) => {
      claimedInput = input.paymentMethod;
      d.calls.push("startPendingGrant");
      return { status: "started", payeeId: "vendor-1" };
    };

    await expect(approvePayee({
      ...request,
      name: "Vendor Services",
      firstName: "Vendor",
      lastName: "Services",
      senderAddr: "billing@vendor.example",
      paymentMethod: { kind: "bank_neft", accountNumber: "5010023456789", ifsc: "HDFC0001234", beneficiaryName: "Vendor Services" },
    }, d)).resolves.toEqual({ status: "pending_grant", payeeId: "vendor-1" });

    expect(claimedInput).toEqual({ kind: "bank_neft", accountNumber: "5010023456789", ifsc: "HDFC0001234", beneficiaryName: "Vendor Services" });
    expect(d.calls).toEqual(["recipient", "startPendingGrant", "enablePerfloGrant"]);
  });

  it("is idempotent: repeating an already-approved senderAddr never creates another recipient or grant", async () => {
    const d = deps();
    d.findExistingApproval = async () => ({ payeeId: "riya-1" });
    await expect(approvePayee(request, d)).resolves.toEqual({ status: "already_approved", payeeId: "riya-1" });
    expect(d.calls).toEqual([]);
  });

  it("reports the one-pending-grant-at-a-time lock instead of starting a second CLI call", async () => {
    const d = deps();
    d.startPendingGrant = async () => { d.calls.push("startPendingGrant"); return { status: "locked" }; };

    await expect(approvePayee(request, d)).resolves.toEqual({ status: "grant_in_progress" });
    // The recipient (a real Perflo beneficiary registration) still happens —
    // only the grant/CLI step is blocked by the lock — but enablePerfloGrant
    // must never fire once the lock reports busy: kicking off a second
    // `policy enable` while another one is already awaiting browser
    // approval is exactly what the lock exists to prevent.
    expect(d.calls).toEqual(["recipient", "startPendingGrant"]);
  });

  it("skips recipient creation and uses the existing Perflo beneficiary nickname when useExistingBeneficiary is true", async () => {
    const d = deps();
    let startedNickname: string | undefined;
    let enabledNickname: string | undefined;
    d.startPendingGrant = async (input) => {
      startedNickname = input.recipientNickname;
      d.calls.push("startPendingGrant");
      return { status: "started", payeeId: "riya-1", recipientNickname: input.recipientNickname };
    };
    d.enablePerfloGrant = (input) => {
      enabledNickname = input.recipientNickname;
      d.calls.push("enablePerfloGrant");
    };

    await expect(approvePayee({
      ...request,
      useExistingBeneficiary: true,
      recipientNickname: "hemant-real",
    }, d)).resolves.toEqual({ status: "pending_grant", payeeId: "riya-1" });

    expect(d.calls).toEqual(["startPendingGrant", "enablePerfloGrant"]);
    expect(startedNickname).toBe("hemant-real");
    expect(enabledNickname).toBe("hemant-real");
  });

  it("rejects request when useExistingBeneficiary is true but recipientNickname is missing or blank", async () => {
    for (const badNickname of ["", "   ", undefined as unknown as string]) {
      const d = deps();
      await expect(approvePayee({
        ...request,
        useExistingBeneficiary: true,
        recipientNickname: badNickname,
      }, d)).resolves.toEqual({ status: "invalid_request" });
      expect(d.calls).toEqual([]);
    }
  });

  it("rejects invalid payment rails, unsafe grant caps, and missing beneficiary name fields before any external call", async () => {
    for (const badRequest of [
      { ...request, paymentMethod: { kind: "upi" as const, vpa: "invalid" } },
      { ...request, paymentMethod: { kind: "bank_neft" as const, accountNumber: "5010023456789", ifsc: "NOTIFSC" } },
      { ...request, paymentMethod: { kind: "bank_neft" as const, accountNumber: "123", ifsc: "HDFC0001234" } },
      { ...request, grant: { ...request.grant, perPaymentCapInr: "0" } },
      { ...request, grant: { ...request.grant, maxPayments: 0 } },
      { ...request, firstName: "" },
      { ...request, lastName: "  " },
    ]) {
      const d = deps();
      await expect(approvePayee(badRequest, d)).resolves.toEqual({ status: "invalid_request" });
      expect(d.calls).toEqual([]);
    }
  });
});
