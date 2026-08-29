> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Spending funds

> Read held spending funds and withdraw a specified USD amount or all withdrawable funds safely.

**Goal:** one withdrawal out of held spending funds, settled or definitively unsettled.

The spending surface is customer-only. Read the current held, promotional-credit, and owed positions, then create a confirmed, idempotent withdrawal and follow both the operation and withdrawal resource.

Require `perflo_connection: "connected"`, `capabilities.spending_account`, and `capabilities.spending_withdrawals` before starting.

```bash theme={null}
export PERFLO_API_BASE_URL=https://api-gateway.perflo.ai
export PERFLO_CUSTOMER_TOKEN='customer_access_jwt'
```

## 1. Read the spending position

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/spending-account"
```

The response separates:

* `held`: funds currently held for spending.
* `promotional_credit`: credit granted by Perflo.
* `owed`: the amount owed to Perflo.

All three are non-negative USD money objects. Only withdraw against `held`.

## 2. Choose the withdrawal amount

Withdraw a specified positive USD amount:

```bash theme={null}
WITHDRAWAL_BODY='{"amount":{"amount":"10.00","currency":"USD"}}'
```

To request every currently withdrawable held fund, send an explicit null:

```bash theme={null}
WITHDRAWAL_BODY='{"amount":null}'
```

The explicit amount cannot exceed the held position. Persist the exact body before confirmation and submission.

## 3. Confirm the request

Use a customer token whose `iat` is no more than five minutes old. It must satisfy that limit for both confirmation creation and withdrawal submission:

```bash theme={null}
CONFIRMATION_BODY=$(jq -nc --argjson payload "$WITHDRAWAL_BODY" \
  '{action:"spending_withdrawal.create",payload:$payload}')
CONFIRMATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "$CONFIRMATION_BODY" \
  "$PERFLO_API_BASE_URL/v1/confirmation-intents")
export CONFIRMATION_INTENT_ID=$(jq -r '.id' <<<"$CONFIRMATION")
```

## 4. Submit one logical withdrawal

Generate and persist a new key before the first network write. If a delay after confirmation has aged the token past five minutes, refresh it before submitting the unchanged confirmed body:

```bash theme={null}
export WITHDRAWAL_IDEMPOTENCY_KEY=$(openssl rand -hex 16)
WITHDRAWAL_OPERATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header "Confirmation-Intent-ID: $CONFIRMATION_INTENT_ID" \
  --header "Idempotency-Key: $WITHDRAWAL_IDEMPOTENCY_KEY" \
  --header 'Content-Type: application/json' \
  --data "$WITHDRAWAL_BODY" \
  "$PERFLO_API_BASE_URL/v1/spending-withdrawals")
```

The `202` response is an operation. Its `resource_id` is the withdrawal ID once the resource exists.

## 5. Follow operation and withdrawal state

```bash theme={null}
export WITHDRAWAL_ID=$(jq -r '.resource_id' <<<"$WITHDRAWAL_OPERATION")
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/spending-withdrawals/$WITHDRAWAL_ID"
```

The withdrawal status is separate from the operation state:

| Withdrawal status               | Meaning                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `queued`, `pending`, `bridging` | Work remains in progress.                                                       |
| `completed`                     | The settled amount is known and complete.                                       |
| `partial`                       | Some legs settled; inspect `settled`. The tracking operation can still succeed. |
| `failed`                        | Perflo definitively failed or skipped every submitted leg.                      |
| `settlement_uncertain`          | The settled amount is not proven. Do not replace the withdrawal.                |

Poll the operation or consume its webhook events as well. A transport-uncertain write is not repeated automatically. Reuse the same body and idempotency key only within the API's published replay window; never create a new key for an unresolved withdrawal.

## If something goes wrong

* The withdrawal is refused as too large: an explicit amount cannot exceed the `held` position. Only `held` is withdrawable; `promotional_credit` and `owed` are not.
* `503 perflo_capability_unavailable`: the gateway does not currently expose `capabilities.spending_account` or `capabilities.spending_withdrawals`. It does not mean the position is empty.
* `403 step_up_required`: the customer token aged past five minutes between the confirmation and the submission. Refresh it and resubmit the unchanged confirmed body.
* The withdrawal reads `partial` or `settlement_uncertain`, or the operation reads `indeterminate`: see the status table above. In every one of those states, never replace the withdrawal or mint a new idempotency key for it.

## Where to go next

See [operations and errors](/developers/concepts/operations-errors) for the complete retry and reconciliation rules.
