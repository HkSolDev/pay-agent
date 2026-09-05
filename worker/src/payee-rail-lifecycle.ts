import { prisma } from "@perflo-ap-agent/db";
import { validatePaymentMethod, type PaymentMethod } from "./payment-method-validation";

// Rails are never overwritten in place. Revoking marks a row `revoked` and
// stamps `revokedAt`; a safe replacement will create a brand-new `active` row
// and mark the old one `replaced`, linked via `replacedByMethodId`. Until the
// corresponding Perflo beneficiary + grant handoff exists, replacement is
// refused rather than creating a local-only history that misroutes payments.

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
  | { status: "beneficiary_reapproval_required" }
  | { status: "replaced"; newMethodId: string };

export async function replacePaymentRail(input: ReplaceRailInput): Promise<ReplaceRailResult> {
  if (!input.ownerConfirmed) return { status: "confirmation_required" };
  if (!validatePaymentMethod(input.newMethod)) return { status: "invalid_method" };

  const old = await prisma.payeePaymentMethod.findUnique({ where: { id: input.oldMethodId } });
  if (!old) return { status: "not_found" };

  // A rail replacement changes the real payout destination, not just the
  // local invoice-matching key. Perflo has no beneficiary-edit command: the
  // safe path is to add a new beneficiary, obtain a new beneficiary-specific
  // policy approval, then activate the new local rail and nickname together.
  // Until that transaction is implemented, refusing here is safer than
  // marking the local row replaced while payments still target the old
  // Perflo nickname (or an unapproved new one).
  return { status: "beneficiary_reapproval_required" };
}
