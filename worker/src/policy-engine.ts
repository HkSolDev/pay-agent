import type { ResolveResult } from "./payee-resolver.js";

// FR-19's decision. A pure gate — every input it needs (verifier score,
// grant status, auth alignment, duplicate/pause state) is passed in, not
// computed here, so this function is honest about what it actually checks
// and nothing more. It never calls Perflo itself; `auto_pay` is a label on
// the decision, not an action — whether anything acts on it automatically
// is a separate, deliberately gated concern (AUTO_PAY_MODE).

export type PolicyDecision = "auto_pay" | "needs_approval" | "quarantine" | "ignore";

export interface PolicyInput {
  classification: { kind: string; confidence: number; injectionDetected: boolean };
  extraction: {
    payeeNameConfidence: number;
    amountConfidence: number;
    paymentMethodConfidence: number;
    referenceNumberConfidence: number;
    currencyConfidence: number;
  };
  resolution: ResolveResult;
  auth: { dmarcPass: boolean; alignedSpfDkimPass: boolean };
  verification: { hardFails: string[]; score: number; unverified?: boolean };
  duplicate: boolean;
  grant: { active: boolean; notExpired: boolean; perPaymentCapOk: boolean; remainingAmountOk: boolean; remainingCountOk: boolean };
  amountWithinOwnerCeiling: boolean;
  // Fee-safety floor, the mirror of amountWithinOwnerCeiling: false means
  // the amount is at or below AUTO_PAY_MIN_AMOUNT_INR, where Perflo's flat
  // payout fee would eat most or all of the payment (confirmed live: a
  // ₹200 payment delivered ₹99.20 net). See auto-pay-eligibility.ts.
  amountAboveMinimum: boolean;
  paused: boolean;
  // Per-payee opt-in (worker/src/auto-pay-gate.ts's other half of the gate,
  // alongside the global AUTO_PAY_MODE switch this `paused` field already
  // represents). Optional and defaults to true so every existing caller
  // that doesn't care about this axis keeps behaving exactly as before.
  payeeAutoPayEnabled?: boolean;
}

const CONFIDENCE_BAR = 0.9;
const VERIFIER_SCORE_BAR = 80;

// Named so callers that need to distinguish these two runtime/config
// switches from every other (data-driven) blocker below don't have to
// re-type or guess the exact reason text.
export const GLOBAL_PAUSE_REASON = "Global pause is enabled.";
export const PAYEE_AUTOPAY_DISABLED_REASON = "Auto-pay is not enabled for this payee.";

export function decidePolicy(input: PolicyInput): { decision: PolicyDecision; reasons: string[] } {
  // Quarantine: the most severe outcome, checked first and independent of
  // everything else. FR-16's exact-match rule failing this way (identity
  // and payment method each individually known, but to different payees)
  // is the core BEC-fraud shape, not an ordinary soft gate.
  const quarantineReasons: string[] = [];
  if (input.classification.injectionDetected) quarantineReasons.push("Prompt-injection attempt detected.");
  if (input.resolution.status === "identity_method_conflict") {
    quarantineReasons.push("Sender and payment method are each known, but belong to different payees.");
  }
  if (input.verification.hardFails.length > 0) {
    quarantineReasons.push(`Verifier hard fail: ${input.verification.hardFails.join(", ")}.`);
  }
  if (quarantineReasons.length > 0) return { decision: "quarantine", reasons: quarantineReasons };

  // Section 9.2: a duplicate is visible in the queue and never paid,
  // auto or otherwise — checked before the ordinary approval gates below.
  if (input.duplicate) return { decision: "ignore", reasons: ["Duplicate or replayed invoice."] };

  const reasons: string[] = [];

  if (input.classification.confidence < CONFIDENCE_BAR) {
    reasons.push(`Classification confidence (${input.classification.confidence}) below ${CONFIDENCE_BAR}.`);
  }
  // An exact resolved status independently binds the sender and payment rail
  // to one already-approved payee, which is stronger identity evidence than
  // the extracted display name. All non-resolved statuses keep the raw name
  // confidence gate, so new or changed payees remain owner-review-only.
  const fieldConfidences: Record<string, number> = {
    amount: input.extraction.amountConfidence,
    paymentMethod: input.extraction.paymentMethodConfidence,
    referenceNumber: input.extraction.referenceNumberConfidence,
    currency: input.extraction.currencyConfidence,
  };
  if (input.resolution.status !== "resolved") fieldConfidences.payeeName = input.extraction.payeeNameConfidence;
  for (const [field, confidence] of Object.entries(fieldConfidences)) {
    if (confidence < CONFIDENCE_BAR) reasons.push(`${field} confidence (${confidence}) below ${CONFIDENCE_BAR}.`);
  }

  if (input.resolution.status !== "resolved") {
    reasons.push(`Payee not fully resolved (status: ${input.resolution.status}).`);
  }

  if (!input.auth.dmarcPass && !input.auth.alignedSpfDkimPass) {
    reasons.push("Sender authentication not aligned (no DMARC pass, no aligned SPF+DKIM).");
  }

  if (input.verification.score < VERIFIER_SCORE_BAR) {
    reasons.push(`Verifier score (${input.verification.score}) below ${VERIFIER_SCORE_BAR}.`);
  }
  if (input.verification.unverified) reasons.push("Paid verifier checks are unverified.");

  const grantOk = input.grant.active && input.grant.notExpired && input.grant.perPaymentCapOk
    && input.grant.remainingAmountOk && input.grant.remainingCountOk;
  if (!grantOk) reasons.push("Grant is not active, is expired, or a cap would be exceeded.");

  if (!input.amountWithinOwnerCeiling) reasons.push("Amount exceeds the owner's auto-pay ceiling.");
  if (!input.amountAboveMinimum) reasons.push("Amount is at or below the auto-pay fee-safety minimum.");

  if (input.paused) reasons.push(GLOBAL_PAUSE_REASON);
  if (input.payeeAutoPayEnabled === false) reasons.push(PAYEE_AUTOPAY_DISABLED_REASON);

  if (reasons.length > 0) return { decision: "needs_approval", reasons };

  return { decision: "auto_pay", reasons: [] };
}

// Auto-pay only ever moves INR today — grant caps/usage accounting is
// INR-denominated, so a USD "auto_pay" would silently misapply those limits.
// Shared by the normal pipeline (level1-pipeline.ts) and the policy-only
// re-evaluation path (reevaluate-policy.ts) so the two never drift apart.
export function applyCurrencyGuard(
  decision: { decision: PolicyDecision; reasons: string[] },
  currency: string | undefined,
): { decision: PolicyDecision; reasons: string[] } {
  if (currency && currency !== "INR" && decision.decision === "auto_pay") {
    return {
      decision: "needs_approval",
      reasons: [...decision.reasons, "Auto-pay is only supported for INR while grant limits are INR-denominated."],
    };
  }
  return decision;
}
