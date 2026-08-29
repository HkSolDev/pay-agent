import { prisma } from "@perflo-ap-agent/db";
import { PaymentCell } from "./payment-cell";

// Level 0: no classifier exists yet, so every ingested row is just "queued" —
// there's no auto-paid/needs-approval/quarantined distinction until Level 1
// adds the LLM stage. The Pay column is the one real, working exception:
// the owner types a recipient + amount by hand and confirms, same as the
// PRD's Level 0 "locked manual pay" — no policy engine decides this yet.
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

      <section className="notice" aria-label="Level 0 status">
        <strong>Level 0 — plumbing</strong>
        <span>Gmail is connected and ingesting. Classification, verification, and auto-pay arrive in Level 1+.</span>
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
                <th>Pay</th>
              </tr>
            </thead>
            <tbody>
              {emails.length === 0 ? (
                <tr>
                  <td colSpan={5} className="status">No mail ingested yet — the worker polls every 5 minutes.</td>
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
