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
      const isQuarantine =
        item.email.policyDecision === "quarantine" || item.email.injectionDetected === true;
      const isNeedsApproval =
        !isPaid &&
        !isQuarantine &&
        (item.email.policyDecision === "needs_approval" ||
          item.email.reviewStatus === "needs_approval" ||
          (item.email.classification !== "ignored" && item.email.policyDecision !== "ignore"));

      if (isPaid) {
        paid++;
      } else if (isQuarantine) {
        quarantine++;
      } else if (isNeedsApproval) {
        needsApproval++;
      } else {
        other++;
      }
    }

    return {
      needsApproval,
      paid,
      quarantine,
      other,
      total: items.length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const isPaid = item.intent?.status === "paid";
      const isQuarantine =
        item.email.policyDecision === "quarantine" || item.email.injectionDetected === true;
      const isNeedsApproval =
        !isPaid &&
        !isQuarantine &&
        (item.email.policyDecision === "needs_approval" ||
          item.email.reviewStatus === "needs_approval" ||
          (item.email.classification !== "ignored" && item.email.policyDecision !== "ignore"));

      switch (activeTab) {
        case "needs_approval":
          return isNeedsApproval;
        case "paid":
          return isPaid;
        case "quarantine":
          return isQuarantine;
        case "all":
          return true;
      }
    });
  }, [items, activeTab]);

  return (
    <div className="queue-container">
      {/* 4 Top-Level KPI Summary Blocks */}
      <section className="kpi-grid" aria-label="Queue summary metrics">
        <button
          type="button"
          className={`kpi-card kpi-warning ${activeTab === "needs_approval" ? "kpi-active" : ""}`}
          onClick={() => setActiveTab("needs_approval")}
        >
          <span className="kpi-label">🟡 Needs Approval</span>
          <strong className="kpi-value">{counts.needsApproval}</strong>
          <span className="kpi-subtext">Awaiting owner action</span>
        </button>

        <button
          type="button"
          className={`kpi-card kpi-success ${activeTab === "paid" ? "kpi-active" : ""}`}
          onClick={() => setActiveTab("paid")}
        >
          <span className="kpi-label">🟢 Paid / Settled</span>
          <strong className="kpi-value">{counts.paid}</strong>
          <span className="kpi-subtext">Completed payouts</span>
        </button>

        <button
          type="button"
          className={`kpi-card kpi-danger ${activeTab === "quarantine" ? "kpi-active" : ""}`}
          onClick={() => setActiveTab("quarantine")}
        >
          <span className="kpi-label">🛡️ Quarantined</span>
          <strong className="kpi-value">{counts.quarantine}</strong>
          <span className="kpi-subtext">Attacks &amp; hard flags</span>
        </button>

        <button
          type="button"
          className={`kpi-card kpi-neutral ${activeTab === "all" ? "kpi-active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          <span className="kpi-label">⚪ Other / All</span>
          <strong className="kpi-value">{counts.total}</strong>
          <span className="kpi-subtext">Newsletters &amp; receipts ({counts.other})</span>
        </button>
      </section>

      {/* Payee Registry Summary Strip */}
      <div className="payee-registry-banner" aria-label="Approved payees status">
        <div className="payee-registry-info">
          <span className="payee-registry-icon">👥</span>
          <div>
            <strong>Payee Registry:</strong>{" "}
            <span>
              {payeeStats?.approvedCount ?? 0} approved payees ({payeeStats?.activeRailCount ?? 0} active encrypted rails)
            </span>
          </div>
        </div>
        <Link href="/payees" className="payee-registry-link">
          + Add &amp; Manage Payees →
        </Link>
      </div>

      {/* Filter Tabs */}
      <nav className="tab-bar" aria-label="Queue filter tabs">
        <button
          type="button"
          className={`tab-button ${activeTab === "needs_approval" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("needs_approval")}
        >
          Needs approval <span className="tab-count">{counts.needsApproval}</span>
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "paid" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("paid")}
        >
          Paid <span className="tab-count">{counts.paid}</span>
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "quarantine" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("quarantine")}
        >
          Quarantine <span className="tab-count">{counts.quarantine}</span>
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "all" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All activity <span className="tab-count">{counts.total}</span>
        </button>
      </nav>

      {/* Queue Items List / Cards */}
      <div className="queue-list" role="feed" aria-label="Filtered queue rows">
        {filteredItems.length === 0 ? (
          <div className="empty-card">
            <p>No items in <strong>{activeTab.replace("_", " ")}</strong>.</p>
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

            const isQuarantine =
              email.policyDecision === "quarantine" || email.injectionDetected === true;
            const policyBadgeClass = isQuarantine
              ? "badge-quarantine"
              : email.policyDecision === "needs_approval" || email.reviewStatus === "needs_approval"
              ? "badge-needs-approval"
              : email.classification === "ignored" || email.policyDecision === "ignore"
              ? "badge-ignored"
              : "badge-neutral";

            const primaryWarning =
              email.policyReasons && email.policyReasons.length > 0
                ? email.policyReasons[0]
                : email.injectionDetected
                ? "Prompt injection detected"
                : null;

            const reviewIntent: ReviewIntent | undefined = intent
              ? {
                  status: intent.status,
                  paidAt: intent.paidAt,
                }
              : undefined;

            return (
              <article key={email.id} className="queue-card">
                <div className="queue-card-main">
                  {/* Top line: Payee/Sender + Ref + Badges */}
                  <div className="queue-card-header">
                    <div className="queue-card-meta">
                      <strong className="queue-sender">{email.fromName ?? email.fromAddr}</strong>
                      {reference && <span className="queue-ref">· {reference}</span>}
                      <time className="queue-date" dateTime={email.date}>
                        · {new Date(email.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </time>
                    </div>
                    <div className="badge-group">
                      <span className={`badge ${policyBadgeClass}`}>
                        {email.reviewStatus ?? email.policyDecision ?? email.classification ?? "queued"}
                      </span>
                    </div>
                  </div>

                  {/* Financial line: Big Amount + Destination Payee & Rail */}
                  <div className="queue-financials">
                    <div className="amount-block">
                      <strong className="amount-display">
                        {amountValue ? `${amountCurrency === "INR" ? "₹" : "$"}${amountValue}` : "No amount"}
                      </strong>
                      <span className="destination-arrow">→</span>
                      <span className="payee-destination">
                        {payeeName} <span className="rail-chip">{railDisplay}</span>
                      </span>
                    </div>
                  </div>

                  {/* Subject & snippet */}
                  <p className="queue-subject">
                    <strong>{email.subject ?? "(no subject)"}</strong>
                    {email.bodyText && (
                      <span className="queue-snippet"> — {email.bodyText.slice(0, 100)}...</span>
                    )}
                  </p>

                  {/* Policy warning indicator */}
                  {primaryWarning && (
                    <div className="queue-warning">
                      <span className="warning-icon">⚠</span>
                      <span>{primaryWarning}</span>
                    </div>
                  )}
                </div>

                {/* Right / Bottom Action Controls */}
                <div className="queue-card-actions">
                  <div className="drawer-launcher-wrap">
                    <ReviewDrawerLauncher email={email} intent={reviewIntent} />
                  </div>
                  <div className="payment-cell-wrap">
                    <PaymentCell
                      emailId={email.id}
                      classification={email.classification}
                      defaultNickname={asString(extraction.payeeName) ? `demo-${asString(extraction.payeeName)!.toLowerCase().replace(/\s+/g, "-")}` : undefined}
                      defaultAmount={amountValue ?? undefined}
                      intent={intent}
                    />
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
