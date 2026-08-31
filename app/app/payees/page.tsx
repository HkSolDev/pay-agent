import Link from "next/link";
import { prisma } from "@perflo-ap-agent/db";
import { decryptPaymentMethod } from "../../../worker/src/payee-crypto";
import { paymentMethodFromNormalized } from "../../../worker/src/payee-store";
import { maskRailValue } from "../payee-form-model";
import { PayeeForm } from "../payee-form";
import { PayeeRailRow } from "../payee-rail-row";
import { toggleAutoPayAction } from "../payee-actions";

// Same reasoning as app/app/page.tsx: this page reads live DB state and
// must never be statically prerendered at build time.
export const dynamic = "force-dynamic";

// Server component only: raw rail bytes are decrypted here, in trusted
// server code, purely to compute a masked display string. The plaintext
// value is never sent to the client — only maskRailValue's output is.
function maskedValueFor(encryptedPayload: Uint8Array): string {
  const normalized = decryptPaymentMethod(Buffer.from(encryptedPayload));
  const method = paymentMethodFromNormalized(normalized);
  return method ? maskRailValue(method) : "Unreadable rail";
}

export default async function PayeesPage() {
  const payees = await prisma.payee.findMany({
    orderBy: { createdAt: "desc" },
    include: { identities: true, paymentMethods: { orderBy: { createdAt: "desc" } } },
  });

  return (
    <main className="shell">
      {/* Header */}
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "22px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">Perflo AP Agent</p>
          <h1 style={{ margin: 0, fontSize: "32px" }}>Payees</h1>
        </div>
        <Link href="/" className="btn btn-secondary" style={{ textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
          ← Back to queue
        </Link>
      </header>

      {/* Setup-only notice */}
      <div className="setup-notice" aria-label="Payment execution boundary">
        {/* shield icon terracotta */}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--color-accent-700)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
          <path d="M12 8v4" />
          <circle cx="12" cy="15.5" r="0.6" fill="currentColor" />
        </svg>
        <span style={{ fontSize: "13px" }}>
          <strong>Setup only</strong> — approving a payee, rail, or grant here never sends a payment. Manual payment stays a separate, explicit step in the review queue.
        </span>
      </div>

      {/* Add Payee Card */}
      <section
        className="card elev-sm"
        style={{ marginBottom: "24px" }}
        aria-labelledby="add-payee-heading"
      >
        <p className="card-kicker" style={{ margin: 0 }}>New payee</p>
        <h2 id="add-payee-heading" style={{ margin: "0 0 14px", fontSize: "20px" }}>
          Add payee
        </h2>
        <PayeeForm />
      </section>

      {/* Payees List Card */}
      <section
        className="card elev-sm"
        aria-labelledby="payees-heading"
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <p className="card-kicker" style={{ margin: 0 }}>Approved</p>
            <h2 id="payees-heading" style={{ margin: 0, fontSize: "20px" }}>Payees</h2>
          </div>
          <span className="tag tag-neutral">{payees.length} payees</span>
        </div>

        {payees.length === 0 ? (
          <p className="empty-copy" style={{ marginTop: "16px" }}>No payees yet.</p>
        ) : (
          <div className="payees-list">
            {payees.map((payee) => (
              <div key={payee.id} className="payee-block">
                {/* Name + status tag */}
                <div className="payee-block-header">
                  <h3 style={{ margin: 0 }}>{payee.name}</h3>
                  <span
                    className={`tag ${payee.status === "approved" ? "tag-accent-2" : "tag-neutral"}`}
                  >
                    {payee.status}
                  </span>
                </div>

                {/* Meta row */}
                <div className="payee-meta-row">
                  <span>Recipient: <strong>{payee.recipientNickname}</strong></span>
                  <span>Per-payment cap: <strong>{payee.grantPerPaymentCapInr ?? "—"}</strong></span>
                  <span>Total cap: <strong>{payee.grantTotalCapInr ?? "—"}</strong></span>
                  <span>Max payments: <strong>{payee.grantMaxPayments ?? "—"}</strong></span>
                  <span>Expires: <strong>{payee.grantExpiresAt ? payee.grantExpiresAt.toLocaleDateString() : "—"}</strong></span>
                </div>

                {/* Sender identities */}
                <div className="payee-meta-row">
                  <span>Sender identities: <strong>{payee.identities.map((i) => i.senderAddr).join(", ") || "none"}</strong></span>
                </div>

                {/* Auto-pay opt-in — off by default; also gated globally by
                    AUTO_PAY_MODE, so this alone does not turn anything on
                    unless the deployment has that enabled too. */}
                <div className="payee-meta-row" style={{ alignItems: "center", gap: "10px" }}>
                  <span
                    className={`tag ${payee.autoPayEnabled ? "tag-accent-2" : "tag-neutral"}`}
                    title="Auto-pay still requires every guardrail to pass on each invoice, and the deployment-wide AUTO_PAY_MODE switch to be on."
                  >
                    {payee.autoPayEnabled ? "Auto-pay on" : "Auto-pay off"}
                  </span>
                  <form action={toggleAutoPayAction}>
                    <input type="hidden" name="payeeId" value={payee.id} />
                    <button type="submit" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "12px" }}>
                      {payee.autoPayEnabled ? "Turn off" : "Turn on"}
                    </button>
                  </form>
                </div>

                {/* Rails */}
                <div className="rails-list">
                  {payee.paymentMethods.map((method) => (
                    <PayeeRailRow
                      key={method.id}
                      methodId={method.id}
                      rail={method.rail}
                      status={method.status}
                      maskedValue={maskedValueFor(method.encryptedPayload)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
