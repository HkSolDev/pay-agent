import type { ClassificationResult } from "./classifier.js";
import type { ExtractionInput, ExtractionResult, PaymentMethod } from "./extractor.js";
import { normalizePaymentMethod } from "./payment-method-validation.js";
import { findDuplicate, type DuplicateResult, type PayableFingerprint } from "./duplicate-detector.js";
import { decidePolicy, applyCurrencyGuard, type PolicyDecision } from "./policy-engine.js";
import { resolvePayee, type ApprovedPayee, type ResolveResult } from "./payee-resolver.js";
import { verifyEmail, type VerificationResult } from "./verifier.js";
import { computeGrantStatus, amountWithinOwnerCeiling, amountAboveMinimum, type PayeeUsage } from "./auto-pay-eligibility.js";

export interface Level1PipelineInput {
  emailId: string;
  extractionInput: ExtractionInput;
  classification: ClassificationResult;
  auth: { dmarc: string | null; spf: string | null; dkim: string | null };
  replyTo: string | null;
  links: Array<{ href: string; finalDomain: string; visibleText: string }>;
  approvedPayees: ApprovedPayee[];
  duplicateHistory: PayableFingerprint[];
  // How much of the resolved payee's total-cap/max-payments grant is
  // already used. Only called when a payee actually resolves — a DB read,
  // injected the same way `extract` is, so this file stays testable without
  // Postgres. Defaults to "nothing used yet" for callers (existing tests)
  // that don't care about auto-pay at all.
  loadPayeeUsage?: (recipientNickname: string) => Promise<PayeeUsage>;
}

export interface Level1PipelineResult {
  extraction: ExtractionResult;
  resolution: ResolveResult;
  verification: VerificationResult;
  duplicate: DuplicateResult;
  decision: PolicyDecision;
  reasons: string[];
}

export function paymentMethodKey(method: PaymentMethod): string | null {
  const normalized = normalizePaymentMethod(method);
  if (!normalized) return null;
  return normalized.kind === "upi"
    ? `upi:${normalized.vpa}`
    : `bank_neft:${normalized.accountNumber}:${normalized.ifsc}`;
}

function notPayableResult(classification: ClassificationResult, extraction: ExtractionResult): Level1PipelineResult {
  const verification = verifyEmail({
    fromAddr: "",
    replyTo: null,
    auth: { dmarc: null, spf: null, dkim: null },
    knownSenderAddrs: [],
    knownPaymentMethodKeys: [],
    extractedPaymentMethodKeys: [],
    links: [],
    injectionDetected: classification.injectionDetected,
  });
  const resolution: ResolveResult = { status: "new_payee" };
  const duplicate: DuplicateResult = { duplicate: false };
  if (classification.injectionDetected) {
    const decision = decidePolicy({
      classification,
      extraction: { payeeNameConfidence: 0, amountConfidence: 0, paymentMethodConfidence: 0, referenceNumberConfidence: 0, currencyConfidence: 0 },
      resolution,
      auth: { dmarcPass: false, alignedSpfDkimPass: false },
      verification,
      duplicate: false,
      grant: { active: false, notExpired: false, perPaymentCapOk: false, remainingAmountOk: false, remainingCountOk: false },
      amountWithinOwnerCeiling: false,
      amountAboveMinimum: false,
      paused: true,
    });
    return { extraction, resolution, verification, duplicate, decision: decision.decision, reasons: decision.reasons };
  }
  return { extraction, resolution, verification, duplicate, decision: "ignore", reasons: ["Classification is not payable."] };
}

/**
 * Combines Level 1 evidence but deliberately does not execute payments.
 * Unknown or incomplete information becomes `needs_approval`; the only
 * automatic outcomes at this stage are safe ignore/quarantine labels.
 */
