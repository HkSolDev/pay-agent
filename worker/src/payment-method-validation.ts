/**
 * The one validation boundary for payment rails. Both deterministic parsing
 * and LLM output must use this module: accepting a method in one path that
 * the other rejects creates an unsafe, hard-to-review split in behaviour.
 */
export interface UpiPaymentMethod {
  kind: "upi";
  vpa: string;
}

export interface BankPaymentMethod {
  kind: "bank_neft";
  accountNumber: string;
  ifsc: string;
  beneficiaryName?: string;
}

export type PaymentMethod = UpiPaymentMethod | BankPaymentMethod;

const VPA = /^[\w.-]{2,}@[a-zA-Z][\w.-]{1,}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER = /^\d{9,18}$/;

// Email-like strings occur in invoices constantly. These are consumer mail
// domains, never payment-service providers, so accepting them as UPI would
// turn a contact address into a payment destination.
const NON_UPI_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "example.com",
]);

export function normalizePaymentMethod(method: PaymentMethod): PaymentMethod | null {
  if (method.kind === "upi") {
    const vpa = method.vpa.toLowerCase();
    const domain = vpa.split("@")[1];
    if (!VPA.test(vpa) || !domain || NON_UPI_EMAIL_DOMAINS.has(domain)) return null;
    return { kind: "upi", vpa };
  }

  const ifsc = method.ifsc.toUpperCase();
  if (!ACCOUNT_NUMBER.test(method.accountNumber) || !IFSC.test(ifsc)) return null;
  return {
    kind: "bank_neft",
    accountNumber: method.accountNumber,
    ifsc,
    ...(method.beneficiaryName ? { beneficiaryName: method.beneficiaryName.trim() } : {}),
  };
}

export function validatePaymentMethod(method: PaymentMethod): boolean {
  return normalizePaymentMethod(method) !== null;
}
