> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Beneficiaries and transfers

> Build a payout form, create a beneficiary, quote a transfer, complete browser approval, and reconcile the operation.

**Goal:** one payout that reaches a definitive state: sent, failed, or explicitly needing reconciliation.

A transfer depends on an existing beneficiary and a fresh indicative quote. Discover the current payout form, create the beneficiary idempotently, quote the amount, confirm the quote ID, and follow the accepted operation through browser approval to its final outcome.

All requests on this page use a customer token from your backend and require a connected Perflo account.

```bash theme={null}
export PERFLO_API_BASE_URL=https://api-gateway.perflo.ai
export PERFLO_CUSTOMER_TOKEN='customer_access_jwt'
```

## 1. Discover the payout form

List supported countries, then request the schemas for the selected ISO 3166-1 alpha-2 country:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/beneficiaries/countries"

curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/beneficiaries/schemas?country=AE"
```

If the selected payout form asks for a beneficiary address, list the countries accepted in those address fields:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/beneficiaries/address-countries"
```

This address-country list is independent from residence and payout-destination countries. Each row carries alpha-2 and alpha-3 codes, a display name, and accepted aliases.

Render the selected schema's `fields`, including nested `fields`, `required`, `required_when`, and `allowed_values`. Send answers under each field's `key` inside `details`.

If `purpose_codes` is a non-empty list, one of those values is required. If it is null, no list is declared; treat that as advisory rather than as proof that no code is needed, because a purpose code the payout requires is still enforced when the payout runs.

## 2. Create the beneficiary

Build a body from the selected schema. These placeholders must be replaced with values from the live response and customer input:

```bash theme={null}
BENEFICIARY_BODY='{
  "name":"beneficiary_name",
  "country":"AE",
  "payout_schema_id":"schema_id_from_response",
  "currency":"AED",
  "purpose_code":"purpose_code_from_schema_when_required",
  "details":{"field_key_from_schema":"field_value"},
  "is_external":true
}'
export BENEFICIARY_IDEMPOTENCY_KEY=$(openssl rand -hex 16)
```

Persist the body and key before sending:

```bash theme={null}
BENEFICIARY_OPERATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header "Idempotency-Key: $BENEFICIARY_IDEMPOTENCY_KEY" \
  --header 'Content-Type: application/json' \
  --data "$BENEFICIARY_BODY" \
  "$PERFLO_API_BASE_URL/v1/beneficiaries")
```

Beneficiary creation deliberately requires no confirmation intent and no fresh-token check, but it is still a financial mutation and requires idempotency. Omit `purpose_code` only when the selected schema's list is null; otherwise replace the placeholder with one of the exact advertised values.

Poll the operation and capture the updated response when it succeeds:

```bash theme={null}
export BENEFICIARY_OPERATION_ID=$(jq -er '.id' <<<"$BENEFICIARY_OPERATION")
BENEFICIARY_OPERATION=$(curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/operations/$BENEFICIARY_OPERATION_ID")
export BENEFICIARY_ID=$(jq -er \
  'select(.state == "succeeded") | .resource_id | select(type == "string" and length > 0)' \
  <<<"$BENEFICIARY_OPERATION")
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/beneficiaries/$BENEFICIARY_ID"
```

## 3. Find or relabel a beneficiary

Find a beneficiary by its exact private label:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/beneficiaries/by-nickname/family"
```

The response uses the same complete projection as the beneficiary list. A `404 not_found` means the label cannot be joined to a current beneficiary.

A label containing `/` cannot be looked up on this path in any spelling, encoded or not. Read it from `GET /v1/beneficiaries` instead.

Relabel the beneficiary synchronously:

```bash theme={null}
curl --fail-with-body --request PATCH \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"nickname":"family"}' \
  "$PERFLO_API_BASE_URL/v1/beneficiaries/$BENEFICIARY_ID"
```

The label is trimmed and is at most 80 characters, on this route and on `POST /v1/beneficiaries` alike. Send `{"nickname":null}` or a blank label to clear it. This write creates no operation, needs no confirmation or idempotency key, and answers `409 beneficiary_nickname_taken` when another beneficiary already carries the requested label.

## 4. Create a transfer quote

```bash theme={null}
QUOTE=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "{\"beneficiary_id\":\"$BENEFICIARY_ID\",\"source\":{\"amount\":\"100.00\",\"currency\":\"AED\"}}" \
  "$PERFLO_API_BASE_URL/v1/quotes")
