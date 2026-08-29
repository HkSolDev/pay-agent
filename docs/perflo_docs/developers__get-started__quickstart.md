> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Quickstart

> Verify the customer identity, check the Perflo connection, and read the first account data.

**Goal:** three verified reads against a connected customer account (identity, onboarding state, and deposit accounts), proving your credentials and connection work before you move any money.

Use a server process for every call on this page. The customer Perflo token is financial authority over the customer's Perflo account.

## Prerequisites

1. [Authorize a customer device](/developers/get-started/authorize-device).
2. [Connect the customer's Perflo login](/developers/get-started/connect-perflo).
3. Store the resulting customer token on your backend.

Set the gateway and token for this walkthrough:

```bash theme={null}
export PERFLO_API_BASE_URL=https://api-gateway.perflo.ai
export PERFLO_CUSTOMER_TOKEN='customer_access_jwt'
```

## 1. Verify the caller

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/identity"
```

**You'll see:** `actor_type: "customer"`, plus the verified `subject` and `wallet`, server time, and the minimum idempotency replay window. Require `actor_type: "customer"` before continuing.

Use those verified fields as the customer identity; do not accept a customer ID from the request body or query string.

## 2. Check connection and capabilities

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/onboarding"
```

**You'll see:** a `perflo_connection` status and a `capabilities` object. Proceed only when `perflo_connection` is `connected`, and check the relevant `capabilities` boolean before calling that surface.

KYC status is intentionally absent from onboarding; `/v1/kyc` is its single source.

## 3. Read deposit accounts

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/accounts"
```

**You'll see:** the customer's fiat deposit accounts. Balance fields can be `null` when no balance is reported for that account; a deposit-routing account can remain null permanently. Do not treat null as a transient read failure.

## Use typed TypeScript calls

Use the [`@perflo/finance-sdk` software development kit (SDK)](/developers/get-started/typescript-sdk) from a Node.js backend when you want generated TypeScript operations and result types. Keep this curl tutorial as the transport-level reference for raw paths, headers, and bodies.

## If something goes wrong

* `401` on any call: the customer token is expired or invalid. Refresh it, following the refresh step in [authorize a customer device](/developers/get-started/authorize-device).
* `409 account_authorization_required` on `/v1/accounts`: the gateway device is not linked or is no longer usable. Re-read `/v1/onboarding` and follow the connection status table in [connect a Perflo login](/developers/get-started/connect-perflo).
* `503 perflo_capability_unavailable`: the gateway does not currently expose that surface. It does not mean the customer has no accounts.
* Any other failure: branch on the `code` field of the problem document, not its text. See [operations and errors](/developers/concepts/operations-errors).

## Where to go next

* [Read KYC, accounts, display currency, and activity](/developers/guides/accounts-kyc).
* [Create a beneficiary and send a transfer](/developers/guides/beneficiaries-transfers).
* [Manage cards](/developers/guides/cards).
* [Manage held spending funds](/developers/guides/spending).
* [Delegate authority to an agent](/developers/guides/agent-mandates).
* [Buy a live service](/developers/guides/service-purchases).

Before any mutation, read [confirmation and idempotency](/developers/concepts/confirmation-idempotency). Follow every accepted write through [operations and errors](/developers/concepts/operations-errors) or [webhooks](/developers/guides/webhooks).
