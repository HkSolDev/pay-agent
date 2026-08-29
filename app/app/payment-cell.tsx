import type { PaymentIntentStatus } from "@perflo-ap-agent/db";
import { assertUnreachableStatus } from "../../worker/src/payment-status";
import { confirmPayment, preparePayment } from "./actions";

interface Intent {
  status: PaymentIntentStatus;
  amount: string;
  recipientNickname: string;
  paymentReference: string | null;
  lastError: string | null;
}

/**
 * A real switch over PaymentIntentStatus, not a chain of JSX conditionals —
 * the `default: assertUnreachableStatus(status)` branch means TypeScript
 * refuses to compile this file if a 6th status is ever added to the enum
 * without a case being added here too. That's the actual guarantee: not
 * "a reviewer remembered to check," but "the build fails until you do."
 */
export function PaymentCell({
  emailId,
  classification,
  intent,
}: {
  emailId: string;
  classification: string | null;
  intent: Intent | undefined;
}) {
  if (classification === "ignored") {
    return <span className="status">ignored — not payable</span>;
  }

  if (!intent) {
    return (
      <form action={preparePayment} className="pay-form">
        <input type="hidden" name="emailId" value={emailId} />
        <input type="hidden" name="currency" value="INR" />
        <input name="recipientNickname" placeholder="recipient nickname" required />
        <input
          name="amount"
          placeholder="amount, e.g. 500"
          inputMode="decimal"
          pattern="\d+(\.\d{1,2})?"
          title="A plain positive number, e.g. 500 or 499.50 — no ₹ symbol"
          required
        />
        <button type="submit" className="text-button">Prepare</button>
      </form>
    );
  }

  switch (intent.status) {
    case "pending":
      return (
        <form action={confirmPayment.bind(null, emailId)}>
          <button type="submit" className="text-button">
            Confirm &amp; pay ₹{intent.amount} to {intent.recipientNickname}
          </button>
        </form>
      );
    case "claimed":
      return <span className="status">processing…</span>;
    case "paid":
      return <span className="status">paid ✓ {intent.paymentReference}</span>;
    case "failed":
      return (
        <form action={confirmPayment.bind(null, emailId)} className="pay-form">
          <span className="status status-warn">{intent.lastError ?? "Failed"}</span>
          <button type="submit" className="text-button">Retry</button>
        </form>
      );
    case "unknown_outcome":
      // No retry control on purpose (FR-27): outcome is unknown, may
      // already be paid — a human must check `perflo activity` first.
      return (
        <span className="status status-warn">
          ⚠ uncertain — check Perflo activity before retrying
          {intent.lastError ? ` (${intent.lastError})` : ""}
        </span>
      );
    default:
      return assertUnreachableStatus(intent.status);
  }
}
