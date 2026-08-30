import { randomBytes } from "node:crypto";
import { prisma } from "@perflo-ap-agent/db";
import type { ApprovePayeeDeps } from "./payee-approval.js";
import { encryptPaymentMethod, hashPaymentMethod, toPrismaBytes } from "./payee-crypto";
import { normalizePaymentMethod } from "./payment-method-validation";

// The Postgres-backed implementation of ApprovePayeeDeps used by the real
// Payees UI. `createPerfloRecipient`/`enablePerfloGrant` deliberately do NOT
// call the real Perflo CLI: connecting a live agent requires KYC, which is
// still pending (see hands-off.md — "do not connect the Perflo screen
// merely to continue Level 1"). A locally-generated nickname/grant id lets
// payee setup, review routing, and the UI be built and demoed today without
// moving money or depending on a Perflo login; it never calls perflo-cli.ts.

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "payee";
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
    return { recipientNickname: `${slugify(request.name)}-${randomBytes(3).toString("hex")}` };
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
