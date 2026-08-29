> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Webhooks

> Register a customer callback, verify signed operation events, handle duplicates and reordering, and recover through operation reads.

**Goal:** a receiver that accepts only genuinely signed operation events, survives duplicates and reordering, and can recover an event it never got.

Create a subscription before starting mutations, store its one-time secret, and verify every delivery over the exact raw bytes before parsing JSON. Deliveries can be duplicated, delayed, reordered, or eventually dead-lettered, so the operation read API remains the final reconciliation source.

Webhook subscriptions belong to the authenticated customer. Manage them from your backend with the customer Perflo token.

```bash theme={null}
export PERFLO_API_BASE_URL=https://api-gateway.perflo.ai
export PERFLO_CUSTOMER_TOKEN='customer_access_jwt'
```

## 1. Register a callback

```bash theme={null}
SUBSCRIPTION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"url":"https://integrator.example/webhooks/perflo"}' \
  "$PERFLO_API_BASE_URL/v1/webhook-subscriptions")
```

The callback must use HTTPS, contain no URL credentials or fragment, and resolve only to public internet addresses. The sender pins the resolved address for the request, verifies TLS for the original hostname, does not use environment proxies, and refuses redirects.

The response returns `signing_secret` once. Store it immediately in a secret manager, indexed by subscription ID. List responses never reveal it.

```bash theme={null}
export SUBSCRIPTION_ID=$(jq -er '.id' <<<"$SUBSCRIPTION")
export PERFLO_WEBHOOK_SIGNING_SECRET=$(jq -er '.signing_secret' <<<"$SUBSCRIPTION")
```

The exported secret is illustrative. Production code should move both values directly into its durable configuration and secret manager without printing them.

If creation succeeds but the response is lost, the secret cannot be recovered. List subscriptions, delete the orphaned registration, and create a replacement.

Subscriptions do not backfill operation transitions that occurred before registration.

## 2. Capture the exact request bytes

Each delivery is an HTTPS `POST` with JSON content and this header:

```http theme={null}
Perflo-Signature: t=unix_timestamp,v1=hex_hmac
```

Read the body as bytes before any JSON parser, middleware normalization, character conversion, or logging redaction changes it. Keep the header and bytes together in the same verification boundary.

## 3. Verify timestamp and HMAC

Parse `t` as a Unix timestamp. Choose and enforce a local replay tolerance appropriate for your queue and clock discipline; the API does not prescribe one. Five minutes is a common starting policy, not a protocol guarantee.

Compute:

```text theme={null}
HMAC-SHA256(signing_secret, ascii(t) + "." + raw_body)
```

Compare the lowercase hexadecimal digest with `v1` using a constant-time comparison. Reject malformed headers, stale timestamps, and signature mismatches before parsing JSON. Never fetch the secret from a value inside the unverified body.

## 4. Parse the event

A delivery has this shape:

```json theme={null}
{
  "version": "1",
  "sequence": 3,
  "topic": "operation.succeeded",
  "operation": {
    "id": "operation_id",
    "kind": "transfer",
    "state": "succeeded",
    "resource_type": null,
    "resource_id": null,
    "updated_at": "2026-08-13T13:00:00+00:00"
  }
}
```

Reject an unsupported `version`. Use `(operation.id, sequence)` as the deduplication key and store the highest sequence observed per operation. Delivery order is not guaranteed, and a later sequence can legitimately return to an earlier-looking state during evidence reconciliation. Sequence, not state rank, determines freshness.

A delivery fires on every operation state change, not only `succeeded`. `topic` is `operation.` followed by the [operation state](/developers/concepts/operations-errors#follow-operation-state) it just entered:

| Topic                       | Entered state     |
| --------------------------- | ----------------- |
| `operation.accepted`        | `accepted`        |
| `operation.requires_action` | `requires_action` |
| `operation.submitting`      | `submitting`      |
| `operation.submitted`       | `submitted`       |
| `operation.succeeded`       | `succeeded`       |
| `operation.failed`          | `failed`          |
| `operation.cancelled`       | `cancelled`       |
| `operation.indeterminate`   | `indeterminate`   |

Most receivers act on `requires_action`, `succeeded`, `failed`, `cancelled`, and `indeterminate`, and log or discard the remaining in-flight topics. One exception: a **definitively accepted** card-account withdrawal rests at `submitted`, so `operation.submitted` is the last event it sends and its outcome is read by correlating `external_reference` against `GET /v1/card-account/withdrawals`. A refused card-account withdrawal sends `operation.failed`; an uncertain one sends `operation.indeterminate`. Ignore a `topic` you do not recognize instead of rejecting the delivery, so an added state does not break your receiver.

`operation.requires_action` is the one in-flight topic that needs work rather than a log line. The delivery carries the reduced operation shape above and no hosted action, so it cannot be acted on alone: read `GET /v1/operations/{operation_id}` first and act on the state that read returns, which may already have moved past `requires_action`. While it still reads `requires_action`, validate and open the `action_required` the read returns, then call the approval poll after its `poll_after_ms` without resubmitting the original mutation, as [complete hosted approval](/developers/concepts/operations-errors#complete-hosted-approval) describes. A receiver that only watches terminal topics leaves the approval outstanding until it expires.

## 5. Acknowledge only after durable acceptance

Durably enqueue or commit the verified event before returning a `2xx`. Acknowledge duplicates after confirming the matching event is already durable.

The gateway retries network errors, `429`, and server failures with exponential backoff. It stops immediately on redirects and terminal client errors, and stops all transient retries after eight total attempts. This is duplicate-capable, bounded delivery, not an indefinite at-least-once guarantee.

Periodically reconcile important or unsettled operations through `GET /v1/operations/{operation_id}`. There is no public webhook replay or dead-letter endpoint.

## 6. Remove or rotate a subscription

List active registrations with `GET /v1/webhook-subscriptions`. Delete one with:

```bash theme={null}
curl --fail-with-body --request DELETE \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/webhook-subscriptions/$SUBSCRIPTION_ID"
```

Deletion returns `204` and marks the subscription revoked. A delivery whose worker checks the subscription afterward is dead-lettered without an outbound request. A worker that already passed that check can still deliver one correctly signed event after the `204`.

For planned rotation, create the replacement first at a callback URL that lets your receiver select the new key, store its one-time secret, and then delete the old subscription. During the drain window, accept signatures from both stored secrets, deduplicate by `(operation.id, sequence)`, and reconcile important operations through the read API. Retire the old secret only after your receiver's in-flight acceptance window closes.

For a compromised secret, do not use that overlap. Delete the old subscription first, reject the old secret immediately even if a signed request arrives in flight, and create a replacement with a new callback key selector. Reconcile every operation that could have changed during the gap through `GET /v1/operations/{operation_id}`. There is no in-place secret read or rotation.

## If something goes wrong

* **Every signature fails.** Something mutated the body before you hashed it: a JSON parser, middleware, a character conversion, or logging redaction. See [capture the exact request bytes](#2-capture-the-exact-request-bytes).
* **An operation appears to move backwards.** Expected: sequence, not state rank, determines freshness. See [parse the event](#4-parse-the-event).
* **Events stop arriving.** Delivery is bounded, not at-least-once. See [acknowledge only after durable acceptance](#5-acknowledge-only-after-durable-acceptance). Reconcile through `GET /v1/operations/{operation_id}`; there is no replay or dead-letter endpoint.
* **You have a subscription you cannot use.** Its secret is returned once and is unrecoverable. Delete the orphaned registration and create a replacement.

## Where to go next

See [operations and errors](/developers/concepts/operations-errors) for operation states and final reconciliation behavior.
