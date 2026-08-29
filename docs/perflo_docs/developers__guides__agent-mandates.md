> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Agent mandates and pairing

> Create bounded authority, complete approval, pair one agent, execute payments, and revoke access.

**Goal:** one external agent holding a revocable `pfa_` token that can spend only inside the caps, count, windows, and expiry the customer set, and that you can revoke in one call.

A mandate defines what one paired agent or authorized rule may do for one customer. Create and activate the mandate first, mint a short-lived connect code, let the agent redeem it once for a `pfa_` token, then execute only the workflow and limits that mandate permits.

Customer requests use a server-held Perflo token. Never give that token to an agent. Agent requests use the `pfa_` token and never use customer confirmation intents.

## Prerequisites

* A connected customer Perflo account and a customer token held by your backend. For every protected customer mutation below, its signed `iat` must be no more than five minutes old at both confirmation creation and mutation submission.
* An existing beneficiary for a beneficiary-payment mandate, or chosen service restrictions for a service-purchase mandate.
* `curl`, `jq`, and a durable store for request bodies, idempotency keys, and credentials.

```bash theme={null}
export PERFLO_API_BASE_URL=https://api-gateway.perflo.ai
export PERFLO_CUSTOMER_TOKEN='customer_access_jwt'
export BENEFICIARY_ID='existing_beneficiary_id'
```

## Choose the mandate kind

| Kind                  | What it authorizes                                     | Enforcement                                                   |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `service_purchase`    | Listed services and capabilities under purchase limits | Allowlists plus purchase limits, checked before each purchase |
| `beneficiary_payment` | USD payments to one existing beneficiary               | A Perflo grant plus gateway checks                            |

Both kinds require positive decimal strings for `per_payment_max`, `total_cap`, `daily_max`, `weekly_max`, and `monthly_max`; an integer `payment_count`; and an offset-aware `expires_at`. These limits are USD values, not money objects.

Keep `per_payment_max` at or below `total_cap`, and `daily_max <= weekly_max <= monthly_max <= total_cap`. Expiry must be at least one full day away. Capacity is reserved atomically before every execution.

The `pfa_` token this mandate pairs with carries no device or network binding, and refreshing it re-stamps the same value rather than issuing a new one. Until you revoke the pairing, these limits are the exact ceiling on a copied token, not a description of expected usage. Set `per_payment_max`, `total_cap`, `payment_count`, and the rolling maxima to the amount you would accept losing for the length of `expires_at`, and prefer the shortest expiry and lowest caps the workflow tolerates.

## 1. Create and confirm the mandate body

A beneficiary-payment mandate supports the payment path used later in this guide:

```bash theme={null}
export MANDATE_EXPIRES_AT=$(jq -nr 'now + 30 * 86400 | todateiso8601')
MANDATE_BODY=$(jq -nc --arg expires_at "$MANDATE_EXPIRES_AT" \
  --arg beneficiary_id "$BENEFICIARY_ID" '{
  kind:"beneficiary_payment",
  beneficiary_id:$beneficiary_id,
  per_payment_max:"5.00",
  total_cap:"50.00",
  payment_count:20,
  daily_max:"10.00",
  weekly_max:"25.00",
  monthly_max:"50.00",
  expires_at:$expires_at,
  authorized_rules:[]
}')
```

For a service-purchase mandate, use `kind: "service_purchase"`, omit `beneficiary_id` and `authorized_rules`, and add `allowed_services` and `allowed_capabilities`. Null leaves that allowlist dimension unrestricted; an empty list allows none. After pairing, continue with [service purchases](/developers/guides/service-purchases) instead of the beneficiary execution step.

Refresh the customer token if necessary, create a `mandate.create` confirmation using the complete body, then submit the identical body with a new persisted idempotency key. Recheck the five-minute `iat` limit before submission and refresh again if a delay crossed it:

