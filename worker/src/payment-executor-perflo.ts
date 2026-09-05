import type { CreatePayoutRequest, PayoutResult, PaymentExecutor } from "./payment-executor";
import {
  getPerfloTxStatus,
  PerfloDefiniteFailure,
  PerfloUnknownOutcomeError,
  type PerfloPayResult,
  type PerfloTxStatusResult,
} from "./perflo-cli";

/** Integer minor units -> the decimal string Perflo's CLI/`--amount` flag expects. */
function minorUnitsToDecimalString(amountMinor: bigint): string {
  const hundred = BigInt(100);
  const whole = amountMinor / hundred;
  const fraction = amountMinor % hundred;
  return fraction === BigInt(0) ? whole.toString() : `${whole}.${fraction.toString().padStart(2, "0")}`;
}

export interface PerfloExecutorConfig {
  // Perflo's CLI addresses recipients by nickname, not by rail/destination —
  // the nickname is resolved by the caller (from the approved Payee record)
  // before this executor is invoked.
  recipientNickname: string;
  payViaPerfloCli: (args: {
    nickname: string;
    amount: string;
    currency: string;
    idempotencyKey?: string;
  }) => Promise<PerfloPayResult>;
  getPayoutStatusViaPerfloCli?: (paymentReference: string) => Promise<PerfloTxStatusResult>;
}

/**
 * Adapts the existing Perflo CLI integration to the provider-neutral
 * PaymentExecutor interface, so Perflo is just another implementation
 * rather than the pipeline's only option. No behavior of the underlying
 * CLI call changes; this is a pure boundary/error-mapping wrapper.
 */
export function createPerfloExecutor(config: PerfloExecutorConfig): PaymentExecutor {
  return {
    async createPayout(request: CreatePayoutRequest): Promise<PayoutResult> {
      try {
        const result = await config.payViaPerfloCli({
          nickname: config.recipientNickname,
          amount: minorUnitsToDecimalString(request.amountMinor),
          currency: request.currency,
          idempotencyKey: request.idempotencyKey,
        });
        return { providerReference: result.paymentReference, status: "paid" };
      } catch (error) {
        if (error instanceof PerfloUnknownOutcomeError) {
          return { providerReference: error.paymentReference ?? request.idempotencyKey, status: "unknown", failureReason: error.message };
        }
        if (error instanceof PerfloDefiniteFailure) {
          return { providerReference: request.idempotencyKey, status: "failed", failureReason: error.message };
        }
        throw error;
      }
    },

    async getPayoutStatus(providerReference: string): Promise<PayoutResult> {
      return (config.getPayoutStatusViaPerfloCli ?? getPerfloTxStatus)(providerReference);
    },
  };
}
