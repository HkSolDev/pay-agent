import Link from "next/link";
import { prisma } from "@perflo-ap-agent/db";
import { QueueView, type QueueItem } from "./queue-view";
import type { ReviewEmail } from "./review-drawer-model";
import { fetchRazorpayBalance } from "../../worker/src/razorpay-balance";
import { isSyncPaused } from "../../worker/src/sync-state";
import { syncNowAction, togglePauseAction, reevaluatePolicyAction, resumeAutoPayAction } from "./actions";

// This page always reflects live queue/payment state and must never be
// statically prerendered — a build-time prerender attempt tries to reach
// Postgres from the build step itself, which fails on hosts (e.g. Railway)
// where the database is only reachable at runtime, not during the build.
export const dynamic = "force-dynamic";

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
  const [emails, intents, approvedPayeeCount, activeRailCount, razorpayBalance, syncPaused] = await Promise.all([
    prisma.email.findMany({ orderBy: { date: "desc" }, take: 50 }),
    prisma.paymentIntent.findMany(),
    prisma.payee.count({ where: { status: "approved" } }),
    prisma.payeePaymentMethod.count({ where: { status: "active" } }),
    loadRazorpayBalance(),
    isSyncPaused(),
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
      {/* Header */}
      <header className="topbar">
        <div>
          <p className="eyebrow">Perflo AP Agent</p>
          <h1>Payment queue</h1>
        </div>
        <div className="topbar-actions">
          {/* Payees link — secondary btn, with count tag */}
          <Link href="/payees" className="btn btn-secondary" style={{ textDecoration: "none" }}>
            {/* users icon */}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
              <path d="M16 8.2a3 3 0 010 5.8" />
              <path d="M19.5 20c-.1-2.4-1.3-4.2-3-5.1" />
            </svg>
            Payees
            <span className="tag tag-neutral">{approvedPayeeCount}</span>
          </Link>
          <form action={syncNowAction}>
            <button type="submit" className="btn btn-secondary" disabled={syncPaused}>
              {/* refresh icon */}
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4v5h5" /><path d="M20 20v-5h-5" />
                <path d="M5 9a7 7 0 0112-3.5M19 15a7 7 0 01-12 3.5" />
              </svg>
              Sync now
            </button>
          </form>
          <form action={togglePauseAction}>
            <button type="submit" className="btn btn-paused">
              {/* moon icon */}
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z" />
              </svg>
              {syncPaused ? "Resume syncing" : "Pause syncing"}
            </button>
          </form>
        </div>
      </header>

      {/* RazorpayX Balance Banner */}
      {razorpayBalance && (
        <div className="balance-banner" aria-label="RazorpayX account balance">
          <div className="balance-banner-inner">
            {/* credit-card icon in sage */}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--color-accent-2-800)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="3" />
              <path d="M2 10h20" />
            </svg>
            <div>
              <strong>RazorpayX test balance</strong>
              <div>
                <span>
                  ₹{(razorpayBalance.availableAmountMinor / 100).toFixed(2)} available
                  {razorpayBalance.availableAmountMinor <= 0 && " — add balance in RazorpayX Test Mode"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <QueueView
        items={queueItems}
        payeeStats={{
          approvedCount: approvedPayeeCount,
          activeRailCount: activeRailCount,
        }}
        autoPayModeOn={process.env.AUTO_PAY_MODE === "on"}
        reevaluatePolicyAction={reevaluatePolicyAction}
        resumeAutoPayAction={resumeAutoPayAction}
      />
    </main>
  );
}
