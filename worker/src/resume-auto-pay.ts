import { prisma } from "@perflo-ap-agent/db";
// Extensionless — see the comment in reevaluate-policy.ts: this module is
// reachable from the Next.js app bundle, which needs these without ".js".
import { GLOBAL_PAUSE_REASON } from "./policy-engine";
import { reevaluatePolicy } from "./reevaluate-policy";
import { runAutoPayIfEligible } from "./auto-pay-runner";

export interface ResumeAutoPaySummary {
  scanned: number;
  paid: string[];
  stillBlocked: Array<{ emailId: string; reasons: string[] }>;
  errors: Array<{ emailId: string; error: string }>;
}

export interface ResumeAutoPayDeps {
  reevaluatePolicy: typeof reevaluatePolicy;
  runAutoPayIfEligible: typeof runAutoPayIfEligible;
}

const defaultDeps: ResumeAutoPayDeps = { reevaluatePolicy, runAutoPayIfEligible };

/**
 * The one explicit, narrowly-scoped action that actually turns previously
 * queued invoices into real payments after AUTO_PAY_MODE is switched on.
 * Only touches invoices whose stored policy reasons are *exactly*
 * ["Global pause is enabled."] — a payee whose own auto-pay toggle happens
 * to be off, or an invoice blocked by anything else, is left untouched here.
 * Every guardrail (payee, amount, currency, duplicate, authentication,
 * grant, rail) is re-checked live via reevaluatePolicy before anything is
 * paid, and payment itself goes through the same idempotent claim-then-pay
 * path ingest.ts already uses, so re-running this action is always safe.
 */
export async function resumeAutoPayForEligibleInvoices(
  deps: ResumeAutoPayDeps = defaultDeps,
  // Restricts the scan to these email ids when provided. Production calls
  // omit it and scan every needs_approval row, as designed; it exists so
  // tests can run against a real database without touching unrelated rows.
  scopeToEmailIds?: string[],
): Promise<ResumeAutoPaySummary> {
  const candidates = await prisma.email.findMany({
    where: { policyDecision: "needs_approval", ...(scopeToEmailIds ? { id: { in: scopeToEmailIds } } : {}) },
    select: { id: true, policyReasons: true, payeeResolution: true, extractionSummary: true },
  });

  const summary: ResumeAutoPaySummary = { scanned: 0, paid: [], stillBlocked: [], errors: [] };

  for (const row of candidates) {
    if (row.policyReasons.length !== 1 || row.policyReasons[0] !== GLOBAL_PAUSE_REASON) continue;
    summary.scanned += 1;

    try {
      const result = await deps.reevaluatePolicy(row.id);
      if (result.decision !== "auto_pay") {
        summary.stillBlocked.push({ emailId: row.id, reasons: result.reasons });
        continue;
      }

      // Only the recipient nickname (a stable identifier) comes from the
      // stored resolution here — never a raw account/VPA. The actual rail
      // that gets paid is looked up fresh from the *current* approved-payee
      // table by this nickname inside payViaConfiguredExecutor
      // (payment-executor-select.ts), the same way runAutoPayIfEligible
      // already works for a normal ingest-time auto-pay. So even if the
      // payee's rail was replaced after this email was first processed, the
      // live/current rail is what actually gets paid — not a stale one
      // captured back at ingest time.
      const resolution = row.payeeResolution as { status: string; recipientNickname?: string } | null;
      const amount = (row.extractionSummary as { amount?: { value: string; currency: "INR" | "USD" } | null } | null)?.amount;
      if (resolution?.status !== "resolved" || !resolution.recipientNickname || !amount) {
        summary.stillBlocked.push({ emailId: row.id, reasons: ["Missing resolved payee or amount for auto-pay."] });
        continue;
      }

      await deps.runAutoPayIfEligible({
        emailId: row.id,
        policyDecision: "auto_pay",
        recipientNickname: resolution.recipientNickname,
        amount: amount.value,
        currency: amount.currency,
      });
      summary.paid.push(row.id);
    } catch (error) {
      summary.errors.push({ emailId: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return summary;
}
