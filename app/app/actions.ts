"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@perflo-ap-agent/db";
import { validatePaymentInput } from "../../worker/src/validate-payment-input";
import { executePreparedPayment } from "../../worker/src/payment-execution";
import { isSyncPaused, setSyncPaused } from "../../worker/src/sync-state";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

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
  // Re-throwing here used to crash the whole page with Next.js's raw error
  // overlay (e.g. a nickname with no approved payee rail) even though the
  // failure was already recorded — the point of executePreparedPayment
  // writing the row is exactly so the queue's own "Failed" pill can show it
  // on the next render, not to also blow up the form submission.
  await executePreparedPayment(emailId);
  revalidatePath("/");
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

export async function syncNowAction() {
  // Runs in a separate process, not imported in-process — see sync-once-cli.ts
  // for why (the Composio Gmail SDK it pulls in breaks the app's bundler).
  const repoRoot = path.resolve(process.cwd(), "..");
  try {
    await execFileAsync("pnpm", ["exec", "tsx", "worker/src/sync-once-cli.ts"], {
      cwd: repoRoot,
      timeout: 30_000,
    });
  } catch (err) {
    console.error("[sync-now] failed:", err instanceof Error ? err.message : err);
  }
  revalidatePath("/");
}

export async function togglePauseAction() {
  const paused = await isSyncPaused();
  await setSyncPaused(!paused);
  revalidatePath("/");
}
