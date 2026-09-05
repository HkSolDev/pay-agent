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
// delivered ₹99.20 net). A flat rupee floor doesn't actually bound how much
// of a payment the fee eats — ₹200.01 loses the same ~₹100 fee as ₹200.00
// does, just above whatever fixed number was chosen. The floor is instead
// derived from the fee as a percentage: block auto-pay whenever the flat
// fee would take more than AUTO_PAY_MAX_FEE_SHARE of the payment. Default
// fee ₹100 / default max share 10% -> default floor ₹1000. On by default
// (not opt-in) for the same reason as before: fee-safety is a default. See
// DECISIONS.md. AUTO_PAY_MIN_AMOUNT_INR still works as a direct override
// for anyone who wants a flat number instead of the percentage derivation.
const DEFAULT_FEE_INR = 100;
const DEFAULT_MAX_FEE_SHARE = 0.10;

export function amountAboveMinimum(amountInr: number): boolean {
  const overrideRaw = process.env.AUTO_PAY_MIN_AMOUNT_INR;
  if (overrideRaw !== undefined) {
    const floor = Number(overrideRaw);
    if (Number.isFinite(floor) && floor > 0) return amountInr > floor;
  }
  const feeRaw = Number(process.env.AUTO_PAY_FEE_INR);
  const fee = Number.isFinite(feeRaw) && feeRaw > 0 ? feeRaw : DEFAULT_FEE_INR;
  const shareRaw = Number(process.env.AUTO_PAY_MAX_FEE_SHARE);
  const maxFeeShare = Number.isFinite(shareRaw) && shareRaw > 0 ? shareRaw : DEFAULT_MAX_FEE_SHARE;
  return amountInr > fee / maxFeeShare;
}
