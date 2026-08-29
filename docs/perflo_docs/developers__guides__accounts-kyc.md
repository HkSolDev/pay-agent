> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Accounts, KYC, and activity

> Check onboarding readiness, guide customer verification, and read balances, display currency, and account activity.

**Goal:** the customer's account picture read correctly, including the fields that are legitimately `null` rather than broken.

Use the customer Perflo token for every request on this page. Confirm that the gateway connection is active, handle KYC through its dedicated status route, then read accounts and customer-wide activity.

## Prerequisites

* A customer token held by your backend.
* `perflo_connection: "connected"` from `GET /v1/onboarding`.
* The relevant capability set to `true` in the onboarding response.

```bash theme={null}
export PERFLO_API_BASE_URL=https://api-gateway.perflo.ai
export PERFLO_CUSTOMER_TOKEN='customer_access_jwt'
```

## 1. Check onboarding readiness

```bash theme={null}
ONBOARDING=$(curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/onboarding")
```

Gate the verification, account, and activity reads on this page on both the connection status and the relevant capability. Capabilities describe what the gateway exposes even when the customer is not connected, so neither value is the gate on its own. The routes that reach a connection are not gated that way: this onboarding read, `GET /v1/public-config`, `GET /v1/identity`, `POST /v1/perflo-connections`, and `POST /v1/perflo-connections/current/poll` all answer before one exists. See [connect a Perflo login](/developers/get-started/connect-perflo).

## 2. Read KYC status

Account KYC status has one source:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/kyc"
```

The normalized `status` is one of `not_started`, `in_progress`, `action_required`, `under_review`, `approved`, `rejected`, `expired`, or `unknown`. `status_changed_at` is when the change to `status` was observed — a read time, not the moment the status itself changed. Keep `raw_status` for support, but branch on the normalized value.

Card verification is separate and has its own route, `GET /v1/card-account/kyc`, whose `can_issue_card` follows that status rather than this one; the [cards guide](/developers/guides/cards) covers it.

If verification must start or continue and `capabilities.kyc_session` is true, create a hosted session:

```bash theme={null}
curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/kyc/sessions"
```

The response is an action with `kind: "kyc_session"`. Require HTTPS, no embedded credentials, and a host of at least two ASCII labels of letters, digits and inner hyphens, none of them `localhost` and none beginning `xn--`. Each label is at most 63 characters and the host at most 253, one trailing dot is allowed, and the final label is neither all digits nor `0x` hex. Refuse IP literals, a zero or empty port, a percent sign or bracket in the authority, and a backslash, a space or an ASCII control character anywhere. This check does not verify ownership, DNS resolution, or reachability. The TypeScript SDK exports this same rule as `isAllowedVerificationUrl`, so a TypeScript client calls it instead of re-implementing the rule. Then open the URL in the customer's browser. This action does not create an operation and carries no polling interval. Re-read `/v1/kyc` later to observe the result; do not tight-poll it.

## 3. Read deposit accounts

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/accounts"
```

Render the currency returned by each account. `balance`, `available_balance`, and `pending_balance` may be `null` when the account holds no such balance. A deposit-routing account is a transfer-routing record rather than stored value, so null can be its permanent settled answer.

`bank_details` contains the funding information for an account the customer owns, published in full: the API does not truncate the account number or IBAN on this route, which only that customer's own token can reach.

## 4. Read the display currency

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/display-currency"
```

A null response means no display conversion applies. Otherwise, the rate is an indicative display aid. It is not an executable quote and does not change authoritative account amounts or the USD limits used by mandates and service purchases.

## 5. Read recent activity

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/activity?limit=25"
```

The route returns up to 100 newest-first entries. It merges and deduplicates two activity sources and is customer-wide, not a per-account ledger. Do not attribute an entry to an account. `amount` is non-negative; `kind` carries direction.

## If something goes wrong

* `409 account_authorization_required`: refresh onboarding and reconnect the gateway device.
* `503 perflo_capability_unavailable`: the gateway does not currently expose that surface. Do not interpret it as an empty account or activity result.
* `502` or `504`: retain the last clearly labeled observation if your product permits stale display, then retry only the safe read according to the problem document.
* A balance is `null`: check the account type before treating it as a failure. For a deposit-routing account, null is a permanent settled answer, not a transient read error.

## Where to go next

Use the **API reference** tab for every account, KYC, activity, money, and capability field, and [currencies and money](/developers/reference/currencies) for how to parse and preserve the amounts these reads return.
