// Matches what the real Perflo CLI's --amount flag actually accepts: a
// plain positive number in the account's local currency, e.g. "500" or
// "499.50" — confirmed against `perflo recipient pay --help`, not guessed.
// No currency symbol here; perflo-cli.ts adds the ₹ prefix itself for INR.
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

export interface PaymentInputValidation {
  ok: boolean;
  error?: string;
}

/**
 * Checked at prepare time, before a PaymentIntent row is even created —
 * catches "abc" or "-5" or "" before they become an avoidable failed Perflo
 * call. Perflo would likely reject these too, but a wasted real network
 * round-trip (and a confusing "Failed" row) is worse than a same-page error.
 */
export function validatePaymentInput(recipientNickname: string, amount: string): PaymentInputValidation {
  if (!recipientNickname.trim()) {
    return { ok: false, error: "Recipient nickname is required." };
  }
  if (!AMOUNT_PATTERN.test(amount.trim())) {
    return { ok: false, error: `"${amount}" is not a valid amount — use a plain positive number, e.g. 500.` };
  }
  if (Number(amount) <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }
  return { ok: true };
}
