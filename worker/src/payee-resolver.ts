import { normalizePaymentMethod, type PaymentMethod } from "./payment-method-validation.js";

// FR-15 through FR-17's payee resolution, as a pure decision function — the
// same reasoning as the rule-based classifier and policy engine: testable
// without a database at all. The actual DB read (decrypting stored payment
// methods into plain values, per worker/src/payee-crypto.ts) happens in a
// separate loader that calls this; this function never touches Prisma.

export type { PaymentMethod } from "./payment-method-validation.js";

export interface ApprovedPayee {
  payeeId: string;
  senderAddr: string;
  recipientNickname: string;
  paymentMethod: PaymentMethod;
}

export interface ResolveRequest {
  senderAddr: string;
  paymentMethod: PaymentMethod;
}

export type ResolveResult =
  | { status: "resolved"; payeeId: string; recipientNickname: string }
  | { status: "new_payee" } // FR-15: never auto-infer — first time always needs approval
  | { status: "details_changed"; payeeId: string; priorNickname: string } // FR-16/FR-20: needs_approval, not quarantine
  | { status: "unknown_sender"; payeeId: string; knownNickname: string } // FR-17
  | { status: "identity_method_conflict"; senderPayeeId: string; methodPayeeId: string } // sender belongs to one payee, method to a different one
  | { status: "multiple_payment_methods" } // never choose a rail on the owner's behalf
  | { status: "invalid_payment_method" };

function normalizeMethod(method: PaymentMethod): string | null {
  const normalized = normalizePaymentMethod(method);
  if (!normalized) return null;
  if (normalized.kind === "upi") return `upi:${normalized.vpa}`;
  return `bank_neft:${normalized.accountNumber}:${normalized.ifsc}`;
}

export function resolvePayee(request: ResolveRequest, approved: ApprovedPayee[]): ResolveResult {
  const normalizedMethod = normalizeMethod(request.paymentMethod);
  if (!normalizedMethod) return { status: "invalid_payment_method" };

  const senderAddr = request.senderAddr.toLowerCase();
  const bySender = approved.find((a) => a.senderAddr.toLowerCase() === senderAddr);
  const byMethod = approved.find((a) => normalizeMethod(a.paymentMethod) === normalizedMethod);

  if (bySender && byMethod && bySender.payeeId === byMethod.payeeId) {
    return { status: "resolved", payeeId: bySender.payeeId, recipientNickname: bySender.recipientNickname };
  }
  if (bySender && byMethod && bySender.payeeId !== byMethod.payeeId) {
    return { status: "identity_method_conflict", senderPayeeId: bySender.payeeId, methodPayeeId: byMethod.payeeId };
  }
  if (bySender && !byMethod) {
    return { status: "details_changed", payeeId: bySender.payeeId, priorNickname: bySender.recipientNickname };
  }
  if (byMethod && !bySender) {
    return { status: "unknown_sender", payeeId: byMethod.payeeId, knownNickname: byMethod.recipientNickname };
  }
  return { status: "new_payee" };
}
