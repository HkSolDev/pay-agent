"use client";

import { useState } from "react";
import { createPayeeAction } from "./payee-actions";
import { validatePayeeForm, type PayeeFormErrors, type PayeeFormInput } from "./payee-form-model";

const EMPTY: PayeeFormInput = {
  name: "", firstName: "", lastName: "", senderAddr: "", rail: "upi", vpa: "", accountNumber: "", ifsc: "",
  perPaymentCapInr: "", totalCapInr: "", maxPayments: "", expiresAt: "",
};

export interface PayeeFormProps {
  // The name of the payee currently holding the one-pending-grant-at-a-time
  // lock (plan §1), or undefined when nothing is locked. Checked on page
  // load, server-side, the same as any other rendered state — not left to
  // fail only after a click.
  lockedByPayeeName?: string;
}

export function PayeeForm({ lockedByPayeeName }: PayeeFormProps) {
  const [form, setForm] = useState<PayeeFormInput>(EMPTY);
  const [ownerConfirmed, setOwnerConfirmed] = useState(false);
  const [errors, setErrors] = useState<PayeeFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof PayeeFormInput>(key: K, value: PayeeFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(formData: FormData) {
    setSubmitError(null);
    const { valid, errors: fieldErrors } = validatePayeeForm(form);
    setErrors(fieldErrors);
    if (!valid) return;
    if (!ownerConfirmed) { setSubmitError("Confirm the payee approval before submitting."); return; }

    setPending(true);
    try {
      await createPayeeAction(formData);
      setForm(EMPTY);
      setOwnerConfirmed(false);
      setErrors({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create the payee.";
      setSubmitError(msg);

      const newFieldErrors: PayeeFormErrors = {};
      const lower = msg.toLowerCase();
      if (lower.includes("invalid_destination_details") || lower.includes("bank details are not right")) {
        newFieldErrors.accountNumber = "Check account number — Perflo reported destination details invalid.";
        newFieldErrors.ifsc = "Check IFSC code — branch code rejected by Perflo.";
      } else if (lower.includes("upi") || lower.includes("vpa")) {
        newFieldErrors.vpa = msg;
      } else if (lower.includes("sender email") || lower.includes("senderaddr") || lower.includes("already exists")) {
        newFieldErrors.senderAddr = msg;
      }

      if (Object.keys(newFieldErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...newFieldErrors }));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="payee-form" aria-label="Add a new payee">
      <div className="payee-form-grid">
        {/* 4 primary fields matching the design: Payee name, Sender email, Recipient nickname, Per-payment cap */}
        <label>
          <span>Payee name</span>
          <input
            name="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Sunrise Textiles"
            style={errors.name ? { borderColor: "#c0392b" } : undefined}
          />
          {errors.name ? <small className="field-error">{errors.name}</small> : null}
        </label>
        <label>
          <span>First name</span>
          <input
            name="firstName"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            placeholder="e.g. Riya"
            style={errors.firstName ? { borderColor: "#c0392b" } : undefined}
          />
          {errors.firstName ? <small className="field-error">{errors.firstName}</small> : null}
        </label>
        <label>
          <span>Last name</span>
          <input
            name="lastName"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            placeholder="e.g. Sharma"
            style={errors.lastName ? { borderColor: "#c0392b" } : undefined}
          />
          {errors.lastName ? <small className="field-error">{errors.lastName}</small> : null}
        </label>
        <label>
          <span>Sender email</span>
          <input
            name="senderAddr"
            value={form.senderAddr}
            onChange={(e) => set("senderAddr", e.target.value)}
            placeholder="accounts@vendor.com"
            style={errors.senderAddr ? { borderColor: "#c0392b" } : undefined}
          />
          {errors.senderAddr ? <small className="field-error">{errors.senderAddr}</small> : null}
        </label>
        <label>
          <span>Recipient nickname</span>
          <input
            name="recipientNickname"
            value={form.name ? `demo-${form.name.toLowerCase().replace(/\s+/g, "-")}` : ""}
            readOnly
            placeholder="e.g. sunrise-textiles"
          />
        </label>
        <label>
          <span>Per-payment cap (₹)</span>
          <input
            name="perPaymentCapInr"
            value={form.perPaymentCapInr}
            onChange={(e) => set("perPaymentCapInr", e.target.value)}
            placeholder="50000"
            inputMode="numeric"
            style={errors.perPaymentCapInr ? { borderColor: "#c0392b" } : undefined}
          />
          {errors.perPaymentCapInr ? <small className="field-error">{errors.perPaymentCapInr}</small> : null}
        </label>

        {/* Payment rail */}
        <label>
          <span>Payment rail</span>
          <select name="rail" value={form.rail} onChange={(e) => set("rail", e.target.value as "upi" | "bank_neft")}>
            <option value="upi">UPI</option>
            <option value="bank_neft">Bank / NEFT</option>
          </select>
        </label>

        {form.rail === "upi" ? (
          <label>
            <span>UPI VPA</span>
            <input
              name="vpa"
              value={form.vpa}
              onChange={(e) => set("vpa", e.target.value)}
              placeholder="name@bank"
              style={errors.vpa ? { borderColor: "#c0392b" } : undefined}
            />
            {errors.vpa ? <small className="field-error">{errors.vpa}</small> : null}
          </label>
        ) : (
          <>
            <label>
              <span>Bank account number</span>
              <input
                name="accountNumber"
                value={form.accountNumber}
                onChange={(e) => set("accountNumber", e.target.value)}
                style={errors.accountNumber ? { borderColor: "#c0392b" } : undefined}
              />
              {errors.accountNumber ? <small className="field-error">{errors.accountNumber}</small> : null}
            </label>
            <label>
              <span>IFSC</span>
              <input
                name="ifsc"
                value={form.ifsc}
                onChange={(e) => set("ifsc", e.target.value)}
                style={errors.ifsc ? { borderColor: "#c0392b" } : undefined}
              />
              {errors.ifsc ? <small className="field-error">{errors.ifsc}</small> : null}
            </label>
          </>
        )}

        <label>
          <span>Total cap (INR)</span>
          <input
            name="totalCapInr"
            value={form.totalCapInr}
            onChange={(e) => set("totalCapInr", e.target.value)}
            style={errors.totalCapInr ? { borderColor: "#c0392b" } : undefined}
          />
          {errors.totalCapInr ? <small className="field-error">{errors.totalCapInr}</small> : null}
        </label>
        <label>
          <span>Max payments</span>
          <input
            name="maxPayments"
            value={form.maxPayments}
            onChange={(e) => set("maxPayments", e.target.value)}
            style={errors.maxPayments ? { borderColor: "#c0392b" } : undefined}
          />
          {errors.maxPayments ? <small className="field-error">{errors.maxPayments}</small> : null}
        </label>
        <label>
          <span>Grant expires</span>
          <input
            type="date"
            name="expiresAt"
            value={form.expiresAt}
            onChange={(e) => set("expiresAt", e.target.value)}
            style={errors.expiresAt ? { borderColor: "#c0392b" } : undefined}
          />
          {errors.expiresAt ? <small className="field-error">{errors.expiresAt}</small> : null}
        </label>
      </div>

      <label className="confirm-row">
        <input
          type="checkbox"
          name="ownerConfirmed"
          checked={ownerConfirmed}
          onChange={(e) => setOwnerConfirmed(e.target.checked)}
        />
        <span>I confirm this payee, rail, and grant. This never sends a payment — it only approves who and how much can later be paid manually.</span>
      </label>

      {lockedByPayeeName ? (
        <p className="field-error" role="status">
          An approval is already in progress for <strong>{lockedByPayeeName}</strong> — Perflo only allows one at a
          time. Try again once it's done.
        </p>
      ) : null}

      {submitError ? <p className="field-error">{submitError}</p> : null}

      <button
        type="submit"
        className="btn btn-primary"
        style={{ marginTop: "4px", width: "fit-content" }}
        disabled={pending || !!lockedByPayeeName}
        title={lockedByPayeeName ? "Another payee's approval is already in progress." : undefined}
      >
        {/* plus icon */}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {pending ? "Saving…" : "Add payee"}
      </button>
    </form>
  );
}
