import { prisma } from "@perflo-ap-agent/db";
import type { PaymentExecutor, PayoutResult } from "./payment-executor.js";
import { payViaPerfloCli } from "./perflo-cli.js";
import { createPerfloExecutor } from "./payment-executor-perflo.js";
import { createRazorpayExecutor } from "./payment-executor-razorpay.js";

export interface ReconcileSummary {
  checked: number;
  updated: number;
}

// Shared by the background worker loop and the "Sync now" CLI. The exported
// name is retained for compatibility with those callers; this now mirrors the
// real payment selection rule: complete Razorpay credentials select Razorpay,
// otherwise Perflo is the default and `perflo tx status` reconciles its hashes.
export function razorpayExecutorFromEnv(): PaymentExecutor {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_ACCOUNT_NUMBER: accountNumber } = process.env;
  if (keyId && keySecret && accountNumber) {
    return createRazorpayExecutor({ keyId, keySecret, accountNumber });
  }
  return createPerfloExecutor({ recipientNickname: "", payViaPerfloCli });
}

// Both Razorpay payout ids and Perflo transaction hashes are provider
// references. The only known non-provider placeholder is the intent's own
// idempotency key, stored when the provider returned no usable reference.
export function isReconcilableProviderReference(reference: string, idempotencyKey: string): boolean {
  return reference !== idempotencyKey;
}

// A claimed row this old has almost certainly outlived any real provider
// round-trip — most likely the worker process crashed between claiming the
// row and finding out what the provider call did with it, possibly even
// after the payment itself was already submitted. There is no lease or
// heartbeat on a claim today, so nothing else ever picks this case back up.
// FR-27: never guess success or failure from that silence — promote it into
// the same unknown_outcome bucket a genuinely ambiguous provider response
// already uses, so a human checks provider activity before anything happens
// to it automatically again, rather than leaving it claimed forever.
const CLAIM_STALE_MS = 15 * 60 * 1000;

async function promoteStaleClaims(): Promise<number> {
  const result = await prisma.paymentIntent.updateMany({
    where: { status: "claimed", claimedAt: { lt: new Date(Date.now() - CLAIM_STALE_MS) } },
    data: {
      status: "unknown_outcome",
      lastError: "Payment claim never resolved (the worker may have crashed mid-payment) — check provider activity before retrying.",
    },
  });
  return result.count;
}

/**
 * Backstop for payments whose provider never gave us a final outcome. This
 * poll runs unconditionally on a schedule and only reads what the configured
 * provider already knows; it never creates a new payout (FR-27).
 *
 * Also promotes any long-stale `claimed` row to `unknown_outcome` first (see
 * `promoteStaleClaims` above) — a `claimed` row has no expiry of its own, so
 * without this a crash right after claiming (including after the payment was
 * actually submitted) left it stuck forever with no recovery path. A row
 * promoted this way may still have no real provider reference to look up
 * (e.g. the crash happened before `createPayout` ever returned) — it simply
 * waits in `unknown_outcome` for a human, exactly like any other case this
 * function already can't resolve on its own.
 */
export async function reconcileStuckPayments(executor: PaymentExecutor): Promise<ReconcileSummary> {
  const promotedClaims = await promoteStaleClaims();

  const stuck = await prisma.paymentIntent.findMany({
    where: { status: "unknown_outcome", paymentReference: { not: null } },
  });

  let updated = promotedClaims;
  for (const intent of stuck) {
    const reference = intent.paymentReference;
    if (!reference || !isReconcilableProviderReference(reference, intent.idempotencyKey)) {
      // Only our own idempotency key was ever saved — there is no provider
      // reference that either status API can query.
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

  return { checked: stuck.length + promotedClaims, updated };
}