```

Display the requested source, exact USD cash debit, estimated destination, fee, and rates. A quote is not executable and does not lock the final payout amount. Submit it before `confirm_by`; an expired quote is refused rather than repriced.

## 5. Confirm the exact transfer body

Refresh the customer token if necessary so its `iat` is no more than five minutes old. It must satisfy that limit for both confirmation creation and transfer submission. Then build the only transfer field and create a matching confirmation intent:

```bash theme={null}
export QUOTE_ID=$(jq -r '.id' <<<"$QUOTE")
TRANSFER_BODY=$(jq -nc --arg quote_id "$QUOTE_ID" '{quote_id:$quote_id}')
CONFIRMATION_BODY=$(jq -nc --argjson payload "$TRANSFER_BODY" \
  '{action:"transfer.create",payload:$payload}')
```

```bash theme={null}
CONFIRMATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "$CONFIRMATION_BODY" \
  "$PERFLO_API_BASE_URL/v1/confirmation-intents")
export CONFIRMATION_INTENT_ID=$(jq -r '.id' <<<"$CONFIRMATION")
```

The intent expires after ten minutes and can be spent once. The later transfer must carry the identical normalized body.

## 6. Submit one logical transfer

Persist a new idempotency key beside the transfer body before the first request. If a delay after confirmation has aged the token past five minutes, refresh it before submitting the unchanged confirmed body:

```bash theme={null}
export TRANSFER_IDEMPOTENCY_KEY=$(openssl rand -hex 16)
TRANSFER_OPERATION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header "Confirmation-Intent-ID: $CONFIRMATION_INTENT_ID" \
  --header "Idempotency-Key: $TRANSFER_IDEMPOTENCY_KEY" \
  --header 'Content-Type: application/json' \
  --data "$TRANSFER_BODY" \
  "$PERFLO_API_BASE_URL/v1/transfers")
export TRANSFER_OPERATION_ID=$(jq -r '.id' <<<"$TRANSFER_OPERATION")
```

The beneficiary and every amount come from the quote, not from this request. Only one live approval can exist for a customer at a time, so finish or expire an earlier transfer or beneficiary-mandate approval before starting another.

## 7. Complete browser approval

The accepted operation normally starts in `requires_action`. Require `action_required.kind: "grant_approval"`, require the URL origin to equal `https://app.perflo.ai`, and open it in the customer's browser.

After waiting at least `action_required.poll_after_ms`, reconcile the approval:

```bash theme={null}
curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/operations/$TRANSFER_OPERATION_ID/approval/poll"
```

Repeat the approval poll only while the operation continues to carry the hosted action. Do not resubmit the transfer. Then follow the same operation through `accepted`, `submitting`, and `submitted` until it reaches a definitive result or requires reconciliation.

There is no separate transfer-read endpoint. The operation is the durable transfer record.

## If something goes wrong

* The quote is refused at submission: it passed `confirm_by`. An expired quote is refused rather than repriced, so create a new one.
* `403 step_up_required`: the customer token aged past five minutes between confirmation and submission. Refresh it and resubmit the unchanged confirmed body.
* A second approval will not start: only one live approval can exist per customer. Let the earlier transfer or beneficiary-mandate approval settle or expire first.
* `purpose_code` is rejected: the selected schema advertised a non-empty list and one of those exact values is required. Omit the field only when the list is null.
* `409 perflo_connection_superseded`: the beneficiary belongs to a previous Perflo connection. Every route that names a beneficiary identifier answers this — the single read, relabel, quote, beneficiary-mandate creation, and the beneficiary-grant payment, which carries one in its request body rather than its path — and a transfer answers it when its quote was created under the previous connection. Retrying the same identifier cannot succeed; list beneficiaries again (or quote again) and use the current identifier. The refusal is never about a grant identifier, which needs no such refresh: `GET /v1/mandates/beneficiary-grants` reads the connected account on every call.
* The operation reaches `indeterminate`, or a problem document sets `submission_uncertain: true`: a write may have landed. Never create a replacement transfer; reconcile the recorded operation.

## Where to go next

See [operations and errors](/developers/concepts/operations-errors) for `indeterminate`, lost responses, idempotent replay, and customer-assisted approval resolution.
