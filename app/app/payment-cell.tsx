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

  if (classification === "ignored") {
    return <span className="payment-badge badge-ignored">Not payable</span>;
  }

  // Step 1: No intent prepared yet -> Two-step safety gate (Prepare first)
  if (!intent) {
    if (!isPreparing) {
      return (
        <button
          type="button"
          className="prepare-trigger-button"
          onClick={() => setIsPreparing(true)}
        >
          Prepare payment ▾
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

  // Step 2: Lifecycle states switch
  switch (intent.status) {
    case "pending":
      return (
        <div className="confirm-card-compact">
          <div className="confirm-meta">
            <span className="confirm-ready-tag">Ready to pay</span>
            <strong className="confirm-amount">₹{intent.amount}</strong>
            <span className="confirm-to">→ {intent.recipientNickname}</span>
          </div>
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
          <span className="status-indicator-dot dot-processing"></span>
          <span>Processing…</span>
        </div>
      );

    case "paid":
      return (
        <div className="payment-status-pill pill-paid">
          <span className="status-indicator-dot dot-paid"></span>
          <span>Paid ✓ {intent.paymentReference ? `· ${intent.paymentReference}` : ""}</span>
        </div>
      );

    case "failed":
      return (
        <div className="payment-failed-wrap">
          <div className="payment-status-pill pill-failed">
            <span className="status-indicator-dot dot-failed"></span>
            <span>Failed {intent.lastError ? `(${intent.lastError})` : ""}</span>
          </div>
          <form action={confirmPayment.bind(null, emailId)}>
            <button type="submit" className="button-retry">
              Retry
            </button>
          </form>
        </div>
      );

    case "unknown_outcome":
      return (
        <div className="payment-status-pill pill-uncertain" title="FR-27: never automatically retried">
          <span className="status-indicator-dot dot-uncertain"></span>
          <span>⚠ Uncertain — check dashboard before retrying</span>
        </div>
      );

    default:
      return assertUnreachableStatus(intent.status);
  }
}
