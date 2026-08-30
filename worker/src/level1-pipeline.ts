import type { ClassificationResult } from "./classifier.js";
import type { ExtractionInput, ExtractionResult, PaymentMethod } from "./extractor.js";
import { normalizePaymentMethod } from "./payment-method-validation.js";
import { findDuplicate, type DuplicateResult, type PayableFingerprint } from "./duplicate-detector.js";
import { decidePolicy, type PolicyDecision } from "./policy-engine.js";
import { resolvePayee, type ApprovedPayee, type ResolveResult } from "./payee-resolver.js";
import { verifyEmail, type VerificationResult } from "./verifier.js";

export interface Level1PipelineInput {
  emailId: string;
  extractionInput: ExtractionInput;
  classification: ClassificationResult;
  auth: { dmarc: string | null; spf: string | null; dkim: string | null };
  replyTo: string | null;
  links: Array<{ href: string; finalDomain: string; visibleText: string }>;
  approvedPayees: ApprovedPayee[];
  duplicateHistory: PayableFingerprint[];
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
    ? resolvePayee({ senderAddr: input.extractionInput.fromAddr ?? "", paymentMethod: extraction.paymentMethods[0] }, input.approvedPayees)
    : extraction.paymentMethods.length > 1 ? { status: "multiple_payment_methods" } : { status: "new_payee" };
  const resolvedPayeeId = resolution.status === "resolved" ? resolution.payeeId : null;
  const referenceIsFallback = extraction.referenceNumberConfidence > 0 && extraction.referenceNumberConfidence < 0.85;
  const duplicate: DuplicateResult = resolvedPayeeId && extraction.amount
    ? findDuplicate({ emailId: input.emailId, payeeId: resolvedPayeeId, referenceNumber: extraction.referenceNumber, referenceIsFallback, amount: extraction.amount }, input.duplicateHistory)
    : { duplicate: false };
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
    // Grant management and automatic execution are deliberately not wired
    // during KYC pending/dry-run mode, so the policy cannot yield auto_pay.
    grant: { active: false, notExpired: false, perPaymentCapOk: false, remainingAmountOk: false, remainingCountOk: false },
    amountWithinOwnerCeiling: false,
    paused: true,
  });
  return { extraction, resolution, verification, duplicate, decision: decision.decision, reasons: decision.reasons };
}
