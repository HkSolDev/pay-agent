import { prisma } from "@perflo-ap-agent/db";
import { PaymentCell } from "./payment-cell";

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
                <th>Review</th>
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
                          {email.policyReasons[0] && <span>{email.policyReasons[0]}</span>}
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
