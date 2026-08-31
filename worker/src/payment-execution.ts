import { prisma } from "@perflo-ap-agent/db";
import { requestManualPayment } from "./manual-pay";
import { claimPaymentIntent } from "./payment-claim";
import { payViaConfiguredExecutor } from "./payment-executor-select";
import { PaymentDefiniteFailure, PaymentUnknownOutcomeError } from "./payment-executor";

export interface PaymentExecutionResult {
  status: "paid" | "failed" | "unknown_outcome" | "not_claimed";
  paymentReference?: string;
  lastError?: string;
}

/**
 * Claims an already-prepared PaymentIntent and pays it — the exact same
 * claim/execute/classify-the-outcome logic for both a human's "Confirm &
 * pay" click (app/app/actions.ts's confirmPayment) and an auto-pay execution
 * (auto-pay-runner.ts). Kept in one place on purpose: the two paths must
 * never quietly diverge on what counts as paid/failed/unknown (FR-27).
 */
export async function executePreparedPayment(emailId: string): Promise<PaymentExecutionResult> {
  try {
    const result = await requestManualPayment(
      { emailId, confirmedByOwner: true },
      {
        loadPayableEmail: async (id) => {
          const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId: id } });
          return {
            emailId: id,
            recipientNickname: intent.recipientNickname,
            amount: intent.amount,
            currency: intent.currency,
          };
        },
        claimPayment: claimPaymentIntent,
        payRecipient: async ({ nickname, amount, currency, idempotencyKey }) =>
          payViaConfiguredExecutor({ nickname, amount, currency: currency === "USD" ? "USD" : "INR", idempotencyKey }),
      },
    );

    await prisma.paymentIntent.update({
      where: { emailId },
      data: { status: "paid", paidAt: new Date(), paymentReference: result.paymentReference, lastError: null },
    });
    return { status: "paid", paymentReference: result.paymentReference };
  } catch (err) {
    // FR-27: a timeout or unparseable result is NOT the same as a definite
    // "nothing happened" — the payment may already have landed at the
    // provider before we lost the ability to confirm it. That case goes to
    // unknown_outcome and is never offered a retry button; only a clean,
    // provider-reported failure (or anything else clearly pre-payment like
    // a missing recipient/amount) is safe to mark "failed".
    const status = err instanceof PaymentUnknownOutcomeError ? "unknown_outcome" : "failed";
    const lastError = err instanceof Error ? err.message : String(err);
    const providerReference =
      err instanceof PaymentUnknownOutcomeError || err instanceof PaymentDefiniteFailure ? err.providerReference : undefined;
    const updated = await prisma.paymentIntent.updateMany({
      where: { emailId, status: "claimed" },
      data: { status, lastError, ...(providerReference ? { paymentReference: providerReference } : {}) },
    });
    if (updated.count === 0) {
      // Nothing was recorded — this row was never actually claimed (e.g. a
      // concurrent claim beat us to it). Nothing useful to show; log only.
      console.error(`executePreparedPayment: could not record failure for email ${emailId} (row not in "claimed" state):`, err);
      return { status: "not_claimed" };
    }
    return { status, lastError, paymentReference: providerReference };
  }
}
