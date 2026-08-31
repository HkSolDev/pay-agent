import { prisma } from "@perflo-ap-agent/db";
import { decryptPaymentMethod } from "./payee-crypto";
import { normalizePaymentMethod, type PaymentMethod } from "./payment-method-validation";
import type { ApprovedPayee } from "./payee-resolver.js";

/** Converts the encrypted canonical rail representation back to a typed value in memory only. */
export function paymentMethodFromNormalized(value: string): PaymentMethod | null {
  if (value.startsWith("upi:")) {
    return normalizePaymentMethod({ kind: "upi", vpa: value.slice(4) });
  }
  const bank = /^bank_neft:(\d{9,18}):([A-Z]{4}0[A-Z0-9]{6})$/i.exec(value);
  return bank
    ? normalizePaymentMethod({ kind: "bank_neft", accountNumber: bank[1], ifsc: bank[2] })
    : null;
}

/**
 * Loads only owner-approved identities and decrypts rails only in worker
 * memory for the short resolver step. It intentionally throws on corrupt
 * encrypted data rather than treating a known payee as a new vendor.
 */
export async function loadApprovedPayees(): Promise<ApprovedPayee[]> {
  const identities = await prisma.payeeIdentity.findMany({
    where: { payee: { grantApproved: true } },
    include: { payee: { include: { paymentMethods: { where: { status: "active" } } } } },
  });
  const approved: ApprovedPayee[] = [];
  for (const identity of identities) {
    for (const storedMethod of identity.payee.paymentMethods) {
      // Prisma 7 exposes BYTEA as Uint8Array; crypto deliberately accepts a
      // Buffer so the conversion is explicit at this persistence boundary.
      const paymentMethod = paymentMethodFromNormalized(decryptPaymentMethod(Buffer.from(storedMethod.encryptedPayload)));
      if (!paymentMethod) {
        throw new Error(`Invalid encrypted payment method for approved payee ${identity.payeeId}.`);
      }
      approved.push({
        payeeId: identity.payeeId,
        senderAddr: identity.senderAddr,
        recipientNickname: identity.payee.recipientNickname,
        paymentMethod,
        grant: {
          autoPayEnabled: identity.payee.autoPayEnabled,
          payeeStatus: identity.payee.status,
          perPaymentCapInr: identity.payee.grantPerPaymentCapInr,
          totalCapInr: identity.payee.grantTotalCapInr,
          maxPayments: identity.payee.grantMaxPayments,
          expiresAt: identity.payee.grantExpiresAt?.toISOString() ?? null,
        },
      });
    }
  }
  return approved;
}
