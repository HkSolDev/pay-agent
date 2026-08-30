import type {
  CreatePayoutRequest,
  PayoutResult,
  PayoutStatus,
  PaymentExecutor,
} from "./payment-executor.js";

// RazorpayX's own payout lifecycle has more states than our three; several
// map onto the same outcome from the caller's point of view (PRD/FR-27
// already only distinguishes processing/paid/failed/unknown everywhere
// else). "queued"/"pending"/"processing" are all still in flight.
const RAZORPAY_STATUS_MAP: Record<string, PayoutStatus> = {
  queued: "processing",
  pending: "processing",
  processing: "processing",
  processed: "paid",
  reversed: "failed",
  rejected: "failed",
  cancelled: "failed",
  failed: "failed",
};

function mapRazorpayStatus(raw: string): PayoutStatus {
  return RAZORPAY_STATUS_MAP[raw] ?? "unknown";
}

// The real response has no `failure_reason` field — confirmed against
// razorpay.com/docs/api/x/payouts/: the failure/queue explanation lives at
// `status_details.description` (a `reason` machine code is also present,
// but the description is the human-readable one worth surfacing to the owner).
function payoutFailureReason(payout: Record<string, unknown>): string | undefined {
  const statusDetails = payout.status_details as Record<string, unknown> | undefined;
  const description = statusDetails?.description;
  return typeof description === "string" ? description : undefined;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface RazorpayExecutorConfig {
  keyId: string;
  keySecret: string;
  // The RazorpayX business account (or RazorpayX Lite customer identifier)
  // the payout is debited from — required by the real Payouts API as
  // `account_number`. NOT the recipient's bank account; found on the
  // RazorpayX Dashboard under My Account & Settings -> Banking -> Customer
  // Identifier. Confirmed against razorpay.com/docs/api/x/payouts/ — this
  // field was missing from the first draft of this adapter and every real
  // payout call would have failed without it.
  accountNumber: string;
  // Test mode only — this adapter is never given production credentials in
  // this repo (see hands-off.md and the payment-executor.ts file header).
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

/**
 * RazorpayX Payouts sandbox adapter. Follows RazorpayX's real 2-step
 * primitive (Contact -> Fund Account) before the Payout call itself — there
 * is no flattened "just pay this VPA" endpoint. This mirrors the existing
 * Payee -> PayeePaymentMethod split already in the schema, so no new domain
 * concept is introduced here, only a mapping layer.
 */
export function createRazorpayExecutor(config: RazorpayExecutorConfig): PaymentExecutor {
  const baseUrl = config.baseUrl ?? "https://api.razorpay.com";
  const fetchImpl: FetchLike = config.fetchImpl ?? (fetch as unknown as FetchLike);
  const authHeader = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;

  async function call(path: string, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`RazorpayX ${path} returned ${response.status}: ${JSON.stringify(json)}`);
    }
    return json;
  }

  async function get(path: string) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: authHeader },
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`RazorpayX ${path} returned ${response.status}: ${JSON.stringify(json)}`);
    }
    return json;
  }

  return {
    async createPayout(request: CreatePayoutRequest): Promise<PayoutResult> {
      // Confirmed against razorpay.com/docs/api/x/payouts/: the Payouts API
      // only documents `currency: "INR"` for both the bank-account and VPA
      // payout endpoints. Refusing anything else here, before any network
      // call, rather than forwarding an unsupported value and hoping the
      // API rejects it usefully.
      if (request.currency !== "INR") {
        return {
          providerReference: request.idempotencyKey,
          status: "failed",
          failureReason: `RazorpayX payouts only support INR; got ${request.currency}.`,
        };
      }

      try {
        const contact = await call("/v1/contacts", {
          name: request.recipientName,
          type: "vendor",
        });

        const fundAccountBody =
          request.destination.kind === "upi"
            ? {
                contact_id: contact.id,
                account_type: "vpa",
                vpa: { address: request.destination.vpa },
              }
            : {
                contact_id: contact.id,
                account_type: "bank_account",
                bank_account: {
                  name: request.recipientName,
                  ifsc: request.destination.ifsc,
                  account_number: request.destination.accountNumber,
                },
              };
        const fundAccount = await call("/v1/fund_accounts", fundAccountBody);

        // amountMinor is already an integer in paise/cents — the interface
        // never carries a decimal rupee value, so there is no `* 100` step
        // (and no floating-point rounding risk) here.
        const payout = await call(
          "/v1/payouts",
          {
            // Required by the real API — the source RazorpayX account being
            // debited, not the recipient's account. See the config comment.
            account_number: config.accountNumber,
            fund_account_id: fundAccount.id,
            amount: Number(request.amountMinor),
            currency: request.currency,
            mode: request.rail === "upi" ? "UPI" : "NEFT",
            purpose: "payout",
            queue_if_low_balance: true,
          },
          { "X-Payout-Idempotency": request.idempotencyKey },
        );

        return {
          providerReference: String(payout.id),
          status: mapRazorpayStatus(String(payout.status)),
          ...(payoutFailureReason(payout) ? { failureReason: payoutFailureReason(payout) } : {}),
        };
      } catch (error) {
        // A network failure/timeout partway through the sequence means we
        // cannot tell whether RazorpayX already accepted the payout before
        // we lost the response — never resolve this to "failed" (that would
        // invite a caller to safely retry a payout that may have landed).
        return {
          providerReference: request.idempotencyKey,
          status: "unknown",
          failureReason: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async getPayoutStatus(providerReference: string): Promise<PayoutResult> {
      const payout = await get(`/v1/payouts/${providerReference}`);
      return {
        providerReference: String(payout.id),
        status: mapRazorpayStatus(String(payout.status)),
        ...(payoutFailureReason(payout) ? { failureReason: payoutFailureReason(payout) } : {}),
      };
    },
  };
}
