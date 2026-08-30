import { PaymentDefiniteFailure, PaymentUnknownOutcomeError, type PayoutResult } from "./payment-executor";

/**
 * `requestManualPayment` (worker/src/manual-pay.ts) still uses the older
 * throw-on-failure `payRecipient` contract — this bridges a PaymentExecutor's
 * PayoutResult back into that shape so callers of `requestManualPayment`
 * don't need two different call conventions depending on provider.
 *
 * "processing" has no representation in the existing paid/failed/
 * unknown_outcome PaymentIntent states — treated as unknown, the same
 * never-auto-retry bucket as a genuine timeout, rather than inventing a new
 * status this pass doesn't otherwise support end-to-end.
 */
export function payoutResultToLegacyPayResult(result: PayoutResult): { paymentReference: string } {
  if (result.status === "paid") {
    return { paymentReference: result.providerReference };
  }
  if (result.status === "failed") {
    throw new PaymentDefiniteFailure(result.failureReason ?? "Payment failed.", result.providerReference);
  }
  throw new PaymentUnknownOutcomeError(
    result.failureReason ?? `Payout outcome unknown (status: ${result.status}).`,
    result.providerReference,
  );
}
