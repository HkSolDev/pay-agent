> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Manage cards and card funding

> Read the card account, fund and withdraw from it, issue and relabel cards, manage their lifecycle, and inspect activity.

**Goal:** read the card account, fund it and withdraw from it, issue and label a virtual card, manage its lifecycle, and inspect its activity.

Card reads and label changes use a customer Perflo token and answer synchronously. Issuance, withdrawal, and lifecycle mutations are confirmed, idempotent operations. Hosted reveal is a synchronous confirmed action and never returns card credentials through the API.

Require a connected Perflo account and the relevant card capability from onboarding before each workflow.

```bash theme={null}
export PERFLO_API_BASE_URL=https://api-gateway.perflo.ai
export PERFLO_CUSTOMER_TOKEN='customer_access_jwt'
```

## 1. Read cards and private labels

List existing cards:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/cards"
```

Read one card by the `id` from that list:

```bash theme={null}
export CARD_ID='card_id'
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/cards/$CARD_ID"
```

Both reads expose safe metadata, including `last4`. Neither returns the primary account number (PAN) or card verification value (CVV). A card in `freeze_pending`, `unfreeze_pending`, `close_pending`, or `indeterminate` answers from its stored state so the read cannot replace an in-flight result.

Change the private label with `PATCH /v1/cards/{card_id}`. The label is trimmed and limited to 80 characters. Send `null` or a blank value to clear it:

```bash theme={null}
curl --fail-with-body --request PATCH \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"nickname":"Business travel"}' \
  "$PERFLO_API_BASE_URL/v1/cards/$CARD_ID"
```

## 2. Read and fund the card account

Read the card profile, normalized Know Your Customer (KYC) status, current deposit balance, and lifetime deposited total:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/card-account"
```

Read the funding destination before every deposit. The response states the address in full, the network, the primary `asset`, accepted assets, minimum amount, and guidance. Omit `card_id` for an account-wide destination or pass a card ID from `GET /v1/cards`. Either way, the response's own `card_id` names the card the destination belongs to, or is null when no current card resolves it:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/card-account/deposit-address?card_id=$CARD_ID"
```

Send only an asset from `accepted_assets` on the stated `chain`. The deposit address is readable only with the linked customer's token.

List deposits and withdrawals with the same optional `card_id` query, which takes 1 to 36 characters:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/card-account/deposits?card_id=$CARD_ID"

curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/card-account/withdrawals?card_id=$CARD_ID"
```

These are complete lists, not pages. Deposits answer an object carrying `deposits` and their `total_credited`; withdrawals answer a bare array. Treat each deposit or withdrawal `status` as an open string. Deposit amounts and `total_credited` are non-negative United States dollar values. A withdrawal's `tx_hash` and `completed_at` remain null until stated.

Deposits belong to one card, whether or not the request scoped itself to one. The response's own `card_id` names the card the rows and the total belong to, or is null when no current card resolves it; each withdrawal row names its own card the same way.

Read card-verification status with `GET /v1/card-account/kyc`. It returns normalized `status`, `raw_status`, and `can_issue_card`. If verification needs a hosted session, start one:

```bash theme={null}
KYC_SESSION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/card-account/kyc-sessions")
```

Open `action.url` only when `action.kind` is `kyc_session`. Use `verification_token` only for that hosted card-verification session. It is not a reusable customer-account access or refresh token. Do not log or persist it.

A null `action.expires_at` means no expiry was stated.

## 3. Start a card-account withdrawal

Read the deposit address before submitting. Choose `asset` from its `accepted_assets`, then create a confirmation over the exact withdrawal body. The amount must use United States dollars, must be exactly representable in whole cents, and must be no more than `9007199254740991` cents. How the amount is spelled does not change what is accepted: `10.25`, `10.250`, and `1.025E+1` are one value, and all three go through. Repeat the same amount spelling under the same `Idempotency-Key`. The exponent spelling `1.025E+1` canonicalizes to plain `10.25`, so those two replay the same operation; the trailing-zero spelling `10.250` remains distinct from `10.25` and answers `409 idempotency_key_conflict`:

