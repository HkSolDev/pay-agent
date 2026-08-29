export interface ManualPayRequest {
  emailId: string;
  confirmedByOwner: boolean;
}

export interface PayableEmail {
  emailId: string;
  recipientNickname: string;
  amount: string;
  currency: string;
}

export interface PaymentClaim {
  intentId: string;
  idempotencyKey: string;
}

export interface PayResult {
  paymentReference: string;
}

export interface ManualPayDeps {
  loadPayableEmail: (emailId: string) => Promise<PayableEmail>;
  claimPayment: (emailId: string) => Promise<PaymentClaim | null>;
  payRecipient: (args: {
    nickname: string;
    amount: string;
    currency: string;
    idempotencyKey: string;
  }) => Promise<PayResult>;
}

/**
 * The Level 0 manual Pay button's actual logic. "Locked" means: the browser
 * only ever sends an emailId and a yes/no confirmation — never an amount.
 * Every number that reaches Perflo comes from `loadPayableEmail`'s own
 * database read here, never from whatever the UI happened to send — the LLM
 * (and the browser) never control money, only this deterministic code does.
 *
 * `claimPayment` returning null means another worker already owns this
 * payment's row lock — we back off rather than pay a second time (FR-24).
 */
export async function requestManualPayment(
  request: ManualPayRequest,
  deps: ManualPayDeps,
): Promise<{ intentId: string; paymentReference: string }> {
  if (!request.confirmedByOwner) {
    throw new Error("Payment requires explicit owner confirmation.");
  }

  const payable = await deps.loadPayableEmail(request.emailId);
  const claim = await deps.claimPayment(request.emailId);
  if (!claim) {
    throw new Error("This payment is already being processed by another worker.");
  }

  const result = await deps.payRecipient({
    nickname: payable.recipientNickname,
    amount: payable.amount,
    currency: payable.currency,
    idempotencyKey: claim.idempotencyKey,
  });

  return { intentId: claim.intentId, paymentReference: result.paymentReference };
}
