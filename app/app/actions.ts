"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@perflo-ap-agent/db";
import { validatePaymentInput } from "../../worker/src/validate-payment-input";
import { executePreparedPayment } from "../../worker/src/payment-execution";
import { isSyncPaused, setSyncPaused } from "../../worker/src/sync-state";
import { reviewRetryBlockReason } from "../../worker/src/review-retry";
import { reevaluatePolicy } from "../../worker/src/reevaluate-policy";
import { resumeAutoPayForEligibleInvoices } from "../../worker/src/resume-auto-pay";
import { runPaidVerifierForEmail } from "../../worker/src/paid-verification";
import type { VerificationResult } from "../../worker/src/verifier";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export async function preparePayment(formData: FormData) {
  const emailId = String(formData.get("emailId"));

  // The form normally supplies an id from the queue, but server actions are
  // still HTTP entry points. Refuse a fabricated/stale id rather than create
  // an orphan payment intent that cannot be reviewed in the queue.
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    select: { id: true, resolvedPayeeId: true, extractionSummary: true },
  });
  if (!email?.resolvedPayeeId) {
    throw new Error("This invoice's payee hasn't been approved yet — approve the payee in /payees first.");
  }
  const payee = await prisma.payee.findUnique({ where: { id: email.resolvedPayeeId }, select: { recipientNickname: true } });
  if (!payee) throw new Error("The resolved payee no longer exists.");

  // Never trust editable browser fields for money movement. The invoice's
  // resolved payee and extracted amount are the source of truth; this also
  // prevents a display nickname such as `demo-test-auto` from bypassing the
  // exact approved rail stored for the payee.
  const summary = email.extractionSummary && typeof email.extractionSummary === "object" && !Array.isArray(email.extractionSummary)
    ? email.extractionSummary as { amount?: { value?: unknown; currency?: unknown } | null }
    : {};
  const sourceAmount = summary.amount;
  const amount = typeof sourceAmount?.value === "string" ? sourceAmount.value : "";
  const currency = sourceAmount?.currency === "USD" ? "USD" : sourceAmount?.currency === "INR" ? "INR" : "";
  const validation = validatePaymentInput(payee.recipientNickname, amount);
  if (!validation.ok || !currency) throw new Error("The invoice does not contain a valid payable amount and currency.");

  // Paid verification is deliberately triggered here, at the real prepare
  // boundary, rather than from normal ingest. The owner may still explicitly
  // confirm a payment after an unverified paid check; auto-pay fails closed.
  await runPaidVerifierForEmail(emailId);

  // idempotencyKey is generated once here, at prepare time, and never
  // touched again on re-prepare — it identifies the logical payment, not
  // the attempt (same principle FR-23 uses for the real idempotency key).
  const idempotencyKey = randomBytes(16).toString("hex");
  // Guarded, not a plain upsert: once a row has left "pending"/"failed"
  // (claimed, paid, or unknown_outcome), its payable fields are the record
  // of what was actually claimed/paid and must never be silently rewritten
  // by a later re-extraction or re-prepare of the same invoice. The
  // conditional updateMany only touches a row still eligible for a fresh
  // prepare; if it matches nothing, the upsert below either creates the
  // row for the first time or — if it already exists but is locked — is a
  // genuine no-op on it.
  const repaired = await prisma.paymentIntent.updateMany({
    where: { emailId, status: { in: ["pending", "failed"] } },
    data: { recipientNickname: payee.recipientNickname, amount, currency },
  });
  if (repaired.count === 0) {
    await prisma.paymentIntent.upsert({
      where: { emailId },
      create: { emailId, recipientNickname: payee.recipientNickname, amount, currency, idempotencyKey },
      update: {},
    });
  }
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
  // Repair intents prepared by older UI versions before retrying. The
  // provider route must always use the currently resolved payee nickname and
  // the invoice's persisted amount/currency, never a stale editable field.
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    select: { resolvedPayeeId: true, extractionSummary: true },
  });
  if (email?.resolvedPayeeId) {
    const payee = await prisma.payee.findUnique({ where: { id: email.resolvedPayeeId }, select: { recipientNickname: true } });
    const summary = email.extractionSummary && typeof email.extractionSummary === "object" && !Array.isArray(email.extractionSummary)
      ? email.extractionSummary as { amount?: { value?: unknown; currency?: unknown } | null }
      : {};
    const sourceAmount = summary.amount;
    const amount = typeof sourceAmount?.value === "string" ? sourceAmount.value : "";
    const currency = sourceAmount?.currency === "USD" ? "USD" : sourceAmount?.currency === "INR" ? "INR" : "";
    // Same guard as preparePayment's, and for the same reason: only a row
    // still "pending" or "failed" gets its payable fields repaired here.
    // Once claimed/paid/unknown_outcome, they're the record of what was
    // actually claimed/paid, not something a stale-field repair should ever
    // touch again — updateMany (not update) so a row that doesn't match
    // simply isn't touched, rather than throwing on a locked row.
    if (payee && currency && validatePaymentInput(payee.recipientNickname, amount).ok) {
      await prisma.paymentIntent.updateMany({
        where: { emailId, status: { in: ["pending", "failed"] } },
        data: { recipientNickname: payee.recipientNickname, amount, currency },
      });
    }
  }
  // Confirm is also a valid pre-payment trigger for intents prepared before
  // paid verification was wired, while the runner reuses existing evidence so
  // Prepare → Confirm does not pay for the same checks twice.
  await runPaidVerifierForEmail(emailId);
  await executePreparedPayment(emailId);
  revalidatePath("/");
}

/** Runs the paid verifier when the owner opens a queue row's review drawer. */
export async function runPaidVerificationAction(emailId: string): Promise<VerificationResult> {
  const result = await runPaidVerifierForEmail(emailId);
  revalidatePath("/");
  return result.verification;
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

  const intent = await prisma.paymentIntent.findUnique({
    where: { emailId },
    select: { status: true },
  });
  const blockedReason = reviewRetryBlockReason(intent?.status ?? null);
  if (blockedReason) throw new Error(blockedReason);

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
  // `ingest.ts` pulls in the Gmail/Composio SDK and cannot be bundled into a
  // Next server action. Run the review-only worker entrypoint separately, as
  // Sync now does; it disables auto-pay for this reprocessing path.
  const repoRoot = path.resolve(process.cwd(), "..");
  await execFileAsync("pnpm", ["exec", "tsx", "worker/src/retry-level1-cli.ts", emailId], {
    cwd: repoRoot,
    timeout: 30_000,
  });
  revalidatePath("/");
}

/**
 * Recalculates an invoice's policy decision from what's already stored — no
 * re-extraction, no re-classification, and no payment. Safe to run any time
 * a runtime setting (AUTO_PAY_MODE, a payee's auto-pay toggle) may have
 * changed since this invoice was last processed.
 */
export async function reevaluatePolicyAction(formData: FormData): Promise<void> {
  const emailId = String(formData.get("emailId") ?? "").trim();
  if (!emailId) throw new Error("The email to re-evaluate is missing.");
  await reevaluatePolicy(emailId);
  revalidatePath("/");
}

/**
 * The one explicit action that can turn already-queued invoices into real
 * payments after AUTO_PAY_MODE is switched on. Only invoices blocked solely
 * by the global pause are touched; every other guardrail is re-checked live
 * before anything pays. See worker/src/resume-auto-pay.ts.
 */
export async function resumeAutoPayAction(): Promise<void> {
  await resumeAutoPayForEligibleInvoices();
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
