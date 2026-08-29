> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Confirmation and idempotency

> Bind sensitive customer actions to one-use intents and retry financial mutations without creating duplicate writes.

Financial mutations use two separate controls: a confirmation intent proves which customer payload was accepted, and an idempotency key identifies one logical operation across retries. Neither control is optional where the API reference declares its header.

Customer calls use a Perflo bearer token held by the integrator's backend. Sensitive actions require its signed `iat` to be no more than five minutes old at both confirmation creation and the protected mutation. A refreshed access token can satisfy either check. Recheck freshness before every later confirmation-and-mutation sequence instead of assuming a token used earlier in a workflow is still fresh.

## Create a payload-bound confirmation

For a sensitive customer action, send its exact request payload to `POST /v1/confirmation-intents` with the action name:

```bash theme={null}
curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"action":"purchase.create","payload":{"target":{"kind":"service","service_id":"sandbox-search"},"max_price":{"amount":"0.05","currency":"USD"}}}' \
  "$PERFLO_API_BASE_URL/v1/confirmation-intents"
```

The intent expires after ten minutes and can be spent once. The later mutation must carry the same normalized payload and `Confirmation-Intent-ID` header. A confirmation intent is payload-bound replay protection; it is not a separate multifactor-authentication event. Token freshness comes from the Perflo token's `iat`. If a delay pushes the token past five minutes after confirmation, refresh it before submitting the unchanged confirmed mutation.

See the [confirmation action map](/developers/concepts/operations-errors#bind-customer-confirmation-to-the-payload) for every supported action and its exact payload shape.

## Persist the mutation before sending it

Generate a new unpredictable `Idempotency-Key` for each logical mutation. Persist the key and exact body in your own durable state before the first network write. Reuse both values after a timeout or connection loss; never generate a replacement key for an unresolved operation.

An equal replay returns the existing operation and includes `Idempotent-Replayed: true`. A changed body under the same key returns a conflict. The API publishes its minimum replay window and server time from `GET /v1/identity`.

For service purchases, `Idempotency-Replay-Not-After` can bind a conservative absolute deadline inside that window. Preserve the header unchanged on every replay. At or after the deadline, fail closed and reconcile the operation or purchase history before attempting anything new.

## Follow the operation

Mutations usually return `202 Accepted` with an operation. Poll `GET /v1/operations/{operation_id}`. If an operation enters `requires_action`, open only the trusted hosted action and poll `POST /v1/operations/{operation_id}/approval/poll` without resubmitting the original mutation.

If a write might have landed but no definitive response exists, the API records `indeterminate`. It never retries that write automatically. Treat `submission_uncertain: true` in a problem response as a prohibition on creating a replacement operation.

An indeterminate operation is not necessarily frozen forever. Read-only evidence or customer-assisted approval resolution can move it later without repeating the write. See [operations and errors](/developers/concepts/operations-errors) for the state table, approval resolution, and retry policy.