```bash theme={null}
WITHDRAWAL_BODY=$(jq -nc --arg card_id "$CARD_ID" \
  '{card_id:$card_id,amount:{amount:"10.25",currency:"USD"},asset:"USDC"}')
WITHDRAWAL_CONFIRMATION=$(jq -nc --argjson payload "$WITHDRAWAL_BODY" \
  '{action:"card_withdrawal.create",payload:$payload}' | \
  curl --fail-with-body --request POST \
    --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
    --header 'Content-Type: application/json' \
    --data @- "$PERFLO_API_BASE_URL/v1/confirmation-intents")
export CONFIRMATION_INTENT_ID=$(jq -r '.id' <<<"$WITHDRAWAL_CONFIRMATION")
export WITHDRAWAL_IDEMPOTENCY_KEY=$(openssl rand -hex 16)
```

Persist the body, confirmation ID, and idempotency key, then submit them together:

```bash theme={null}
WITHDRAWAL_OPERATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header "Confirmation-Intent-ID: $CONFIRMATION_INTENT_ID" \
  --header "Idempotency-Key: $WITHDRAWAL_IDEMPOTENCY_KEY" \
  --header 'Content-Type: application/json' \
  --data "$WITHDRAWAL_BODY" \
  "$PERFLO_API_BASE_URL/v1/card-account/withdrawals")
```

The `202` response records the request as an operation. A definitively accepted submission rests at `submitted`; it does not advance to `succeeded`. Its `external_reference` is the withdrawal ID. Match that value to `id` in `GET /v1/card-account/withdrawals` to read the withdrawal's open status, transaction hash, and completion.

The route answers `202` whether or not card withdrawals are available, so branch on the operation rather than on the response status. When they are not available, the operation reaches `failed` with `failure_code: "card_withdrawal_unavailable"`. That is a definitive refusal: no withdrawal was submitted, and resending under a new key changes nothing. A transport-uncertain write instead leaves the operation `indeterminate`; never send a replacement withdrawal automatically.

## 4. Issue a card

The only input is the customer's private label. It is trimmed and is at most 80 characters after the trim, as it is on `PATCH /v1/cards/{card_id}`; a blank label becomes null:

```bash theme={null}
CARD_BODY='{"nickname":"Travel"}'
CONFIRMATION_BODY=$(jq -nc --argjson payload "$CARD_BODY" \
  '{action:"card.create",payload:$payload}')
```

Create the confirmation with a customer token whose `iat` is no more than five minutes old. The token must still satisfy that limit when the card mutation is submitted; refresh it before either request when necessary:

```bash theme={null}
CONFIRMATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "$CONFIRMATION_BODY" \
  "$PERFLO_API_BASE_URL/v1/confirmation-intents")
export CONFIRMATION_INTENT_ID=$(jq -r '.id' <<<"$CONFIRMATION")
export CARD_IDEMPOTENCY_KEY=$(openssl rand -hex 16)
```

Persist the body, confirmation ID, and idempotency key, then submit:

```bash theme={null}
CARD_OPERATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header "Confirmation-Intent-ID: $CONFIRMATION_INTENT_ID" \
  --header "Idempotency-Key: $CARD_IDEMPOTENCY_KEY" \
  --header 'Content-Type: application/json' \
  --data "$CARD_BODY" \
  "$PERFLO_API_BASE_URL/v1/cards")
```

Poll the returned operation or receive its webhook transitions. After success, `resource_id` is the card ID. Re-list cards to read the current card state.

## 5. Freeze, unfreeze, or close

The valid customer transitions are:

| Current status | Allowed actions             |
| -------------- | --------------------------- |
| `active`       | Freeze or close             |
| `frozen`       | Unfreeze or close           |
| `closed`       | None; close is irreversible |

For each action, create a new confirmation whose payload is `{"card_id":"card_id"}` and whose action is `card.freeze`, `card.unfreeze`, or `card.close`. The action endpoint itself has no body. Refresh the customer token before this sequence if provisioning or other work has aged its `iat`; it must be no more than five minutes old for both the confirmation and action request.

```bash theme={null}
export CARD_ID='card_id'
export CARD_ACTION=freeze
CARD_ACTION_PAYLOAD=$(jq -nc --arg card_id "$CARD_ID" '{card_id:$card_id}')
CARD_ACTION_CONFIRMATION_BODY=$(jq -nc \
  --arg action "card.$CARD_ACTION" \
  --argjson payload "$CARD_ACTION_PAYLOAD" \
  '{action:$action,payload:$payload}')
CARD_ACTION_CONFIRMATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "$CARD_ACTION_CONFIRMATION_BODY" \
  "$PERFLO_API_BASE_URL/v1/confirmation-intents")
export CONFIRMATION_INTENT_ID=$(jq -r '.id' <<<"$CARD_ACTION_CONFIRMATION")
export CARD_IDEMPOTENCY_KEY=$(openssl rand -hex 16)
```

