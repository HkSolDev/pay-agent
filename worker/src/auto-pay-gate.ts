import type { PolicyDecision } from "./policy-engine.js";

export interface AutoPayDeps {
  claimPayment: (emailId: string) => Promise<{ idempotencyKey: string } | null>;
  executePayment: (claim: { idempotencyKey: string }) => Promise<{ paymentReference: string }>;
}

export interface AutoPayInput {
  mode: "on" | "off";
  policyDecision: PolicyDecision;
  emailId: string;
}

/**
 * This gate is deliberately separate from policy. A policy label alone never
 * sends money: the default-off switch and the existing atomic claim are both
 * required before the injected executor can run.
 */
export async function attemptAutoPay(input: AutoPayInput, deps: AutoPayDeps): Promise<
  { status: "disabled" | "not_eligible" | "already_claimed_or_not_payable" } | { status: "executed"; paymentReference: string }
> {
  if (input.mode !== "on") return { status: "disabled" };
  if (input.policyDecision !== "auto_pay") return { status: "not_eligible" };
  const claim = await deps.claimPayment(input.emailId);
  if (!claim) return { status: "already_claimed_or_not_payable" };
  const result = await deps.executePayment(claim);
  return { status: "executed", paymentReference: result.paymentReference };
}