```bash theme={null}
CONFIRMATION_BODY=$(jq -nc --argjson payload "$MANDATE_BODY" \
  '{action:"mandate.create",payload:$payload}')
CONFIRMATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "$CONFIRMATION_BODY" \
  "$PERFLO_API_BASE_URL/v1/confirmation-intents")
```

```bash theme={null}
export CONFIRMATION_INTENT_ID=$(jq -er '.id' <<<"$CONFIRMATION")
export MANDATE_IDEMPOTENCY_KEY=$(openssl rand -hex 16)
MANDATE_OPERATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header "Confirmation-Intent-ID: $CONFIRMATION_INTENT_ID" \
  --header "Idempotency-Key: $MANDATE_IDEMPOTENCY_KEY" \
  --header 'Content-Type: application/json' \
  --data "$MANDATE_BODY" \
  "$PERFLO_API_BASE_URL/v1/mandates")
export MANDATE_OPERATION_ID=$(jq -er '.id' <<<"$MANDATE_OPERATION")
export MANDATE_ID=$(jq -er '.resource_id' <<<"$MANDATE_OPERATION")
```

## 2. Wait until the mandate is active

A service-purchase mandate activates under gateway controls. A beneficiary-payment mandate begins `pending_approval`; its operation carries a `grant_approval` action. Open only a URL on `https://app.perflo.ai`, then poll the operation approval after `poll_after_ms` without resubmitting mandate creation.

Only one live approval can exist for a customer at a time. Wait for the earlier transfer or beneficiary-mandate approval to settle or expire before starting another.

Read the operation until it settles and the mandate until it is active:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/operations/$MANDATE_OPERATION_ID"
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/mandates/$MANDATE_ID"
```

Continue only when the mandate is `active`. Beneficiary remaining allowance counts only the payments made under the mandate. If the same account also spends its grant elsewhere, reconcile against the beneficiary rather than treating the remaining figure as exhaustive.

## 3. Issue a connect code

```bash theme={null}
CONNECT_CODE=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/mandates/$MANDATE_ID/connect-codes")
export PERFLO_CONNECT_CODE=$(jq -er '.code' <<<"$CONNECT_CODE")
```

The code has 80 bits of entropy, expires after ten minutes, and can be redeemed once. Send it to the intended agent over a separate trusted channel. Creating a beneficiary-payment code is allowed only while its backing grant is active.

Only one active pairing can exist for a mandate. Revoke it before pairing a replacement.

## 4. Redeem and store the agent token

Transfer `$PERFLO_CONNECT_CODE` to the intended agent over that trusted channel. The agent sets it in its own process and redeems without an existing credential:

```bash theme={null}
REDEEM_BODY=$(jq -nc --arg code "$PERFLO_CONNECT_CODE" \
  --arg agent_name "Invoice assistant" \
  '{code:$code,agent_name:$agent_name}')
AGENT_CREDENTIAL=$(curl --fail-with-body --request POST \
  --header 'Content-Type: application/json' \
  --data "$REDEEM_BODY" \
  "$PERFLO_API_BASE_URL/v1/connect-codes/redeem")
export PERFLO_AGENT_TOKEN=$(jq -er '.access_token' <<<"$AGENT_CREDENTIAL")
```

The response returns `access_token` once, together with `expires_in`, `mandate_id`, and derived `scopes`. Store the `pfa_` token like a password. The agent name is self-asserted and always unverified.

If redemption succeeds but the response is lost, neither the code nor token can be recovered because the gateway stores only the token's SHA-256 hash. The customer must read the mandate, revoke the resulting pairing, and issue a new connect code.

| Mandate               | Agent scopes                                           |
| --------------------- | ------------------------------------------------------ |
| `service_purchase`    | `services:read`, `purchases:read`, `purchases:execute` |
| `beneficiary_payment` | `mandates:read`, `mandates:execute`                    |

## 5. Execute beneficiary authority

An agent with a beneficiary-payment mandate sends a USD amount and, only when configured, an exact authorized `rule_id`:

```bash theme={null}
export EXECUTION_IDEMPOTENCY_KEY=$(openssl rand -hex 16)
curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_AGENT_TOKEN" \
  --header "Idempotency-Key: $EXECUTION_IDEMPOTENCY_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"amount":"5.00"}' \
  "$PERFLO_API_BASE_URL/v1/mandates/$MANDATE_ID/executions"
