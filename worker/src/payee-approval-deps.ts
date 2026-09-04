import { randomBytes } from "node:crypto";
import { prisma } from "@perflo-ap-agent/db";
import type { ApprovePayeeDeps, ApprovePayeeRequest } from "./payee-approval.js";
import { createPerfloBeneficiary } from "./perflo-cli.js";
import { encryptPaymentMethod, hashPaymentMethod, toPrismaBytes } from "./payee-crypto";
import { normalizePaymentMethod } from "./payment-method-validation";

// The Postgres-backed implementation of ApprovePayeeDeps used by the real
// Payees UI. `createPerfloRecipient` calls the real Perflo CLI (KYC cleared
// enough to connect for real on 4 Sep — see project memory).
// `enablePerfloGrant` is still a placeholder: `policy enable` blocks on a
// real browser approval and doesn't return quickly, so it can't be wired
// into this same synchronous request/response path — see the plan for the
// two-phase approval flow this deps object is a first slice of.

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "payee";
}

/**
 * Pure: pulls the bank rail fields `beneficiary add` needs out of an
 * already-validated request. The connected Perflo account only has the
 * bank.in.inr rail (confirmed live via `beneficiary schemas --country IN` —
 * no UPI schema yet), so a UPI-rail payee can't get a real beneficiary
 * today and must fail loudly here rather than silently faking success.
 */
export function beneficiaryFieldsFromRequest(request: ApprovePayeeRequest): { accountNumber: string; ifsc: string } {
  const normalized = normalizePaymentMethod(request.paymentMethod);
  if (!normalized) throw new Error("beneficiaryFieldsFromRequest received an already-validated but non-normalizable payment method.");
  if (normalized.kind !== "bank_neft") {
    throw new Error(
      "Perflo does not yet support UPI beneficiaries for this account (only bank/IFSC is available) — use a bank account instead.",
    );
  }
  return { accountNumber: normalized.accountNumber, ifsc: normalized.ifsc };
}

export const realApprovePayeeDeps: ApprovePayeeDeps = {
  async findExistingApproval(request) {
    const identity = await prisma.payeeIdentity.findUnique({
      where: { senderAddr: request.senderAddr },
      select: { payeeId: true, payee: { select: { status: true } } },
    });
    if (!identity || identity.payee.status !== "approved") return null;
    return { payeeId: identity.payeeId };
  },

  async createPerfloRecipient(request) {
    const { accountNumber, ifsc } = beneficiaryFieldsFromRequest(request);
    const nickname = `${slugify(request.name)}-${randomBytes(3).toString("hex")}`;
    await createPerfloBeneficiary({ nickname, firstName: request.firstName, lastName: request.lastName, accountNumber, ifsc });
    return { recipientNickname: nickname };
  },

  async enablePerfloGrant() {
    return { grantId: `local-grant-${randomBytes(8).toString("hex")}` };
  },

  async saveApprovedPayee(input) {
    const normalized = normalizePaymentMethod(input.paymentMethod);
    if (!normalized) throw new Error("saveApprovedPayee received an already-validated but non-normalizable payment method.");
    const canonical = normalized.kind === "upi"
      ? `upi:${normalized.vpa}`
      : `bank_neft:${normalized.accountNumber}:${normalized.ifsc}`;

    const payee = await prisma.payee.create({
      data: {
        name: input.name,
        recipientNickname: input.recipientNickname,
        grantApproved: true,
        status: "approved",
        approvedAt: new Date(),
        grantPerPaymentCapInr: input.grant.perPaymentCapInr,
        grantTotalCapInr: input.grant.totalCapInr,
        grantMaxPayments: input.grant.maxPayments,
        grantExpiresAt: new Date(input.grant.expiresAt),
        identities: { create: { senderAddr: input.senderAddr } },
        paymentMethods: {
          create: {
            rail: normalized.kind,
            encryptedPayload: toPrismaBytes(encryptPaymentMethod(canonical)),
            lookupHash: hashPaymentMethod(canonical),
          },
        },
      },
    });
    return { payeeId: payee.id, created: true };
  },
};
