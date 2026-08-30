import { validatePaymentMethod, type PaymentMethod } from "../../worker/src/payment-method-validation";

export interface PayeeFormInput {
  name: string;
  senderAddr: string;
  rail: "upi" | "bank_neft";
  vpa: string;
  accountNumber: string;
  ifsc: string;
  perPaymentCapInr: string;
  totalCapInr: string;
  maxPayments: string;
  expiresAt: string;
}

export type PayeeFormErrors = Partial<Record<keyof PayeeFormInput, string>>;

const EMAIL = /^[^@\s]+@[^@\s]+$/;

function positiveMoney(value: string): boolean {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

/** Same shape as ApprovePayeeRequest.paymentMethod, built from raw form fields. */
export function paymentMethodFromForm(input: PayeeFormInput): PaymentMethod {
  return input.rail === "upi"
    ? { kind: "upi", vpa: input.vpa }
    : { kind: "bank_neft", accountNumber: input.accountNumber, ifsc: input.ifsc };
}

/**
 * Mirrors approvePayee's own validRequest exactly (worker/src/payee-approval.ts)
 * but per-field, so the UI can show an inline error next to the field that
 * failed instead of one opaque "invalid request" message. This is intentionally
 * duplicated logic, not a shared helper: the server action still calls the
 * real approvePayee and is the actual gate — this only makes the same gate
 * visible before submit.
 */
export function validatePayeeForm(input: PayeeFormInput): { valid: boolean; errors: PayeeFormErrors } {
  const errors: PayeeFormErrors = {};

  if (input.name.trim() === "") errors.name = "Payee name is required.";
  if (!EMAIL.test(input.senderAddr)) errors.senderAddr = "Enter a valid sender email identity.";

  const method = paymentMethodFromForm(input);
  if (!validatePaymentMethod(method)) {
    if (input.rail === "upi") {
      errors.vpa = "Enter a real UPI VPA — an ordinary email address is not accepted.";
    } else {
      if (!/^\d{9,18}$/.test(input.accountNumber)) errors.accountNumber = "Enter a valid bank account number (9–18 digits).";
      if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(input.ifsc)) errors.ifsc = "Enter a valid IFSC code.";
    }
  }

  if (!positiveMoney(input.perPaymentCapInr)) errors.perPaymentCapInr = "Per-payment cap must be a positive amount.";
  if (!positiveMoney(input.totalCapInr)) errors.totalCapInr = "Total cap must be a positive amount.";
  if (!Number.isInteger(Number(input.maxPayments)) || Number(input.maxPayments) <= 0) {
    errors.maxPayments = "Max payments must be a positive whole number.";
  }
  if (Number.isNaN(Date.parse(input.expiresAt))) errors.expiresAt = "Enter a valid expiry date.";

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Raw bank/UPI values are never rendered after saving — only this masked form. */
export function maskRailValue(method: PaymentMethod): string {
  if (method.kind === "upi") {
    const [, domain] = method.vpa.split("@");
    return `••••@${domain ?? ""}`;
  }
  const last4 = method.accountNumber.slice(-4);
  return `${"•".repeat(Math.max(method.accountNumber.length - 4, 0))}${last4} · ${method.ifsc}`;
}
