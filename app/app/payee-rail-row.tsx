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

  if (status !== "active") {
    return (
      <div className="attachment-row">
        <div><strong>{maskedValue}</strong><span>{rail.toUpperCase()} · {status}</span></div>
        <span className="state-pill unknown">{status}</span>
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
    <div className="attachment-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
        <div><strong>{maskedValue}</strong><span>{rail.toUpperCase()} · active</span></div>
        <div className="action-row">
          <button type="button" className="secondary-action" onClick={() => setMode(mode === "replace" ? "view" : "replace")} disabled={pending}>
            {mode === "replace" ? "Cancel" : "Replace"}
          </button>
          <button type="button" className="secondary-action" onClick={() => setMode(mode === "revoke" ? "view" : "revoke")} disabled={pending}>
            {mode === "revoke" ? "Cancel" : "Revoke"}
          </button>
        </div>
      </div>

      {mode === "revoke" ? (
        <div className="payee-form" style={{ marginTop: 12 }}>
          <label className="confirm-row">
            <input type="checkbox" checked={revokeConfirmed} onChange={(e) => setRevokeConfirmed(e.target.checked)} />
            <span>I confirm revoking this {rail.toUpperCase()} rail. Invoices already routed to review will not change; new ones can no longer resolve through it.</span>
          </label>
          <button type="button" className="primary-action" onClick={revoke} disabled={pending}>{pending ? "Revoking…" : "Confirm revoke"}</button>
        </div>
      ) : null}

      {mode === "replace" ? (
        <form action={submit} className="payee-form" style={{ marginTop: 12 }}>
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
            <span>I confirm replacing this rail. The old rail is revoked, not overwritten — history is kept. New invoices on the old rail will route to review.</span>
          </label>
          <button type="submit" className="primary-action" disabled={pending}>{pending ? "Saving…" : "Confirm replace"}</button>
        </form>
      ) : null}

      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
