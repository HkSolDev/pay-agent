import Link from "next/link";
import { prisma } from "@perflo-ap-agent/db";
import { decryptPaymentMethod } from "../../../worker/src/payee-crypto";
import { paymentMethodFromNormalized } from "../../../worker/src/payee-store";
import { maskRailValue } from "../payee-form-model";
import { PayeeForm } from "../payee-form";
import { PayeeRailRow } from "../payee-rail-row";

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
      <header className="topbar">
        <div>
          <p className="eyebrow">PERFLO AP AGENT</p>
          <h1>Payees</h1>
        </div>
        <Link href="/" className="text-button">Back to queue</Link>
      </header>

      <section className="notice" aria-label="Payment execution boundary">
        <strong>Setup only</strong>
        <span>Approving a payee, rail, or grant here never sends a payment. Manual payment stays a separate, explicit step in the review queue.</span>
      </section>

      <section className="card" aria-labelledby="add-payee-heading">
        <div className="card-heading">
          <div>
            <p className="eyebrow">NEW PAYEE</p>
            <h2 id="add-payee-heading">Add payee</h2>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <PayeeForm />
        </div>
      </section>

      <section className="card" aria-labelledby="payees-heading" style={{ marginTop: 24 }}>
        <div className="card-heading">
          <div>
            <p className="eyebrow">APPROVED</p>
            <h2 id="payees-heading">Payees</h2>
          </div>
          <span className="count">{payees.length} payees</span>
        </div>
        <div style={{ padding: 24, display: "grid", gap: 20 }}>
          {payees.length === 0 ? (
            <p className="empty-copy">No payees yet.</p>
          ) : (
            payees.map((payee) => (
              <div key={payee.id} className="drawer-section" style={{ padding: 16, border: "1px solid var(--line)", borderRadius: 8 }}>
                <div className="section-heading">
                  <h3>{payee.name}</h3>
                  <span className={`state-pill ${payee.status === "approved" ? "pass" : payee.status === "revoked" ? "fail" : "review"}`}>
                    {payee.status}
                  </span>
                </div>
                <p className="subtle-facts">
                  <span>Recipient: <strong>{payee.recipientNickname}</strong></span>
                  <span>Per-payment cap: <strong>{payee.grantPerPaymentCapInr ?? "—"}</strong></span>
                  <span>Total cap: <strong>{payee.grantTotalCapInr ?? "—"}</strong></span>
                  <span>Max payments: <strong>{payee.grantMaxPayments ?? "—"}</strong></span>
                  <span>Expires: <strong>{payee.grantExpiresAt ? payee.grantExpiresAt.toLocaleDateString() : "—"}</strong></span>
                </p>
                <p className="subtle-facts">
                  <span>Sender identities: <strong>{payee.identities.map((i) => i.senderAddr).join(", ") || "none"}</strong></span>
                </p>
                <div className="attachment-list" style={{ marginTop: 12 }}>
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
            ))
          )}
        </div>
      </section>
    </main>
  );
}
