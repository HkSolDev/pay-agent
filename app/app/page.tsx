import { prisma } from "@perflo-ap-agent/db";
import { PaymentCell } from "./payment-cell";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function percent(value: unknown): string {
  const number = asNumber(value);
  return number === null ? "—" : `${Math.round(number * 100)}%`;
}

function ReviewDetails({ email }: { email: {
  extractionSummary: unknown;
  verificationResult: unknown;
  duplicateResult: unknown;
  policyDecision: string | null;
  policyReasons: string[];
} }) {
  const extraction = asRecord(email.extractionSummary);
  const amount = asRecord(extraction.amount);
  const verification = asRecord(email.verificationResult);
  const duplicate = asRecord(email.duplicateResult);
  const amountValue = asString(amount.value);
  const amountCurrency = asString(amount.currency);
  const reference = asString(extraction.referenceNumber);
  const paymentKinds = Array.isArray(extraction.paymentMethodKinds)
    ? extraction.paymentMethodKinds.filter((kind): kind is string => typeof kind === "string")
    : [];
  const isDuplicate = duplicate.duplicate === true;
  const suspiciousDuplicate = typeof duplicate.suspiciousConflict === "string";
  const warning = email.policyReasons[0] ?? (suspiciousDuplicate ? "Possible duplicate conflict." : null);

  return (
    <div className="review-grid" aria-label="Extracted payment review">
      <div><span>Pay amount</span><strong>{amountValue && amountCurrency ? `${amountCurrency} ${amountValue}` : "Not found"}</strong></div>
      <div><span>Invoice reference</span><strong>{reference ?? "Not found"}</strong></div>
      <div><span>Payee confidence</span><strong>{percent(extraction.payeeNameConfidence)}</strong></div>
      <div><span>Amount confidence</span><strong>{percent(extraction.amountConfidence)}</strong></div>
      <div><span>Reference confidence</span><strong>{percent(extraction.referenceNumberConfidence)}</strong></div>
      <div><span>Rail confidence</span><strong>{percent(extraction.paymentMethodConfidence)}</strong></div>
      <div><span>Verifier score</span><strong>{asNumber(verification.score) === null ? "—" : `${verification.score}/100`}</strong></div>
      <div><span>Authentication</span><strong>{verification.authPassed === true ? "Aligned" : "Needs review"}</strong></div>
      <div><span>Payment rail</span><strong>{paymentKinds.length > 0 ? paymentKinds.join(" + ") : "Not found"}</strong></div>
      <div><span>Duplicate check</span><strong className={isDuplicate || suspiciousDuplicate ? "review-danger" : "review-safe"}>
        {isDuplicate ? "Duplicate" : suspiciousDuplicate ? "Review conflict" : "No duplicate"}
      </strong></div>
      <div className="review-warning" data-empty={!warning}>
        <span>Warning</span><strong>{warning ?? "No warning"}</strong>
      </div>
    </div>
  );
}

// Level 1 remains a review-only queue while KYC is pending. The policy result
// explains what needs attention, but no result here triggers an automatic
// payment; the existing manual two-click payment flow remains the only route.
export default async function QueuePage() {
  const [emails, intents] = await Promise.all([
    prisma.email.findMany({ orderBy: { date: "desc" }, take: 50 }),
    prisma.paymentIntent.findMany(),
  ]);
  const intentByEmailId = new Map(intents.map((intent) => [intent.emailId, intent]));

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PERFLO AP AGENT</p>
          <h1>Payment queue</h1>
        </div>
        <div className="actions">
          <button type="button" disabled>Sync now</button>
          <button type="button" className="pause" disabled>Paused</button>
        </div>
      </header>

      <section className="notice" aria-label="Level 1 dry-run status">
        <strong>Level 1 — review-only</strong>
        <span>Classification and extraction are recorded for review. Automatic payment remains disabled.</span>
      </section>

      <section className="card" aria-labelledby="queue-heading">
        <div className="card-heading">
          <div>
            <p className="eyebrow">INBOX</p>
            <h2 id="queue-heading">Review queue</h2>
          </div>
          <span className="count">{emails.length} items</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sender</th>
                <th>Message</th>
                <th>Date</th>
                <th>Status</th>
                <th>Extracted review</th>
                <th>Pay</th>
              </tr>
            </thead>
            <tbody>
              {emails.length === 0 ? (
                <tr>
                  <td colSpan={6} className="status">No mail ingested yet — the worker polls every 5 minutes.</td>
                </tr>
              ) : (
                emails.map((email) => {
                  const intent = intentByEmailId.get(email.id);
                  return (
                    <tr key={email.id}>
                      <td>{email.fromName ?? email.fromAddr}</td>
                      <td>
                        <div className="message-cell">
                          <strong>{email.subject ?? "(no subject)"}</strong>
                          <span>{email.bodyText?.slice(0, 140) ?? "No body content stored"}</span>
                        </div>
                      </td>
                      <td>{email.date.toLocaleString()}</td>
                      <td><span className="status">{email.classification ?? "queued"}</span></td>
                      <td>
                        <div className="message-cell">
                          <strong>{email.policyDecision ?? "pending review"}</strong>
                          <ReviewDetails email={email} />
                        </div>
                      </td>
                      <td>
                        <PaymentCell emailId={email.id} classification={email.classification} intent={intent} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
