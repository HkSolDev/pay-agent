export interface RazorpayBalance {
  accountNumber: string;
  availableAmountMinor: number;
  currency: string;
  refreshedAt: number;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface RazorpayBalanceConfig {
  keyId: string;
  keySecret: string;
  accountNumber: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

/**
 * Read-only account balance check — a separate, account-level concern from
 * PaymentExecutor's per-payout one (and Perflo's CLI path has no equivalent,
 * so this isn't part of that interface). Confirmed against
 * razorpay.com/docs/api/x/account-validation/balance-fetch/: the real
 * endpoint is /v1/banking_balances (not /v1/balance), and it returns every
 * account under the merchant, so this filters to the one we actually pay
 * from. Exists to surface *why* a payout is stuck queued — RazorpayX's own
 * reason is often just "insufficient balance" — directly in the UI, instead
 * of making the owner go check the RazorpayX dashboard by hand.
 */
export async function fetchRazorpayBalance(config: RazorpayBalanceConfig): Promise<RazorpayBalance | null> {
  const baseUrl = config.baseUrl ?? "https://api.razorpay.com";
  const fetchImpl: FetchLike = config.fetchImpl ?? (fetch as unknown as FetchLike);
  const authHeader = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;

  const response = await fetchImpl(`${baseUrl}/v1/banking_balances`, {
    method: "GET",
    headers: { Authorization: authHeader },
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`RazorpayX /v1/banking_balances returned ${response.status}: ${JSON.stringify(json)}`);
  }

  const items = (json.items as Record<string, unknown>[] | undefined) ?? [];
  const match = items.find((item) => item.account_number === config.accountNumber);
  if (!match) return null;

  return {
    accountNumber: String(match.account_number),
    availableAmountMinor: Number(match.available_amount),
    currency: String(match.currency ?? "INR"),
    refreshedAt: Number(match.refreshed_at),
  };
}
