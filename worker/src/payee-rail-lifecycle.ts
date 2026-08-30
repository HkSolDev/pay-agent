import { prisma } from "@perflo-ap-agent/db";
import { encryptPaymentMethod, hashPaymentMethod, toPrismaBytes } from "./payee-crypto";
import { normalizePaymentMethod, validatePaymentMethod, type PaymentMethod } from "./payment-method-validation";

// Rails are never overwritten in place. Revoking marks a row `revoked` and
// stamps `revokedAt`; replacing creates a brand-new `active` row and marks
// the old one `replaced`, linked via `replacedByMethodId` — so the full
// created/approved/replaced/revoked history is always queryable per payee,
// and a stale rail can never quietly keep resolving invoices.

export interface RevokeRailInput {
  methodId: string;
  ownerConfirmed: boolean;
}

export type RevokeRailResult =
  | { status: "confirmation_required" }
  | { status: "not_found" }
  | { status: "revoked" };

export async function revokePaymentRail(input: RevokeRailInput): Promise<RevokeRailResult> {
  if (!input.ownerConfirmed) return { status: "confirmation_required" };
  const existing = await prisma.payeePaymentMethod.findUnique({ where: { id: input.methodId } });
  if (!existing) return { status: "not_found" };

  await prisma.payeePaymentMethod.update({
    where: { id: input.methodId },
    data: { status: "revoked", revokedAt: new Date() },
  });
  return { status: "revoked" };
}

export interface ReplaceRailInput {
  oldMethodId: string;
  ownerConfirmed: boolean;
  newMethod: PaymentMethod;
}

export type ReplaceRailResult =
  | { status: "confirmation_required" }
  | { status: "invalid_method" }
  | { status: "not_found" }
  | { status: "replaced"; newMethodId: string };

export async function replacePaymentRail(input: ReplaceRailInput): Promise<ReplaceRailResult> {
  if (!input.ownerConfirmed) return { status: "confirmation_required" };
  if (!validatePaymentMethod(input.newMethod)) return { status: "invalid_method" };

  const old = await prisma.payeePaymentMethod.findUnique({ where: { id: input.oldMethodId } });
  if (!old) return { status: "not_found" };

  const normalized = normalizePaymentMethod(input.newMethod);
  if (!normalized) return { status: "invalid_method" };
  const canonical = normalized.kind === "upi"
    ? `upi:${normalized.vpa}`
    : `bank_neft:${normalized.accountNumber}:${normalized.ifsc}`;

  const created = await prisma.payeePaymentMethod.create({
    data: {
      payeeId: old.payeeId,
      rail: normalized.kind,
      encryptedPayload: toPrismaBytes(encryptPaymentMethod(canonical)),
      lookupHash: hashPaymentMethod(canonical),
    },
  });
  await prisma.payeePaymentMethod.update({
    where: { id: old.id },
    data: { status: "replaced", replacedAt: new Date(), replacedByMethodId: created.id },
  });
  return { status: "replaced", newMethodId: created.id };
}
