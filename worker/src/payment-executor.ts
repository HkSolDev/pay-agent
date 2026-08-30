/**
 * Provider-neutral payment execution boundary. The reviewed pipeline above
 * (classifier -> extractor -> resolver -> verifier -> duplicate -> policy)
 * never changes based on which gateway is connected; only the implementation
 * behind this interface does. Perflo, RazorpayX, or any future provider are
 * each just another `PaymentExecutor` — the caller (manual-pay/actions.ts)
 * never branches on provider identity itself.
 *
 * This executor only ever calls a licensed provider's payout API from an
 * account the owner already controls. It must never accept, pool, or hold
 * third-party funds itself — doing so is a different, regulated activity
 * (RBI PPI/escrow) and is explicitly out of scope everywhere in this file.
 */

export type PayoutCurrency = "INR" | "USD";
export type PayoutRail = "upi" | "bank_transfer";

export interface UpiDestination {
  kind: "upi";
  vpa: string;
}

export interface BankDestination {
  kind: "bank_transfer";
  accountNumber: string;
  ifsc: string;
}

export type PayoutDestination = UpiDestination | BankDestination;

export interface CreatePayoutRequest {
  recipientName: string;
  currency: PayoutCurrency;
  rail: PayoutRail;
  destination: PayoutDestination;
  // Integer minor units (paise/cents) — never a decimal string. Callers
  // convert once, at the boundary, so no adapter ever guesses a scale factor.
  amountMinor: bigint;
  // Set once at prepare time by the caller and reused for every retry of
  // this logical payout — never regenerated on retry (same principle the
  // existing PaymentIntent.idempotencyKey already uses).
  idempotencyKey: string;
}

export type PayoutStatus = "processing" | "paid" | "failed" | "unknown";

export interface PayoutResult {
  providerReference: string;
  status: PayoutStatus;
  failureReason?: string;
}

export interface PaymentExecutor {
  createPayout(request: CreatePayoutRequest): Promise<PayoutResult>;
  getPayoutStatus(providerReference: string): Promise<PayoutResult>;
}

/**
 * Thrown by callers translating a PayoutResult back into the throw-based
 * contract `requestManualPayment`/`ManualPayDeps.payRecipient` already use
 * (see worker/src/manual-pay.ts). Mirrors PerfloUnknownOutcomeError's
 * meaning exactly (FR-27: never safe to retry automatically) but is
 * provider-neutral, so a non-Perflo executor's "unknown" status maps to the
 * same never-auto-retried semantics without importing anything Perflo-specific.
 */
export class PaymentUnknownOutcomeError extends Error {
  constructor(message: string, public readonly providerReference?: string) {
    super(message);
  }
}

/** Provider-neutral counterpart to PerfloDefiniteFailure — safe to retry. */
export class PaymentDefiniteFailure extends Error {
  constructor(message: string, public readonly providerReference?: string) {
    super(message);
  }
}
