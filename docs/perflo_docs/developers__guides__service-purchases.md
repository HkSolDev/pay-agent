> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Service purchases

> Discover, quote, buy, and reconcile a live service as a customer or mandate-bound agent.

**Goal:** one live service bought and reconciled, as either a confirming customer or a mandate-bound agent, without exceeding the price cap you set.

Service purchases follow discover, inspect, quote, buy, and reconcile. A customer uses a server-held Perflo token and confirms the complete purchase body. An external agent uses a `pfa_` token whose active service-purchase mandate supplies `services:read`, `purchases:read`, and `purchases:execute`.

Never give the customer token to an agent or browser application. It is broader money-rail authority.

## Prerequisites

* A connected customer account and either its server-held token or a `pfa_` token paired to an active service-purchase mandate. For a customer purchase, the token's signed `iat` must be no more than five minutes old when creating the confirmation and submitting the purchase.
* `curl` and `jq` for the examples.
* Durable storage for the purchase body, idempotency key, replay deadline, operation ID, and purchase ID.

The discovery examples use the agent path. Step 4 shows complete agent and customer submissions:

```bash theme={null}
export PERFLO_API_BASE_URL=https://api-gateway.perflo.ai
export PERFLO_AGENT_TOKEN='pfa_pairing_token'
export MANDATE_ID='service_purchase_mandate_id'
```

## Choose the caller path

| Requirement                                 | Customer                                 | Paired agent                            |
| ------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| Bearer                                      | Customer Perflo token                    | `pfa_` pairing token                    |
| `mandate_id` on catalogue and quote queries | Omit                                     | Required                                |
| `mandate_id` in purchase body               | Omit                                     | Required                                |
| Confirmation intent                         | `purchase.create` over the complete body | Omit                                    |
| Idempotency key                             | Required                                 | Required                                |
| Purchase list                               | Allowed                                  | Not allowed                             |
| Exact purchase read                         | Customer-owned purchase                  | Only a purchase created by that pairing |

## 1. Discover services and capabilities

Search the catalogue:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_AGENT_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/services?mandate_id=$MANDATE_ID&q=search&limit=5"
```

Use `q` or `capability`, not both. An agent reads one service and its input schema with `GET /v1/services/{service_id}?mandate_id={mandate_id}`; a customer omits the mandate query. Search normalized capabilities with:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_AGENT_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/service-capabilities?mandate_id=$MANDATE_ID&query=search"
```

For an agent, service and capability allowlists apply together. An empty allowlist allows nothing. A mandate with either allowlist constrained cannot use a natural-language query target or an uncatalogued endpoint target; choose a returned catalogue service allowed by the mandate.

## 2. Observe the current price

Quote a catalogue service or exact endpoint:

```bash theme={null}
PURCHASE_QUOTE=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_AGENT_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"target":{"kind":"service","service_id":"service_id"}}' \
  "$PERFLO_API_BASE_URL/v1/purchase-quotes?mandate_id=$MANDATE_ID")
```

A quote reports the observed USD price, input schema, payability, and `confirm_by`. It never guarantees the final price. Endpoint targets require a fresh `purchase_quote_id` and must match that quote's URL and method exactly. Service targets do not carry the quote ID into purchase.

## 3. Build the complete purchase body

Build the agent body with its mandate:

```bash theme={null}
AGENT_PURCHASE_BODY=$(jq -nc --arg mandate_id "$MANDATE_ID" '{
  target:{kind:"service",service_id:"service_id"},
  input:{query:"customer_request"},
  max_price:{amount:"0.05",currency:"USD"},
  mandate_id:$mandate_id
}')
```

Build the customer body without `mandate_id`:

```bash theme={null}
CUSTOMER_PURCHASE_BODY=$(jq -nc '{
  target:{kind:"service",service_id:"service_id"},
  input:{query:"customer_request"},
  max_price:{amount:"0.05",currency:"USD"}
}')
```

The customer creates a `purchase.create` confirmation over that complete body before submission. An agent sends no confirmation.

`input` must satisfy the selected service's current input schema; `query` above is illustrative. `max_price` is the amount preflighted and reserved before the purchase runs. Catalogued services and quoted endpoints carry that ceiling into the charge itself; a natural-language query target does not: its price is checked against the ceiling immediately before the charge and again immediately after it. A settled price above the ceiling therefore surfaces once the money has moved, and on an agent purchase that overage also revokes the service mandate behind the purchase. Choose a catalogued service or a quoted endpoint whenever the price ceiling must bind at charge time.

## 4. Submit one logical purchase

Persist the exact body and a new idempotency key. A conservative `Idempotency-Replay-Not-After` can set an absolute fail-closed replay deadline inside the replay window. Preserve it exactly on every replay.

