export type ReviewRetryPaymentStatus = "pending" | "claimed" | "paid" | "failed" | "unknown_outcome" | null;

/**
 * Re-extraction is safe only before payment execution has started. A failed
 * intent is also excluded: its retry must reuse the already-prepared payment
 * and provider idempotency key, never be mixed with a new review pass.
 */
export function reviewRetryBlockReason(status: ReviewRetryPaymentStatus): string | null {
  if (status === null || status === "pending") return null;
  if (status === "claimed") return "This payment is currently being processed and cannot be reprocessed.";
  if (status === "paid") return "A paid invoice cannot be reprocessed.";
  if (status === "failed") return "A failed payment must be retried through its existing payment intent, not reprocessed.";
  return "This payment has an uncertain outcome and must be reconciled before any further action.";
}
