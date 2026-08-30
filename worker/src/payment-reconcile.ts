import { prisma } from "@perflo-ap-agent/db";
import type { PaymentExecutor, PayoutResult } from "./payment-executor.js";

export interface ReconcileSummary {
  checked: number;
  updated: number;
}

// Razorpay payout ids always look like "pout_...". Our own idempotency keys
// (the fallback stored when we never got a real id back — see
// payment-executor-razorpay.ts) are plain hex strings and never take this
// shape, so this is a cheap way to tell the two apart before calling an API
// that expects a real id.
function looksLikeRealProviderReference(reference: string): boolean {
  return reference.startsWith("pout_");
}

/**
 * Backstop for payments RazorpayX never told us the final outcome of. A
 * webhook (once one exists) covers this in near real-time, but RazorpayX
 * retries a failed webhook delivery for only 24 hours and then disables it
 * until a human re-enables it from the dashboard — so this poll, run
 * unconditionally on a schedule, is what keeps a payment from sitting frozen
 * forever if that ever happens. It only ever reads what the provider already
 * knows; it never creates a new payout (FR-27: no auto-retry, ever).
 *
 * Deliberately scoped to `unknown_outcome` only, not `claimed`. A `claimed`
 * row only stays stuck if the process crashed before `createPayout` ever
 * returned or threw, which means `paymentReference` was never set for it
 * either — there is nothing yet to look up. Recovering that case needs
 * looking a payout up by the `reference_id` we send on creation (see
 * payment-executor-razorpay.ts), which `getPayoutStatus` does not support —
 * a known gap, left for when it's actually needed rather than built ahead of
 * it being observed.
 */
export async function reconcileStuckPayments(executor: PaymentExecutor): Promise<ReconcileSummary> {
  const stuck = await prisma.paymentIntent.findMany({
    where: { status: "unknown_outcome", paymentReference: { not: null } },
  });

  let updated = 0;
  for (const intent of stuck) {
    const reference = intent.paymentReference;
    if (!reference || !looksLikeRealProviderReference(reference)) {
      // Only our own idempotency key was ever saved for this one — no real
      // provider id exists to check yet. Needs a manual look at the
      // RazorpayX dashboard, not something this poll can resolve.
      continue;
    }

    let result: PayoutResult;
    try {
      result = await executor.getPayoutStatus(reference);
    } catch (err) {
      console.error(`[reconcile] getPayoutStatus failed for ${intent.emailId} (${reference}):`, err);
      continue;
    }

    if (result.status === "paid") {
      const write = await prisma.paymentIntent.updateMany({
        where: { emailId: intent.emailId, status: "unknown_outcome" },
        data: { status: "paid", paidAt: new Date(), paymentReference: result.providerReference, lastError: null },
      });
      updated += write.count;
    } else if (result.status === "failed") {
      const write = await prisma.paymentIntent.updateMany({
        where: { emailId: intent.emailId, status: "unknown_outcome" },
        data: { status: "failed", lastError: result.failureReason ?? "Payment failed.", paymentReference: result.providerReference },
      });
      updated += write.count;
    }
    // "processing" / "unknown" — still genuinely in flight, or still just as
    // ambiguous as before. Leave the row exactly as it is and check again
    // next poll.
  }

  return { checked: stuck.length, updated };
}