For an agent, send the mandate-bearing body and no confirmation header:

```bash theme={null}
export AGENT_PURCHASE_IDEMPOTENCY_KEY=$(openssl rand -hex 16)
AGENT_PURCHASE_OPERATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_AGENT_TOKEN" \
  --header "Idempotency-Key: $AGENT_PURCHASE_IDEMPOTENCY_KEY" \
  --header 'Content-Type: application/json' \
  --data "$AGENT_PURCHASE_BODY" \
  "$PERFLO_API_BASE_URL/v1/purchases")
```

For a customer, refresh the access token first if its signed `iat` is more than five minutes old or will cross that boundary during this sequence. Then confirm the exact customer body, extract the intent ID, and submit that same body with both required headers:

```bash theme={null}
export PERFLO_CUSTOMER_TOKEN='fresh_customer_access_jwt'
CUSTOMER_CONFIRMATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "$(jq -nc --argjson payload "$CUSTOMER_PURCHASE_BODY" \
    '{action:"purchase.create",payload:$payload}')" \
  "$PERFLO_API_BASE_URL/v1/confirmation-intents")
export CUSTOMER_CONFIRMATION_ID=$(jq -er \
  '.id | select(type == "string" and length > 0)' <<<"$CUSTOMER_CONFIRMATION")
export CUSTOMER_PURCHASE_IDEMPOTENCY_KEY=$(openssl rand -hex 16)
CUSTOMER_PURCHASE_OPERATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header "Confirmation-Intent-ID: $CUSTOMER_CONFIRMATION_ID" \
  --header "Idempotency-Key: $CUSTOMER_PURCHASE_IDEMPOTENCY_KEY" \
  --header 'Content-Type: application/json' \
  --data "$CUSTOMER_PURCHASE_BODY" \
  "$PERFLO_API_BASE_URL/v1/purchases")
```

Agents cannot override a confirmation threshold.

The gateway reserves mandate count and `max_price` capacity atomically before an agent submission. A transport-uncertain write becomes `indeterminate` and is not automatically repeated.

## 5. Follow operation and purchase state

The accepted operation carries a purchase `resource_id` when the purchase exists. Read that exact resource with the same caller credential:

```bash theme={null}
export PURCHASE_ID=$(jq -er \
  '.resource_id | select(type == "string" and length > 0)' \
  <<<"$AGENT_PURCHASE_OPERATION")
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_AGENT_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/purchases/$PURCHASE_ID"
```

Poll until the purchase leaves `queued`, `running`, or `settling`, while also following the operation. Do not infer success from `202` acceptance. A customer can list purchase history with `GET /v1/purchases`; an agent can read only the exact purchases created by its own pairing.

## Handle a customer threshold confirmation

A natural-language customer purchase can end in `confirmation_required`. Within ten minutes after that purchase completes:

1. Build one new purchase body with the exact prior target, input, and `max_price`.
2. Add `authorize_above_threshold: true` and `reauthorizes_purchase_id` naming the blocked purchase.
3. Refresh the customer access token if necessary so its signed `iat` is no more than five minutes old.
4. Create a new `purchase.create` confirmation over that complete retry body.
5. Submit one new logical purchase with a new idempotency key while the same token remains fresh.

The authorization is bound to that prior purchase and can be used once. Agents cannot take this path.

## If something goes wrong

* The catalogue query is rejected: use `q` or `capability`, not both.
* An agent gets nothing back from discovery: service and capability allowlists apply together, and an empty allowlist allows nothing.
* An agent's natural-language or uncatalogued endpoint target is refused: a mandate with either allowlist constrained cannot use one. Choose a returned catalogue service the mandate allows.
* The quote is refused at submission: endpoint targets need a fresh `purchase_quote_id` matching that quote's URL and method exactly, and every quote expires at `confirm_by`.
* The purchase ends in `confirmation_required`: a natural-language customer purchase crossed a confirmation threshold. Follow the reauthorization steps above within ten minutes. Agents cannot take this path and cannot override the threshold.
* Reserved capacity is exhausted: the gateway reserves mandate count and `max_price` atomically before an agent submission. Raise the mandate's limits, or wait for the rolling window.
* The operation reads `indeterminate`: a transport-uncertain write is never repeated automatically. Reconcile it; do not resubmit.

## Where to go next

See [agent mandates](/developers/guides/agent-mandates) for pairing and [operations and errors](/developers/concepts/operations-errors) for persisted retries, polling, and reconciliation.

<Warning>
  A natural-language query target has its `max_price` checked before submission, but only a catalogued service or a quoted endpoint carries that ceiling into the charge. Pick one of those two target kinds whenever the limit must bind at charge time.
</Warning>
