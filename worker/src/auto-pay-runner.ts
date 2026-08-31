import { randomBytes } from "node:crypto";
import { prisma } from "@perflo-ap-agent/db";
// Extensionless — this module is reachable from the Next.js app bundle (via
// actions.ts -> resume-auto-pay.ts), which needs these without ".js"; see
// the comment in reevaluate-policy.ts.
import { attemptAutoPay } from "./auto-pay-gate";
import type { PolicyDecision } from "./policy-engine.js";
import { executePreparedPayment } from "./payment-execution";

/**
 * Runs after Level 1 writes a `policyDecision` of "auto_pay" for an email
 * (level1-pipeline.ts already required exact confidence, resolved payee,
 * aligned sender auth, an active non-expired grant with room under both
 * caps, and this specific payee having auto-pay turned on, plus the global
 * AUTO_PAY_MODE switch — see policy-engine.ts). This is the one place that
 * turns that label into an actual payment.
 *
 * Deliberately mirrors preparePayment/confirmPayment (app/app/actions.ts)
 * rather than inventing a new path: it writes the exact same PaymentIntent
 * shape a human's "Prepare payment" would, using the resolved payee's
 * nickname and the LLM/extractor's amount — never anything the email itself
 * could have injected as free text — then claims and pays through the same
 * executePreparedPayment used by "Confirm & pay".
 */
export async function runAutoPayIfEligible(input: {
  emailId: string;
  policyDecision: PolicyDecision;
  recipientNickname: string;
  amount: string;
  currency: "INR" | "USD";
}): Promise<void> {
  // executePreparedPayment always records the real outcome on the
  // PaymentIntent row itself (paid/failed/unknown_outcome), same as a
  // human's "Confirm & pay" — that write is what matters. This wrapper only
  // decides whether to attempt it at all and logs what happened; a
  // failed/uncertain outcome here is not a bug to crash the ingest batch
  // over, it's exactly the case the queue's existing Failed/Uncertain pills
  // already handle.
  try {
    await attemptAutoPay(
      { mode: process.env.AUTO_PAY_MODE === "on" ? "on" : "off", policyDecision: input.policyDecision, emailId: input.emailId },
      {
        claimPayment: async (emailId) => {
          // "Prepare," in auto-pay's case: the PaymentIntent doesn't exist
          // yet (no human clicked anything), so create it here — same
          // upsert preparePayment does, same fresh idempotencyKey-once rule.
          const idempotencyKey = randomBytes(16).toString("hex");
          await prisma.paymentIntent.upsert({
            where: { emailId },
            create: { emailId, recipientNickname: input.recipientNickname, amount: input.amount, currency: input.currency, idempotencyKey },
            update: {},
          });
          return { idempotencyKey };
        },
        executePayment: async () => {
          const result = await executePreparedPayment(input.emailId);
          console.log(`[auto-pay] ${input.emailId}: ${result.status}${result.lastError ? ` (${result.lastError})` : ""}`);
          return { paymentReference: result.paymentReference ?? "" };
        },
      },
    );
  } catch (err) {
    console.error(`[auto-pay] unexpected error for ${input.emailId}:`, err instanceof Error ? err.message : err);
  }
}