Persist the matching confirmation and new idempotency key, then submit:

```bash theme={null}
curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header "Confirmation-Intent-ID: $CONFIRMATION_INTENT_ID" \
  --header "Idempotency-Key: $CARD_IDEMPOTENCY_KEY" \
  "$PERFLO_API_BASE_URL/v1/cards/$CARD_ID/$CARD_ACTION"
```

The card uses `freeze_pending`, `unfreeze_pending`, or `close_pending` while the operation is in flight. If a write becomes uncertain, the card and operation become `indeterminate`. Never create a replacement action; reconcile the recorded operation.

## 6. Open the hosted card reveal

Reveal works only for `active` or `frozen` cards. Refresh the customer token if necessary so its `iat` is no more than five minutes old for both requests, then create a separate `card.reveal` confirmation with `{"card_id":"card_id"}`:

```bash theme={null}
REVEAL_PAYLOAD=$(jq -nc --arg card_id "$CARD_ID" '{card_id:$card_id}')
REVEAL_CONFIRMATION_BODY=$(jq -nc --argjson payload "$REVEAL_PAYLOAD" \
  '{action:"card.reveal",payload:$payload}')
REVEAL_CONFIRMATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "$REVEAL_CONFIRMATION_BODY" \
  "$PERFLO_API_BASE_URL/v1/confirmation-intents")
export CONFIRMATION_INTENT_ID=$(jq -r '.id' <<<"$REVEAL_CONFIRMATION")
```

Then create the hosted session:

```bash theme={null}
REVEAL=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header "Confirmation-Intent-ID: $CONFIRMATION_INTENT_ID" \
  "$PERFLO_API_BASE_URL/v1/cards/$CARD_ID/reveal-sessions")
```

The response is a hosted action, not an operation. Require `kind: "card_reveal"`, require its URL origin to equal `https://app.perflo.ai`, respect `expires_at`, and open it only for the authenticated customer. PAN and CVV remain on Perflo's hosted page.

## 7. Read card transactions

Transactions are available for `active`, `frozen`, `closed`, and `expired` cards:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/cards/$CARD_ID/transactions?page=1&page_size=25"
```

Paging is one-based and `page_size` is capped at 100. Transaction `amount` is signed: debits are negative and credits are positive. `fee` is separate and non-negative.

## If something goes wrong

* A card or card-account route returns `404 not_found`: use a card ID from `GET /v1/cards`, not a card identifier from another system or account.
* A funding transfer is missing: confirm the asset, network, and minimum amount against a fresh deposit-address response, then inspect the unpaginated deposit list.
* A withdrawal is refused with `422`: `withdrawal_amount_precision_invalid` means the amount is not exactly representable in whole cents, so send an amount that is exactly representable in whole cents; `withdrawal_amount_range_invalid` means it is above `9007199254740991` cents, so lower it. The two are separate codes so a client can branch on which fix applies.
* A withdrawal operation rests at `submitted`: match its `external_reference` to the withdrawal list instead of waiting for a terminal operation state.
* A withdrawal operation reaches `failed` with `failure_code: "card_withdrawal_unavailable"`: card withdrawals are not available. Treat the refusal as definitive and do not resend.
* Card verification cannot continue: read `raw_status` for support context and start a new hosted session when the normalized status calls for action.
* A lifecycle action is refused: check the current status against the transition table. `closed` is terminal and close is irreversible.
* `403 step_up_required`: the customer token aged past five minutes between the confirmation and the action. Refresh it and resend both.
* The card sits in `freeze_pending`, `unfreeze_pending`, or `close_pending`: the operation is still in flight. Follow it; do not send the action again.
* The card and its operation both read `indeterminate`: a write became uncertain. Reconcile the recorded operation rather than reissuing the action.
* Reveal is refused: it works only for `active` or `frozen` cards, and PAN and CVV never come back through the API. They stay on Perflo's hosted page.

## Where to go next

Use [operations and errors](/developers/concepts/operations-errors) for retries, uncertain writes, and final-state handling.
