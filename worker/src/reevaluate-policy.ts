import { prisma } from "@perflo-ap-agent/db";
// Extensionless relative imports here, unlike this file's own worker-side
// siblings — this module is reachable from the Next.js app bundle (via
// actions.ts), and Next's bundler (unlike tsc) doesn't remap an explicit
// ".js" specifier to the sibling ".ts" source file. Every other worker
// module already reachable from app/app/actions.ts follows this same
// extensionless convention for exactly this reason.
import { decidePolicy, applyCurrencyGuard, type PolicyDecision } from "./policy-engine";
import { loadApprovedPayees } from "./payee-store";
import { loadPayeeUsage } from "./payment-usage";
import { computeGrantStatus, amountWithinOwnerCeiling } from "./auto-pay-eligibility";
import { reviewRetryBlockReason } from "./review-retry";
import type { ApprovedPayee, ResolveResult } from "./payee-resolver";
import type { PayeeUsage } from "./auto-pay-eligibility";

export interface ReevaluatePolicyDeps {
  loadApprovedPayees: () => Promise<ApprovedPayee[]>;
  loadPayeeUsage: (recipientNickname: string) => Promise<PayeeUsage>;
}

const defaultDeps: ReevaluatePolicyDeps = { loadApprovedPayees, loadPayeeUsage };

function authFromJson(value: unknown): { dmarc: string | null; spf: string | null; dkim: string | null } {
  const auth = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    dmarc: typeof auth.dmarc === "string" ? auth.dmarc : null,
    spf: typeof auth.spf === "string" ? auth.spf : null,
    dkim: typeof auth.dkim === "string" ? auth.dkim : null,
  };
}

/**
 * Recomputes `decidePolicy`'s output for an already-processed email using
 * only what's already stored — no re-extraction, no re-classification, no
 * re-verification. Only the things that are allowed to change without
 * re-reading the source email (the current payee grant/auto-pay toggle and
 * the AUTO_PAY_MODE switch) are read fresh; everything else comes straight
 * off the `Email` row's Level 1 evidence.
 *
 * Deliberately never calls runAutoPayIfEligible: recalculating a decision is
 * not the same as acting on it. Callers that want to act on a resulting
 * "auto_pay" must do so explicitly (see resume-auto-pay.ts).
 */
export async function reevaluatePolicy(emailId: string, deps: ReevaluatePolicyDeps = defaultDeps): Promise<{ decision: PolicyDecision; reasons: string[] }> {
  const intent = await prisma.paymentIntent.findUnique({ where: { emailId }, select: { status: true } });
  const blockedReason = reviewRetryBlockReason(intent?.status ?? null);
  if (blockedReason) throw new Error(blockedReason);

  const row = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    select: {
      classification: true,
      classificationConfidence: true,
      injectionDetected: true,
      auth: true,
      extractionSummary: true,
      payeeResolution: true,
      verificationResult: true,
      duplicateResult: true,
      resolvedPayeeId: true,
    },
  });

  if (!row.extractionSummary || !row.payeeResolution || !row.verificationResult || !row.duplicateResult) {
    throw new Error("This email has not completed Level 1 processing yet and cannot be re-evaluated.");
  }

  const extraction = row.extractionSummary as {
    payeeNameConfidence: number;
    amountConfidence: number;
    paymentMethodConfidence: number;
    referenceNumberConfidence: number;
    currencyConfidence: number;
    amount: { value: string; currency: string } | null;
  };
  const resolution = row.payeeResolution as ResolveResult;
  const verification = row.verificationResult as { authPassed: boolean; hardFails: string[]; score: number };
  const duplicate = row.duplicateResult as { duplicate: boolean };
  const auth = authFromJson(row.auth);

  // Rail-trust note: `resolution` is the *original* rail match (sender +
  // payment method) verified back when this email was first processed — it
  // is never re-run here. We only look the payee back up by id to read its
  // CURRENT grant/auto-pay-toggle state. `loadApprovedPayees` already
  // filters to rails with status "active" (payee-rail-lifecycle.ts), so if
  // the specific rail this email matched was since replaced or revoked, the
  // payee can still resolve here via a *different* active rail while the
  // original verification (auth alignment, hard-fail checks) stays keyed to
  // the rail that was live at ingest time. That gap is acceptable for a
  // cheap recompute — a full re-verification is exactly what
  // retryLevel1Processing (ingest.ts) is for — but it means a rail swap
  // between ingest and a resume-auto-pay run is not itself re-detected here.
  const resolvedPayeeId = resolution.status === "resolved" ? resolution.payeeId : row.resolvedPayeeId;
  const approvedPayees = await deps.loadApprovedPayees();
  const resolvedPayee = resolvedPayeeId ? approvedPayees.find((p) => p.payeeId === resolvedPayeeId) : undefined;

  const amountInr = extraction.amount ? Number(extraction.amount.value) : NaN;
  const usage = resolvedPayee && Number.isFinite(amountInr)
    ? await deps.loadPayeeUsage(resolvedPayee.recipientNickname)
    : { totalPaidInr: 0, paidCount: 0 };
  const grant = resolvedPayee && Number.isFinite(amountInr)
    ? computeGrantStatus(resolvedPayee.grant, amountInr, usage)
    : { active: false, notExpired: false, perPaymentCapOk: false, remainingAmountOk: false, remainingCountOk: false };

  const decision = decidePolicy({
    classification: {
      kind: row.classification ?? "unrelated",
      confidence: row.classificationConfidence ?? 0,
      injectionDetected: row.injectionDetected,
    },
    extraction: {
      payeeNameConfidence: extraction.payeeNameConfidence,
      amountConfidence: extraction.amountConfidence,
      paymentMethodConfidence: extraction.paymentMethodConfidence,
      referenceNumberConfidence: extraction.referenceNumberConfidence,
      currencyConfidence: extraction.amount ? extraction.amountConfidence : 0,
    },
    resolution,
    auth: {
      dmarcPass: verification.authPassed && /\bdmarc=pass\b/i.test(auth.dmarc ?? ""),
      alignedSpfDkimPass: verification.authPassed && /\bspf=pass\b/i.test(auth.spf ?? "") && /\bdkim=pass\b/i.test(auth.dkim ?? ""),
    },
    verification,
    duplicate: duplicate.duplicate,
    grant,
    amountWithinOwnerCeiling: Number.isFinite(amountInr) ? amountWithinOwnerCeiling(amountInr) : false,
    paused: process.env.AUTO_PAY_MODE !== "on",
    payeeAutoPayEnabled: resolvedPayee?.grant.autoPayEnabled ?? false,
  });

  const guarded = applyCurrencyGuard(decision, extraction.amount?.currency);

  await prisma.email.update({
    where: { id: emailId },
    data: { policyDecision: guarded.decision, policyReasons: guarded.reasons },
  });

  return guarded;
}
