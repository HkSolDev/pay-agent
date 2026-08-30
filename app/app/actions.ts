"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@perflo-ap-agent/db";
import { requestManualPayment } from "../../worker/src/manual-pay";
import { payViaPerfloCli, PerfloUnknownOutcomeError } from "../../worker/src/perflo-cli";
import { claimPaymentIntent } from "../../worker/src/payment-claim";
import { validatePaymentInput } from "../../worker/src/validate-payment-input";

export async function preparePayment(formData: FormData) {
  const emailId = String(formData.get("emailId"));
  const recipientNickname = String(formData.get("recipientNickname") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "INR");

  // Checked here, before any row exists — catches "abc" or "-5" before they
  // become an avoidable failed Perflo call and a confusing row in the queue.
  const validation = validatePaymentInput(recipientNickname, amount);
  if (!validation.ok) {
    throw new Error(validation.error ?? "Invalid payment details.");
  }

  // The form normally supplies an id from the queue, but server actions are
  // still HTTP entry points. Refuse a fabricated/stale id rather than create
  // an orphan payment intent that cannot be reviewed in the queue.
  const email = await prisma.email.findUnique({ where: { id: emailId }, select: { id: true } });
  if (!email) {
    throw new Error("The email to pay no longer exists.");
  }

  // idempotencyKey is generated once here, at prepare time, and never
  // touched again on re-prepare — it identifies the logical payment, not
  // the attempt (same principle FR-23 uses for the real idempotency key).
  const idempotencyKey = randomBytes(16).toString("hex");
  await prisma.paymentIntent.upsert({
    where: { emailId },
    create: { emailId, recipientNickname, amount, currency, idempotencyKey },
    update: { recipientNickname, amount, currency },
  });
  revalidatePath("/");
}

// Return type must be void|Promise<void> — that's the contract a <form
// action> requires; the page re-reads state from the DB on the next render
// anyway (revalidatePath), so there's nothing useful to hand back here.
export async function confirmPayment(emailId: string, _formData: FormData): Promise<void> {
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
          payViaPerfloCli({ nickname, amount, currency, idempotencyKey }),
      },
    );

    await prisma.paymentIntent.update({
      where: { emailId },
      data: { status: "paid", paidAt: new Date(), paymentReference: result.paymentReference, lastError: null },
    });

    revalidatePath("/");
  } catch (err) {
    // FR-27: a timeout or unparseable result is NOT the same as a definite
    // "nothing happened" — the payment may already have landed at Perflo
    // before we lost the ability to confirm it. That case goes to
    // unknown_outcome and is never offered a retry button; only a clean,
    // CLI-reported failure (PerfloDefiniteFailure, or anything else clearly
    // pre-payment like a missing recipient/amount) is safe to mark "failed".
    const status = err instanceof PerfloUnknownOutcomeError ? "unknown_outcome" : "failed";
    // Store the real reason — "Not connected. Run `perflo login` first." is
    // very different from "outside grant," and the owner should see which
    // one happened, not a generic "Failed" for both (PRD FR-27 treats
    // NOT_CONNECTED/NO_SESSION/SIGNER_REVOKED as needing a clear alert).
    const lastError = err instanceof Error ? err.message : String(err);
    await prisma.paymentIntent.updateMany({
      where: { emailId, status: "claimed" },
      data: { status, lastError },
    });
    revalidatePath("/");
    throw err;
  }
}

const REVIEW_ACTIONS = {
  approve: "approved_for_review",
  reject: "rejected",
  not_an_invoice: "not_an_invoice",
} as const;

/**
 * Records an owner review decision separately from PaymentIntent. These
 * actions never prepare, claim, or execute a payment.
 */
export async function updateReviewAction(formData: FormData): Promise<void> {
  const emailId = String(formData.get("emailId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim() as keyof typeof REVIEW_ACTIONS;
  if (!emailId || !Object.prototype.hasOwnProperty.call(REVIEW_ACTIONS, action)) throw new Error("Invalid review action.");

  await prisma.email.update({
    where: { id: emailId },
    data: { reviewStatus: REVIEW_ACTIONS[action], reviewedAt: new Date() },
  });
  revalidatePath("/");
}

/** Queues a review-only reprocessing pass for the worker. */
export async function retryReviewProcessing(formData: FormData): Promise<void> {
  const emailId = String(formData.get("emailId") ?? "").trim();
  if (!emailId) throw new Error("The email to retry is missing.");
  await prisma.email.update({
    where: { id: emailId },
    data: {
      reviewStatus: "retry_requested",
      reviewedAt: null,
      extractionSummary: Prisma.JsonNull,
      extractionBackend: null,
      resolvedPayeeId: null,
      payeeResolution: Prisma.JsonNull,
      verificationResult: Prisma.JsonNull,
      duplicateResult: Prisma.JsonNull,
      policyDecision: null,
      policyReasons: [],
      level1ProcessedAt: null,
    },
  });
  revalidatePath("/");
}