```

An agent sends no confirmation intent. A customer may execute the same route, but must create a `mandate.execute` confirmation containing `mandate_id` plus the exact execution body; customer execution carries no `rule_id`. Refresh before that later sequence as needed so the customer token's `iat` is no more than five minutes old for both confirmation and execution.

The gateway rechecks the active pairing, mandate, current Perflo connection, limits, beneficiary, and exact grant immediately before paying. A submitted or indeterminate execution keeps its reserved capacity and is never replaced automatically.

For service-purchase authority, continue with [service purchases](/developers/guides/service-purchases).

## Refresh or revoke access

Call `POST /v1/agent-tokens/refresh` with the `pfa_` bearer before the returned `expires_in` checkpoint. The endpoint returns the same token and updates its issue time. It does not rotate the secret or bound theft; pairing revocation and mandate expiry end authority.

The customer revokes one pairing with:

```http theme={null}
DELETE /v1/mandates/{mandate_id}/pairings/{pairing_id}
Authorization: Bearer customer_access_jwt
```

Revocation invalidates the token and cancels unsent executions attributed to that pairing. The pairing remains in mandate history.

To revoke the whole mandate, refresh the customer token as needed, create a `mandate.revoke` confirmation over `{"mandate_id":"mandate_id"}`, then call `POST /v1/mandates/{mandate_id}/revoke` with a new idempotency key while the token's `iat` remains no more than five minutes old. Revocation is terminal, preserves the record, stops new executions, and cancels unsent reservations. It does not erase a submitted or indeterminate write.

To stop every agent at once, refresh the customer token as needed, create a `mandate.revoke_all` confirmation over `{}`, then call `POST /v1/mandates/revoke-all` with the confirmation ID and a new idempotency key while the token's `iat` remains no more than five minutes old. Every active pairing is revoked immediately, and one mandate revocation opens for each mandate that still holds authority. A mandate already revoked, awaiting approval, refused at approval, awaiting revocation, or holding no exact authority opens no revocation. Neither does a service-purchase mandate past its expiry, whose expiry already ended its authority. Any pairing it has is cut all the same. The answer carries the batch, one operation for each revocation, and the revoked pairing identifiers; follow each operation separately, because a beneficiary-payment mandate settles only once its exact grant is revoked. Within the replay window `GET /v1/identity` publishes, an equal replay under the same idempotency key returns the same batch, so a mandate created after the first call is not covered by it. Past that window an equal replay is no longer guaranteed the same batch, and the batch may still answer for as long as it is retained, so never reuse the key to re-run a revoke-all: read the mandates and their revocation operations to reconcile, and open any new revoke-all with a fresh confirmation intent and a fresh idempotency key.

## Spend or revoke an existing beneficiary grant

`GET /v1/mandates/beneficiary-grants` lists automatic-payment grants made directly on the Perflo account rather than as mandates. A grant can be revoked through the API or in the Perflo app. No capacity is reserved against a grant, so another client sharing the account can spend it concurrently, bounded only by the grant's own caps.

To spend one on the customer's explicit instruction, refresh the customer token as needed, create a `beneficiary_grant.spend` confirmation containing `grant_id`, `beneficiary_id`, and `amount`, then call `POST /v1/mandates/beneficiary-grants/{grant_id}/payments` with the same payment body, confirmation ID, and a new idempotency key while the token's `iat` remains no more than five minutes old. Follow the returned operation. The exact destination and grant are rechecked immediately before submission.

To revoke one, refresh the customer token as needed, create a `beneficiary_grant.revoke` confirmation over `{"grant_id":"grant_id"}`, then call `POST /v1/mandates/beneficiary-grants/{grant_id}/revoke` with the confirmation ID and a new idempotency key while the token's `iat` remains no more than five minutes old. Follow the returned operation. Revocation is terminal. Only grants returned by `GET /v1/mandates/beneficiary-grants` can be revoked this way; a mandate's own grant is revoked with the mandate through `POST /v1/mandates/{mandate_id}/revoke`.

## If something goes wrong

* Mandate creation is rejected on its limits: keep `per_payment_max` at or below `total_cap`, keep `daily_max <= weekly_max <= monthly_max <= total_cap`, and set `expires_at` at least one full day out.
* The mandate stays `pending_approval`: a beneficiary-payment mandate needs the customer to complete the `grant_approval` action. Poll the operation approval; do not resubmit mandate creation.
* A second approval will not start: only one live approval can exist per customer. Wait for the earlier transfer or beneficiary-mandate approval to settle or expire.
* Redemption succeeded but the response was lost: neither the code nor the token is recoverable, because the gateway stores only the token's SHA-256 hash. The customer must revoke the resulting pairing and issue a new connect code.
* Pairing a second agent is refused: only one active pairing can exist per mandate. Revoke the current one first.
* An execution is refused after the mandate reads `active`: the gateway rechecks pairing, mandate, connection, limits, beneficiary, and the exact grant immediately before paying. Remaining beneficiary allowance counts only the payments made under the mandate, so it is an upper bound when another Perflo client can spend the same grant.
* An execution is refused with `409 perflo_connection_superseded`: the mandate belongs to a previous Perflo connection. The response is not retryable; that mandate can never execute again. Create a mandate under the current connection.
* An execution is `submitted` or `indeterminate`: it keeps its reserved capacity and is never replaced automatically. Reconcile it; do not re-execute.
* `POST /v1/mandates/revoke-all` is refused with `409 account_authorization_required`: at least one beneficiary-payment mandate needs a live Perflo connection. Nothing is revoked. Reconnect and call it again, or revoke each pairing one by one, which needs no connection. A `409 mandate_authority_changed` response has `retryable: true`; retry the same request. A `409 perflo_connection_superseded` response is not retryable; revoke each pairing one by one instead.

## Where to go next

Read [authentication and token lifecycle](/developers/concepts/authentication) for pairing-token handling and the credential rules behind it, and [operations and errors](/developers/concepts/operations-errors) for reconciling an execution that did not settle cleanly.

<Warning>
  Mandates and pairings are bound to the customer's Perflo account, not to a single connection attempt. Disconnecting and reconnecting the same account keeps them, so an integration does not need to reissue a mandate or a pairing after a reconnect. The corollary: disconnecting does not stop an agent's standing authority. Revoke the mandate to do that.
</Warning>

<Note>
  Every mandate this page creates carries the same bounds, whatever its kind and whichever agent is paired to it.

  An agent never receives a key. The customer's Perflo token stays in your backend; the agent holds only a `pfa_` pairing token bound to one mandate, and its scopes come from the mandate kind rather than from anything the agent asserts. An agent cannot raise a cap or extend its own permissions: every bound is rechecked immediately before paying, so a request over a cap is refused rather than queued. Revoking a pairing always works and needs no Perflo connection — `DELETE /v1/mandates/{mandate_id}/pairings/{pairing_id}` invalidates the token immediately and cancels that pairing's unsent executions — but it does not undo a payment already submitted or left indeterminate. Revoking the mandate itself is the one revocation that can need the connected account's credential, because `POST /v1/mandates/{mandate_id}/revoke` needs a live connection for a beneficiary-payment mandate, so revoke the mandate before disconnecting.

  A mandate's limits are set once by the customer with a fresh customer token and a confirmation intent, and capacity is reserved atomically against them. A copied `pfa_` token carries no device or network binding, so until you revoke it the mandate's caps and expiry are the exact ceiling on what it can spend.
</Note>
