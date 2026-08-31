"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PaymentIntentStatus } from "@perflo-ap-agent/db";
import { PaymentCell } from "./payment-cell";
import { ReviewDrawerLauncher } from "./review-drawer";
import type { ReviewEmail, ReviewIntent } from "./review-drawer-model";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export interface SerializedIntent {
  status: PaymentIntentStatus;
  amount: string;
  recipientNickname: string;
  paymentReference: string | null;
  lastError: string | null;
  paidAt: string | null;
}

export interface QueueItem {
  email: ReviewEmail;
  intent?: SerializedIntent;
}

export interface PayeeStats {
  approvedCount: number;
  activeRailCount: number;
}

export type QueueTab = "needs_approval" | "paid" | "quarantine" | "all";

export function QueueView({
  items,
  payeeStats,
}: {
  items: QueueItem[];
  payeeStats?: PayeeStats;
}) {
  const [activeTab, setActiveTab] = useState<QueueTab>("needs_approval");

  const counts = useMemo(() => {
    let needsApproval = 0;
    let paid = 0;
    let quarantine = 0;
    let other = 0;

    for (const item of items) {
      const isPaid = item.intent?.status === "paid";
      const isQuarantine = item.email.policyDecision === "quarantine" || item.email.injectionDetected === true;
      const isNeedsApproval =
        !isPaid &&
        !isQuarantine &&
        (item.email.policyDecision === "needs_approval" ||
          item.email.reviewStatus === "needs_approval" ||
          (item.email.classification !== "ignored" && item.email.policyDecision !== "ignore"));

      if (isPaid) paid++;
      else if (isQuarantine) quarantine++;
      else if (isNeedsApproval) needsApproval++;
      else other++;
    }
    return { needsApproval, paid, quarantine, other, total: items.length };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const isPaid = item.intent?.status === "paid";
      const isQuarantine = item.email.policyDecision === "quarantine" || item.email.injectionDetected === true;
      const isNeedsApproval =
        !isPaid &&
        !isQuarantine &&
        (item.email.policyDecision === "needs_approval" ||
          item.email.reviewStatus === "needs_approval" ||
          (item.email.classification !== "ignored" && item.email.policyDecision !== "ignore"));

      switch (activeTab) {
        case "needs_approval": return isNeedsApproval;
        case "paid": return isPaid;
        case "quarantine": return isQuarantine;
        case "all": return true;
      }
    });
  }, [items, activeTab]);

  return (
    <div>
      {/* ── 4 KPI Summary Cards ── */}
      <section
        aria-label="Queue summary metrics"
        className="kpi-grid"
      >
        {/* Needs Approval */}
        <button
          type="button"
          className={`kpi-card${activeTab === "needs_approval" ? " active-needs" : ""}`}
          onClick={() => setActiveTab("needs_approval")}
        >
          <span className="kpi-card-label label-needs">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
            </svg>
            Needs approval
          </span>
          <strong className="kpi-card-number">{counts.needsApproval}</strong>
          <span className="kpi-card-sub">Awaiting owner action</span>
        </button>

        {/* Paid */}
        <button
          type="button"
          className={`kpi-card${activeTab === "paid" ? " active-paid" : ""}`}
          onClick={() => setActiveTab("paid")}
        >
          <span className="kpi-card-label label-paid">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 5-5" />
            </svg>
            Paid / settled
          </span>
          <strong className="kpi-card-number">{counts.paid}</strong>
          <span className="kpi-card-sub">Completed payouts</span>
        </button>

        {/* Quarantine */}
        <button
          type="button"
          className={`kpi-card${activeTab === "quarantine" ? " active-quarantine" : ""}`}
          onClick={() => setActiveTab("quarantine")}
        >
          <span className="kpi-card-label label-quarantine">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
              <path d="M12 8v4" /><circle cx="12" cy="15.5" r="0.6" fill="currentColor" />
            </svg>
            Quarantined
          </span>
          <strong className="kpi-card-number">{counts.quarantine}</strong>
          <span className="kpi-card-sub">Attacks &amp; hard flags</span>
        </button>

        {/* All */}
        <button
          type="button"
          className={`kpi-card${activeTab === "all" ? " active-all" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          <span className="kpi-card-label label-all">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
            </svg>
            Other / all
          </span>
          <strong className="kpi-card-number">{counts.total}</strong>
          <span className="kpi-card-sub">{counts.other} newsletters &amp; receipts</span>
        </button>
      </section>

      {/* ── Payee Registry Banner ── */}
      <div className="payee-registry-banner" aria-label="Approved payees status">
        <div className="payee-registry-info">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--color-accent-700)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
            <path d="M16 8.2a3 3 0 010 5.8" />
            <path d="M19.5 20c-.1-2.4-1.3-4.2-3-5.1" />
          </svg>
          <span>
            <strong>Payee registry:</strong>{" "}
            {payeeStats?.approvedCount ?? 0} approved payees ({payeeStats?.activeRailCount ?? 0} active encrypted rails)
          </span>
        </div>
        <Link href="/payees" className="btn btn-ghost" style={{ flexShrink: 0 }}>
          + Add &amp; manage payees
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {/* ── Filter Tabs ── */}
      <nav className="tab-bar" aria-label="Queue filter tabs">
        <button
          type="button"
          className={`tab-btn${activeTab === "needs_approval" ? " tab-active" : ""}`}
          onClick={() => setActiveTab("needs_approval")}
        >
          Needs approval <span className="tab-count">{counts.needsApproval}</span>
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === "paid" ? " tab-active" : ""}`}
          onClick={() => setActiveTab("paid")}
        >
          Paid <span className="tab-count">{counts.paid}</span>
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === "quarantine" ? " tab-active" : ""}`}
          onClick={() => setActiveTab("quarantine")}
        >
          Quarantine <span className="tab-count">{counts.quarantine}</span>
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === "all" ? " tab-active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All activity <span className="tab-count">{counts.total}</span>
        </button>
      </nav>

      {/* ── Queue Items List ── */}
      <div className="queue-list" role="feed" aria-label="Filtered queue rows">
        {filteredItems.length === 0 ? (
          <div className="queue-empty-card">
            No items in this filter.
          </div>
        ) : (
          filteredItems.map((item) => {
            const { email, intent } = item;
            const extraction = asRecord(email.extractionSummary);
            const amount = asRecord(extraction.amount);
            const amountValue = asString(amount.value);
            const amountCurrency = asString(amount.currency) ?? "INR";
            const payeeName = asString(extraction.payeeName) ?? email.fromName ?? email.fromAddr;
            const reference = asString(extraction.referenceNumber);
            const paymentKinds = Array.isArray(extraction.paymentMethodKinds)
              ? extraction.paymentMethodKinds.filter((k): k is string => typeof k === "string")
              : [];
            const railDisplay = paymentKinds.length > 0 ? paymentKinds.join(", ").toUpperCase() : "NO RAIL";

            const isQuarantine = email.policyDecision === "quarantine" || email.injectionDetected === true;
            const isNeedsApproval =
              !isQuarantine &&
              (email.policyDecision === "needs_approval" ||
                email.reviewStatus === "needs_approval" ||
                (email.classification !== "ignored" && email.policyDecision !== "ignore"));
            const isIgnored = email.classification === "ignored" || email.policyDecision === "ignore";
            const isNeutral = !isQuarantine && !isNeedsApproval && !isIgnored;

            const primaryWarning =
              email.policyReasons && email.policyReasons.length > 0
                ? email.policyReasons[0]
                : email.injectionDetected
                ? "Prompt injection detected"
                : null;

            const reviewIntent: ReviewIntent | undefined = intent
              ? { status: intent.status, paidAt: intent.paidAt }
              : undefined;

            return (
              <article key={email.id} className="queue-card">
                {/* Left: content */}
                <div className="queue-card-main">
                  {/* Top row: sender + ref + date + state tag */}
                  <div className="queue-card-header">
                    <div className="queue-card-meta">
                      <strong className="queue-sender">{email.fromName ?? email.fromAddr}</strong>
                      {reference && <span className="queue-ref">· {reference}</span>}
                      <time className="queue-date" dateTime={email.date}>
                        · {new Date(email.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </time>
                    </div>
                    <div>
                      {isQuarantine && (
                        <span className="tag tag-dark">quarantine</span>
                      )}
                      {isNeedsApproval && !isQuarantine && (
                        <span className="tag tag-accent">needs approval</span>
                      )}
                      {isIgnored && (
                        <span className="tag tag-neutral">ignored</span>
                      )}
                      {isNeutral && intent?.status === "paid" && (
                        <span className="tag tag-accent-2">approved</span>
                      )}
                    </div>
                  </div>

                  {/* Amount → payee → rail */}
                  <div className="queue-financials">
                    <strong className="amount-display">
                      {amountValue
                        ? `${amountCurrency === "INR" ? "₹" : "$"}${amountValue}`
                        : "No amount"}
                    </strong>
                    <span className="destination-arrow">→</span>
                    <span className="payee-destination">
                      {payeeName}
                      <span className="tag tag-outline">{railDisplay}</span>
                    </span>
                  </div>

                  {/* Subject + snippet */}
                  <p className="queue-subject">
                    <strong>{email.subject ?? "(no subject)"}</strong>
                    {email.bodyText && (
                      <span className="queue-snippet"> — {email.bodyText.slice(0, 100)}…</span>
                    )}
                  </p>

                  {/* Warning pill */}
                  {primaryWarning && (
                    <div className="queue-warning">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 4l9 16H3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.6" fill="currentColor" />
                      </svg>
                      {primaryWarning}
                    </div>
                  )}
                </div>

                {/* Right: action column (190px desktop, full-width mobile) */}
                <div className="queue-card-actions">
                  <ReviewDrawerLauncher email={email} intent={reviewIntent} />
                  <PaymentCell
                    emailId={email.id}
                    classification={email.classification}
                    defaultNickname={
                      asString(extraction.payeeName)
                        ? `demo-${asString(extraction.payeeName)!.toLowerCase().replace(/\s+/g, "-")}`
                        : undefined
                    }
                    defaultAmount={amountValue ?? undefined}
                    intent={intent}
                  />
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
