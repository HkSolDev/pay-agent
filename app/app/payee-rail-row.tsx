"use client";

import { useState } from "react";
import { replaceRailAction, revokeRailAction } from "./payee-actions";

export function PayeeRailRow({
  methodId,
  rail,
  maskedValue,
  status,
}: {
  methodId: string;
  rail: string;
  maskedValue: string;
  status: string;
}) {
  const [mode, setMode] = useState<"view" | "replace" | "revoke">("view");
  const [confirmed, setConfirmed] = useState(false);
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const [newVpa, setNewVpa] = useState("");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [newIfsc, setNewIfsc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isActive = status === "active";

  // Revoked / non-active rails
  if (!isActive) {
    return (
      <div className="rail-row">
        <div className="rail-row-inner">
          {/* credit-card icon */}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" />
          </svg>
          <strong>{rail.toUpperCase()}</strong>
          <span>{maskedValue}</span>
        </div>
        <span className="tag tag-neutral">{status}</span>
      </div>
    );
  }

  async function submit(formData: FormData) {
    if (!confirmed) { setError("Confirm before replacing this rail."); return; }
    setPending(true);
    setError(null);
    try {
      await replaceRailAction(formData);
      setMode("view");
      setConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not replace the rail.");
    } finally {
      setPending(false);
    }
  }

  async function revoke() {
    if (!revokeConfirmed) { setError("Confirm before revoking this rail."); return; }
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("methodId", methodId);
      fd.set("ownerConfirmed", "on");
      await revokeRailAction(fd);
      setMode("view");
      setRevokeConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke the rail.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Rail summary row */}
      <div className="rail-row">
        <div className="rail-row-inner">
          {/* credit-card icon */}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" />
          </svg>
          <strong>{rail.toUpperCase()}</strong>
          <span>{maskedValue}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="tag tag-accent-2">active</span>
          <button type="button" className="btn btn-secondary" style={{ fontSize: "11px", padding: "4px 10px" }} onClick={() => setMode(mode === "replace" ? "view" : "replace")} disabled={pending}>
            {mode === "replace" ? "Cancel" : "Replace"}
          </button>
          <button type="button" className="btn btn-secondary" style={{ fontSize: "11px", padding: "4px 10px" }} onClick={() => setMode(mode === "revoke" ? "view" : "revoke")} disabled={pending}>
            {mode === "revoke" ? "Cancel" : "Revoke"}
          </button>
        </div>
      </div>

      {/* Revoke confirmation */}
      {mode === "revoke" && (
        <div className="payee-form" style={{ padding: "12px", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
          <label className="confirm-row">
            <input type="checkbox" checked={revokeConfirmed} onChange={(e) => setRevokeConfirmed(e.target.checked)} />
            <span>I confirm revoking this {rail.toUpperCase()} rail. Invoices already routed to review will not change; new ones can no longer resolve through it.</span>
          </label>
          <button type="button" className="btn btn-primary" onClick={revoke} disabled={pending} style={{ marginTop: "8px" }}>
            {pending ? "Revoking…" : "Confirm revoke"}
          </button>
        </div>
      )}

      {/* Replace form */}
      {mode === "replace" && (
        <form action={submit} className="payee-form" style={{ padding: "12px", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
          <input type="hidden" name="oldMethodId" value={methodId} />
          <input type="hidden" name="rail" value={rail} />
          {rail === "upi" ? (
            <label>
              <span>New UPI VPA</span>
              <input name="vpa" value={newVpa} onChange={(e) => setNewVpa(e.target.value)} />
            </label>
          ) : (
            <>
              <label><span>New account number</span><input name="accountNumber" value={newAccountNumber} onChange={(e) => setNewAccountNumber(e.target.value)} /></label>
              <label><span>New IFSC</span><input name="ifsc" value={newIfsc} onChange={(e) => setNewIfsc(e.target.value)} /></label>
            </>
          )}
          <label className="confirm-row">
            <input type="checkbox" name="ownerConfirmed" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I confirm replacing this rail. The old rail is revoked, not overwritten — history is kept. This action is currently blocked until a new Perflo beneficiary and beneficiary-specific approval can be registered; no local change will be saved.</span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={pending} style={{ marginTop: "8px" }}>
            {pending ? "Saving…" : "Confirm replace"}
          </button>
        </form>
      )}

      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
