import type { ApprovedPayee } from "./payee-resolver.js";

export interface PayeeUsage {
  totalPaidInr: number;
  paidCount: number;
}

export interface GrantStatus {
  active: boolean;
  notExpired: boolean;
  perPaymentCapOk: boolean;
  remainingAmountOk: boolean;
  remainingCountOk: boolean;
}

/**
 * Pure translation from a payee's static grant terms + how much of it has
 * already been used to the booleans policy-engine.ts's decidePolicy expects.
 * Kept separate from the DB read (payment-usage.ts) for the same reason the
 * rest of Level 1 is split this way: testable without Postgres.
 */
export function computeGrantStatus(
  payee: Pick<ApprovedPayee["grant"], "payeeStatus" | "perPaymentCapInr" | "totalCapInr" | "maxPayments" | "expiresAt">,
  amountInr: number,
  usage: PayeeUsage,
): GrantStatus {
  const active = payee.payeeStatus === "approved";
  const notExpired = payee.expiresAt === null || new Date(payee.expiresAt).getTime() > Date.now();
  const perPaymentCapOk = payee.perPaymentCapInr === null || amountInr <= Number(payee.perPaymentCapInr);
  const remainingAmountOk = payee.totalCapInr === null || usage.totalPaidInr + amountInr <= Number(payee.totalCapInr);
  const remainingCountOk = payee.maxPayments === null || usage.paidCount < payee.maxPayments;
  return { active, notExpired, perPaymentCapOk, remainingAmountOk, remainingCountOk };
}

// A second, deployment-wide ceiling on top of each payee's own per-payment
// cap — a deliberately conservative extra guardrail for auto-pay
// specifically (manual "Confirm & pay" is not affected by this at all).
// Unset means no extra ceiling beyond the payee's own grant.
export function amountWithinOwnerCeiling(amountInr: number): boolean {
  const raw = process.env.AUTO_PAY_MAX_AMOUNT_INR;
  if (!raw) return true;
  const ceiling = Number(raw);
  if (!Number.isFinite(ceiling) || ceiling <= 0) return true;
  return amountInr <= ceiling;
}

// The mirror image of amountWithinOwnerCeiling: a floor, not a ceiling.
// Perflo charges a flat payout fee (confirmed live: a ₹200 payment only
// delivered ₹99.20 net) — auto-pay firing on a small invoice can hand most
// or all of it to the fee with no owner in the loop to notice. Unlike the
// ceiling, this one is on by default (₹200) rather than defaulting to "no
// restriction": fee-safety is a default, not an opt-in. See DECISIONS.md.
export function amountAboveMinimum(amountInr: number): boolean {
  const raw = process.env.AUTO_PAY_MIN_AMOUNT_INR;
  const floor = raw === undefined ? 200 : Number(raw);
  if (!Number.isFinite(floor) || floor <= 0) return amountInr > 200;
  return amountInr > floor;
}
