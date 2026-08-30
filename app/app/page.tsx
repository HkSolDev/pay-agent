import Link from "next/link";
import { prisma } from "@perflo-ap-agent/db";
import { QueueView, type QueueItem } from "./queue-view";
import type { ReviewEmail } from "./review-drawer-model";
import { fetchRazorpayBalance } from "../../worker/src/razorpay-balance";

// A stuck payout's own error often just says "insufficient balance" — this
// surfaces the actual number so the owner doesn't have to go check the
// RazorpayX dashboard to find out why nothing is clearing. Read-only, and a
// failed/misconfigured lookup must never break the rest of the queue page,
// so any error here becomes "we don't know," not a page crash.
async function loadRazorpayBalance() {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_ACCOUNT_NUMBER: accountNumber } = process.env;
  if (!keyId || !keySecret || !accountNumber) return null;
  try {
    return await fetchRazorpayBalance({ keyId, keySecret, accountNumber });
  } catch {
    return null;
  }
}

export default async function QueuePage() {
  const [emails, intents, approvedPayeeCount, activeRailCount, razorpayBalance] = await Promise.all([
    prisma.email.findMany({ orderBy: { date: "desc" }, take: 50 }),
    prisma.paymentIntent.findMany(),
    prisma.payee.count({ where: { status: "approved" } }),
    prisma.payeePaymentMethod.count({ where: { status: "active" } }),
    loadRazorpayBalance(),
  ]);
  const intentByEmailId = new Map(intents.map((intent) => [intent.emailId, intent]));

  const queueItems: QueueItem[] = emails.map((email) => {
    const intent = intentByEmailId.get(email.id);
    const reviewEmail: ReviewEmail = {
      id: email.id,
      gmailMessageId: email.gmailMessageId,
      gmailThreadId: email.gmailThreadId,
      fromName: email.fromName,
      fromAddr: email.fromAddr,
      replyTo: email.replyTo,
      returnPath: email.returnPath,
      toAddrs: email.toAddrs,
      date: email.date.toISOString(),
      subject: email.subject,
      bodyText: email.bodyText,
      attachments: email.attachments,
      auth: email.auth,
      classification: email.classification,
      classificationConfidence: email.classificationConfidence,
      classificationRationale: email.classificationRationale,
      injectionDetected: email.injectionDetected,
      injectionEvidence: email.injectionEvidence,
      extractionSummary: email.extractionSummary,
      extractionBackend: email.extractionBackend,
      payeeResolution: email.payeeResolution,
      verificationResult: email.verificationResult,
      duplicateResult: email.duplicateResult,
      policyDecision: email.policyDecision,
      policyReasons: email.policyReasons,
      level1ProcessedAt: email.level1ProcessedAt?.toISOString() ?? null,
      reviewStatus: email.reviewStatus,
      reviewedAt: email.reviewedAt?.toISOString() ?? null,
    };

    return {
      email: reviewEmail,
      intent: intent
        ? {
            status: intent.status,
            amount: intent.amount,
            recipientNickname: intent.recipientNickname,
            paymentReference: intent.paymentReference,
            lastError: intent.lastError,
            paidAt: intent.paidAt?.toISOString() ?? null,
          }
        : undefined,
    };
  });

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PERFLO AP AGENT</p>
          <h1>Payment queue</h1>
        </div>
        <div className="actions">
          <Link href="/payees" className="payees-action-link">
            <span className="payees-icon">👥</span>
            <span>Payees</span>
            <span className="payees-count-pill">{approvedPayeeCount}</span>
          </Link>
          <button type="button" disabled>
            Sync now
          </button>
          <button type="button" className="pause" disabled>
            Paused
          </button>
        </div>
      </header>

      <section className="notice" aria-label="Level 1 dry-run status">
        <strong>Level 1 — review-only</strong>
        <span>Classification and extraction are recorded for review. Automatic payment remains disabled.</span>
      </section>

      {razorpayBalance && (
        <section
          className={`notice ${razorpayBalance.availableAmountMinor <= 0 ? "notice-warn" : ""}`}
          aria-label="RazorpayX account balance"
        >
          <strong>RazorpayX test balance</strong>
          <span>
            ₹{(razorpayBalance.availableAmountMinor / 100).toFixed(2)} available
            {razorpayBalance.availableAmountMinor <= 0 &&
              " — payouts will stay queued until this account has test funds. Add balance from the RazorpayX Test Mode dashboard."}
          </span>
        </section>
      )}

      <QueueView
        items={queueItems}
        payeeStats={{
          approvedCount: approvedPayeeCount,
          activeRailCount: activeRailCount,
        }}
      />
    </main>
  );
}
