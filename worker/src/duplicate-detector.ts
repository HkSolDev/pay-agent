/** A stable, already-resolved payable used only for replay detection. */
export interface PayableFingerprint {
  emailId: string;
  payeeId: string;
  referenceNumber: string | null;
  referenceIsFallback: boolean;
  amount: { currency: string; value: string } | null;
}

export type DuplicateResult =
  | { duplicate: true; originalEmailId: string; reason: "matching_explicit_reference" }
  | { duplicate: false; suspiciousConflict?: "reference_amount_mismatch" | "fallback_reference_match"; originalEmailId?: string };

/**
 * A fallback reference is a correlation hint, not a payment identity. Only
 * an explicit reference plus the same approved payee and exact amount can
 * suppress a payment automatically; mismatches remain visible for review.
 */
export function findDuplicate(current: PayableFingerprint, history: PayableFingerprint[]): DuplicateResult {
  if (!current.referenceNumber) return { duplicate: false };
  const prior = history.find((item) => item.emailId !== current.emailId && item.payeeId === current.payeeId
    && item.referenceNumber === current.referenceNumber);
  if (!prior) return { duplicate: false };
  if (current.referenceIsFallback || prior.referenceIsFallback) {
    return { duplicate: false, suspiciousConflict: "fallback_reference_match", originalEmailId: prior.emailId };
  }
  if (!current.amount || !prior.amount || current.amount.currency !== prior.amount.currency || current.amount.value !== prior.amount.value) {
    return { duplicate: false, suspiciousConflict: "reference_amount_mismatch", originalEmailId: prior.emailId };
  }
  return { duplicate: true, originalEmailId: prior.emailId, reason: "matching_explicit_reference" };
}
