import { prisma } from "@perflo-ap-agent/db";
import { confirmPayment, preparePayment } from "./actions";

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
                        {email.classification === "ignored" ? (
                          <span className="status">ignored — not payable</span>
                        ) : (
                          <>
                            {!intent && (
                              <form action={preparePayment} className="pay-form">
                                <input type="hidden" name="emailId" value={email.id} />
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
                            )}
                            {intent?.status === "pending" && (
                              <form action={confirmPayment.bind(null, email.id)}>
                                <button type="submit" className="text-button">
                                  Confirm &amp; pay ₹{intent.amount} to {intent.recipientNickname}
                                </button>
                              </form>
                            )}
                            {intent?.status === "claimed" && <span className="status">processing…</span>}
                            {intent?.status === "paid" && (
                              <span className="status">paid ✓ {intent.paymentReference}</span>
                            )}
                            {intent?.status === "failed" && (
                              <form action={confirmPayment.bind(null, email.id)} className="pay-form">
                                <span className="status status-warn">{intent.lastError ?? "Failed"}</span>
                                <button type="submit" className="text-button">Retry</button>
                              </form>
                            )}
                            {/* No retry control on purpose (FR-27): outcome is unknown, may
                                already be paid — a human must check `perflo activity` first. */}
                            {intent?.status === "unknown_outcome" && (
                              <span className="status status-warn">
                                ⚠ uncertain — check Perflo activity before retrying
                                {intent.lastError ? ` (${intent.lastError})` : ""}
                              </span>
                            )}
                          </>
                        )}
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