export async function processLevel1(
  input: Level1PipelineInput,
  extract: (input: ExtractionInput) => Promise<ExtractionResult>,
): Promise<Level1PipelineResult> {
  const extraction = await extract(input.extractionInput);
  if (!['invoice', 'payment_request', 'reminder'].includes(input.classification.kind)) {
    return notPayableResult(input.classification, extraction);
  }

  const methods = extraction.paymentMethods.map(paymentMethodKey).filter((key): key is string => key !== null);
  const knownSenders = input.approvedPayees.map((payee) => payee.senderAddr);
  const knownMethods = input.approvedPayees.map((payee) => paymentMethodKey(payee.paymentMethod)).filter((key): key is string => key !== null);
  const verification = verifyEmail({
    fromAddr: input.extractionInput.fromAddr ?? "",
    replyTo: input.replyTo,
    auth: input.auth,
    knownSenderAddrs: knownSenders,
    knownPaymentMethodKeys: knownMethods,
    extractedPaymentMethodKeys: methods,
    links: input.links,
    injectionDetected: input.classification.injectionDetected,
  });
  const resolution: ResolveResult = extraction.paymentMethods.length === 1
    ? resolvePayee({ senderAddr: input.extractionInput.fromAddr ?? "", paymentMethod: extraction.paymentMethods[0], allowAnySender: process.env.DEMO_MODE === "true" }, input.approvedPayees)
    : extraction.paymentMethods.length > 1 ? { status: "multiple_payment_methods" } : { status: "new_payee" };
  // An unresolved multi-rail invoice is always ordinary owner review: there
  // was never one approved method to compare against, so the mismatch
  // signal is noise regardless of auth. A changed rail from an
  // already-known sender (`details_changed`) is also ordinary owner review
  // — PRD Section 8.1 row #3 — but only when the message itself
  // authenticates; a details change riding on a DMARC/SPF+DKIM alignment
  // failure is the takeover pattern PRD Section 15 T-17 requires hard
  // quarantine for, so the hard fail must survive in that case instead of
  // being stripped like a legitimate detail update. A sender/rail belonging
  // to different payees remains a quarantine through identity_method_conflict.
  if (resolution.status === "multiple_payment_methods" || (resolution.status === "details_changed" && verification.authPassed)) {
    verification.hardFails = verification.hardFails.filter((fail) => fail !== "payment_method_mismatch");
  }
  const resolvedPayeeId = resolution.status === "resolved" ? resolution.payeeId : null;
  const referenceIsFallback = extraction.referenceNumberConfidence > 0 && extraction.referenceNumberConfidence < 0.85;
  const duplicate: DuplicateResult = resolvedPayeeId && extraction.amount
    ? findDuplicate({ emailId: input.emailId, payeeId: resolvedPayeeId, referenceNumber: extraction.referenceNumber, referenceIsFallback, amount: extraction.amount }, input.duplicateHistory)
    : { duplicate: false };
  // Only meaningful once a payee has actually resolved — everything else
  // (new_payee, details_changed, etc.) already fails decidePolicy's
  // resolution check on its own, so there's nothing to look up yet.
  const resolvedPayee = resolvedPayeeId ? input.approvedPayees.find((p) => p.payeeId === resolvedPayeeId) : undefined;
  const currency = extraction.amount?.currency;
  const amountInr = extraction.amount ? Number(extraction.amount.value) : NaN;
  const usage = resolvedPayee && Number.isFinite(amountInr)
    ? await (input.loadPayeeUsage ?? (async () => ({ totalPaidInr: 0, paidCount: 0 })))(resolvedPayee.recipientNickname)
    : { totalPaidInr: 0, paidCount: 0 };
  const grant = resolvedPayee && Number.isFinite(amountInr)
    ? computeGrantStatus(resolvedPayee.grant, amountInr, usage)
    : { active: false, notExpired: false, perPaymentCapOk: false, remainingAmountOk: false, remainingCountOk: false };

  const decision = decidePolicy({
    classification: input.classification,
    extraction: {
      payeeNameConfidence: extraction.payeeNameConfidence,
      amountConfidence: extraction.amountConfidence,
      paymentMethodConfidence: extraction.paymentMethodConfidence,
      referenceNumberConfidence: extraction.referenceNumberConfidence,
      currencyConfidence: extraction.amount ? extraction.amountConfidence : 0,
    },
    resolution,
    auth: {
      dmarcPass: verification.authPassed && /\bdmarc=pass\b/i.test(input.auth.dmarc ?? ""),
      alignedSpfDkimPass: verification.authPassed && /\bspf=pass\b/i.test(input.auth.spf ?? "") && /\bdkim=pass\b/i.test(input.auth.dkim ?? ""),
    },
    verification,
    duplicate: duplicate.duplicate,
    grant,
    amountWithinOwnerCeiling: Number.isFinite(amountInr) ? amountWithinOwnerCeiling(amountInr) : false,
    amountAboveMinimum: Number.isFinite(amountInr) ? amountAboveMinimum(amountInr) : false,
    // The global kill switch — unset/anything but "on" means every payment
    // stays needs_approval no matter what else checks out, same as the
    // hardcoded-true behavior this replaces.
    paused: process.env.AUTO_PAY_MODE !== "on",
    payeeAutoPayEnabled: resolvedPayee?.grant.autoPayEnabled ?? false,
  });
  const guarded = applyCurrencyGuard(decision, currency);
  return { extraction, resolution, verification, duplicate, decision: guarded.decision, reasons: guarded.reasons };
}
