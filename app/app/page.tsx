import Link from "next/link";
import { prisma } from "@perflo-ap-agent/db";
import { QueueView, type QueueItem } from "./queue-view";
import type { ReviewEmail } from "./review-drawer-model";

export default async function QueuePage() {
  const [emails, intents, approvedPayeeCount, activeRailCount] = await Promise.all([
    prisma.email.findMany({ orderBy: { date: "desc" }, take: 50 }),
    prisma.paymentIntent.findMany(),
    prisma.payee.count({ where: { status: "approved" } }),
    prisma.payeePaymentMethod.count({ where: { status: "active" } }),
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
