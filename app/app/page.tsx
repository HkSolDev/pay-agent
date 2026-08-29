import { prisma } from "@perflo-ap-agent/db";

// Level 0: no classifier exists yet, so every ingested row is just "queued" —
// there's no auto-paid/needs-approval/quarantined distinction until Level 1
// adds the LLM stage. This page only proves Gmail -> Postgres -> UI works.
export default async function QueuePage() {
  const emails = await prisma.email.findMany({
    orderBy: { date: "desc" },
    take: 50,
  });

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
                <th>Subject</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {emails.length === 0 ? (
                <tr>
                  <td colSpan={4} className="status">No mail ingested yet — the worker polls every 5 minutes.</td>
                </tr>
              ) : (
                emails.map((email) => (
                  <tr key={email.id}>
                    <td>{email.fromName ?? email.fromAddr}</td>
                    <td>{email.subject ?? "(no subject)"}</td>
                    <td>{email.date.toLocaleString()}</td>
                    <td><span className="status">queued</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
