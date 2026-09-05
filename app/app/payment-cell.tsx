"use client";

import { useState } from "react";
import type { PaymentIntentStatus } from "@perflo-ap-agent/db";
import { assertUnreachableStatus } from "../../worker/src/payment-status";
import { confirmPayment, preparePayment } from "./actions";

export interface IntentSummary {
  status: PaymentIntentStatus;
  amount: string;
  recipientNickname: string;
  paymentReference: string | null;
  lastError: string | null;
}

export function PaymentCell({
  emailId,
  classification,
  defaultNickname,
  defaultAmount,
  intent,
}: {
  emailId: string;
  classification: string | null;
  defaultNickname?: string;
  defaultAmount?: string;
  intent: IntentSummary | undefined;
}) {
  const [isPreparing, setIsPreparing] = useState(false);

  // ignored → Not payable tag
  if (classification === "ignored") {
    return (
      <span className="tag tag-neutral payment-badge-not-payable">
        Not payable
      </span>
    );
  }

  // ── Step 1: No intent yet → Two-step gate ──
  if (!intent) {
    if (!isPreparing) {
      return (
        <button
          type="button"
          className="prepare-trigger-button"
          onClick={() => setIsPreparing(true)}
        >
          Prepare payment
          {/* chevron-down icon */}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      );
    }

    return (
      <form
        action={async (formData) => {
          await preparePayment(formData);
          setIsPreparing(false);
        }}
        className="prepare-form-compact"
      >
        <input type="hidden" name="emailId" value={emailId} />
        <input type="hidden" name="currency" value="INR" />
        <div className="prepare-inputs">
          <input
            name="recipientNickname"
            placeholder="Recipient nickname"
            defaultValue={defaultNickname ?? ""}
            required
            className="compact-input"
          />
          <input
            name="amount"
            placeholder="Amount, e.g. 500"
            defaultValue={defaultAmount ?? ""}
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            title="A plain positive number, e.g. 500 or 499.50"
            required
            className="compact-input"
          />
        </div>
        <div className="prepare-actions">
          <button type="submit" className="button-primary-compact">
            Prepare →
          </button>
          <button
            type="button"
            className="button-ghost-compact"
            onClick={() => setIsPreparing(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // ── Step 2: Lifecycle states switch ──
  switch (intent.status) {
    case "pending":
      return (
        <div className="confirm-card-compact">
          <span className="confirm-ready-tag">Ready to pay</span>
          <strong className="confirm-amount">₹{intent.amount}</strong>
          <span className="confirm-to">→ {intent.recipientNickname}</span>
          <form action={confirmPayment.bind(null, emailId)}>
            <button type="submit" className="button-confirm-pay">
              Confirm &amp; pay
            </button>
          </form>
        </div>
      );

    case "claimed":
      return (
        <div className="payment-status-pill pill-processing">
          <span className="dot-processing" />
          <span>Processing…</span>
        </div>
      );

    case "paid":
      return (
        <div className="payment-status-pill pill-paid">
          {/* check-circle icon */}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 5-5" />
          </svg>
          <span>Paid · {intent.paymentReference ?? ""}</span>
        </div>
      );

    case "failed":
      return (
        <div className="payment-failed-wrap">
          <div
            className="payment-status-pill pill-failed"
            title={intent.lastError ?? undefined}
          >
            <span className="dot-failed" />
            <span>Failed</span>
          </div>
          <form action={confirmPayment.bind(null, emailId)}>
            <button type="submit" className="button-retry">
              Retry
            </button>
          </form>
        </div>
      );

    case "unknown_outcome": {
      // The payment provider hasn't confirmed pass or fail yet — "processing"/"queued"
      // means it's still genuinely working on it (in live mode this resolves
      // on its own; in test environments it may require a manual step
      // to advance it, so it can sit here indefinitely). That's expected, not a fault,
      // so it gets calmer copy than an actual API error would. Either way we still never
      // show "Paid" until the payment provider itself confirms it (FR-27) — this only
      // changes the words, never the claimed outcome.
      const stillInFlight = /processing|queued/i.test(intent.lastError ?? "");
      return (
        <div
          className={`payment-status-pill ${stillInFlight ? "pill-inflight" : "pill-uncertain"}`}
          title="FR-27: never automatically retried — the payment provider hasn't confirmed the outcome yet"
        >
          {stillInFlight ? (
            <>
              {/* clock icon */}
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
              </svg>
              <span>Still processing — no action needed yet</span>
            </>
          ) : (
            <>
              {/* alert-triangle icon */}
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4l9 16H3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.6" fill="currentColor" />
              </svg>
              <span>Uncertain — check before retrying</span>
            </>
          )}
        </div>
      );
    }

    default:
      return assertUnreachableStatus(intent.status);
  }
}
