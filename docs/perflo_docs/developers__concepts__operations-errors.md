> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Operations and errors

> Track asynchronous mutations, handle hosted approval, replay idempotently, and reconcile uncertain outcomes from problem documents.

Every financial mutation records an idempotent operation before submission. Persist one logical request, follow the returned operation, and branch on structured problem fields. Never create a replacement request when submission may already have occurred.

## Prepare every logical mutation

Read `GET /v1/identity` when a session starts. It returns `server_time` and `idempotency_replay_window_seconds`, the minimum period for which an accepted idempotency key remains replayable.

Before the first network write, persist:

* The HTTP method and path.
* The exact normalized JSON body.
* A new unpredictable `Idempotency-Key` between 16 and 200 characters.
* The confirmation intent ID, when required.
* `Idempotency-Replay-Not-After`, when used for a service purchase.

An equal replay inside the guaranteed window returns the existing operation and adds `Idempotent-Replayed: true`. A changed body under the same key is a conflict. After the guaranteed window, reconcile operation and domain history instead of submitting the unresolved action under a new key.

## Bind customer confirmation to the payload

Sensitive customer actions require a one-use confirmation intent and a token whose signed `iat` is no more than five minutes old. Send the complete normalized action payload to `POST /v1/confirmation-intents`.

| Action                                                      | Confirmation payload                          |
| ----------------------------------------------------------- | --------------------------------------------- |
| `transfer.create`                                           | `{"quote_id":"quote_id"}`                     |
| `mandate.create`                                            | The complete mandate create body              |
| `mandate.execute`                                           | `mandate_id` plus the complete execution body |
| `mandate.revoke`                                            | `{"mandate_id":"mandate_id"}`                 |
| `mandate.revoke_all`                                        | `{}`                                          |
| `beneficiary_grant.spend`                                   | `grant_id` plus the complete payment body     |
| `beneficiary_grant.revoke`                                  | `{"grant_id":"grant_id"}`                     |
| `card.create`                                               | The complete card create body                 |
| `card_withdrawal.create`                                    | The complete card-account withdrawal body     |
| `card.freeze`, `card.unfreeze`, `card.close`, `card.reveal` | `{"card_id":"card_id"}`                       |
| `purchase.create`                                           | The complete purchase body                    |
| `spending_withdrawal.create`                                | The complete withdrawal body                  |

The mutation then carries `Confirmation-Intent-ID`. The intent expires after ten minutes, can be spent once, and must match the later normalized payload. It is payload-bound replay protection, not a separate multifactor event.

Paired-agent mutations do not use customer confirmation. Their active pairing and mandate are the authority.

## Follow operation state

Read one operation with `GET /v1/operations/{operation_id}`. Customers can also list their operations with `GET /v1/operations?limit=50`. An agent can read only an operation recorded under its own subject and pairing, with an applicable mandate or purchase scope.

| State                     | Client action                                                                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires_action`         | Validate and open the hosted action, then call the approval poll after `poll_after_ms`.                                                                                                                                       |
| `accepted`                | The operation is queued. Wait for a webhook or the next read.                                                                                                                                                                 |
| `submitting`, `submitted` | A write is in flight. Do not submit another logical request. A card-account withdrawal rests at `submitted` instead of reaching a final state; correlate its `external_reference` against `GET /v1/card-account/withdrawals`. |
| `succeeded`               | Read the linked resource using `resource_type` and `resource_id` when applicable.                                                                                                                                             |
| `failed`                  | Branch on `failure_code`; do not infer success from the earlier `202`.                                                                                                                                                        |
| `cancelled`               | The operation will not submit.                                                                                                                                                                                                |
| `indeterminate`           | A write may have been accepted, or an approval outcome is unresolved. Never repeat the write. Read-only evidence or approval resolution may still move the state later.                                                       |

Use `next_reconcile_at` to avoid polling before the worker's next planned read. `submission_uncertain: true` means a replacement action can duplicate a payment. `authority_expires_at` identifies when a reserved approval can no longer authorize new work; it does not turn an uncertain write into a failure.

## Complete hosted approval

When `action_required` is present:

1. Require its `kind` to match the workflow.
2. Require the URL origin to equal `https://app.perflo.ai`.
3. Stop using the action at `expires_at`.
4. Open it in the customer's browser without attaching a bearer token.
5. Wait at least `poll_after_ms`, then call `POST /v1/operations/{operation_id}/approval/poll` with the customer token.

Approval polling is intentionally repeatable and takes no idempotency key. Do not resubmit the original mutation while approval is outstanding.

## Resolve a stuck approval

Use customer-assisted resolution only when the operation returns `approval_resolvable: true`. The customer token must be fresh, and the resolution request requires its own persisted idempotency key.

If the hosted approval created a grant:

```json theme={null}
{"attestation":"grant_created"}
```

Clients that can read the exact Perflo grant identifier may also send `grant_id`. If no grant was created:

```json theme={null}
{"attestation":"no_grant_created"}
```

Send the attestation to `POST /v1/operations/{operation_id}/approval/resolution`. The gateway re-reads Perflo and refuses any disagreement. `grant_created` adopts only one unique, new, active, unused grant matching the stored approval and resumes the same queued execution. `no_grant_created` retires the operation only when no matching grant exists. Neither attestation submits a new payment.

## Parse problem documents

Gateway `/v1/*` failures use `application/problem+json`:

| Field                  | How to use it                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `code`                 | Stable machine-readable branch key.                                                                                   |
| `request_id`           | Log it. Include it when you email [support@perflo.ai](mailto:support@perflo.ai) about a stuck or uncertain operation. |
| `retryable`            | The identical request may succeed later; it does not authorize a new logical mutation.                                |
| `submission_uncertain` | A write may have landed. Never create a replacement operation.                                                        |
| `refresh_onboarding`   | Re-read `/v1/onboarding` before choosing the next action.                                                             |
| `fields`               | Render field-level validation failures when present.                                                                  |
| `title`, `detail`      | Human-readable text; do not branch on it.                                                                             |

Use this retry policy:

* Safe read plus `retryable: true`: retry with bounded backoff.
* `429`: honor `Retry-After` when present. If it is absent, wait at least 60 seconds before a bounded retry.
* Customer `401`: refresh once, then retry a safe read or the exact persisted idempotent request.
* `403 step_up_required`: refresh the customer token, create a current confirmation if needed, and continue the same logical action.
* `409 account_authorization_required` or `refresh_onboarding: true`: read onboarding and reconnect as directed.
* Mutation plus `submission_uncertain: true`, an `indeterminate` operation, or a lost response beyond the replay window: stop writes and reconcile.

## Respect rate-limit buckets

The gateway uses fixed one-minute buckets. A customer subject or agent pairing receives two shared authenticated buckets across `/v1/*` and authenticated `/cli/*` routes:

| Bucket                          | Limit                                 |
| ------------------------------- | ------------------------------------- |
| `GET`, `HEAD`, and `OPTIONS`    | 120 requests per principal per minute |
| All other authenticated methods | 30 requests per principal per minute  |

`POST /cli/sign/start` counts against the 30-per-minute authenticated mutation bucket. Public credential flows also have source-address or session limits:

| Route                           | Limit                                               |
| ------------------------------- | --------------------------------------------------- |
| `POST /cli/device/start`        | 30 requests per source address per minute           |
| `POST /cli/device/poll`         | 600 per source address and 150 per `sid` per minute |
| `POST /cli/sign/poll`           | 600 per source address and 150 per `sid` per minute |
| `POST /cli/token/refresh`       | 30 requests per source address per minute           |
| `POST /v1/connect-codes/redeem` | 10 requests per source address per minute           |

These gateway limits do not replace a rate limit relayed by a `/cli/*` endpoint. Some address and session responses include `Retry-After: 60`; authenticated-principal, connect-code, or relayed responses may omit it. When absent, wait at least one full minute and use bounded backoff. A rate-limit retry must preserve the exact body and idempotency controls of a mutation; it never authorizes a replacement logical request.

The raw `/cli/*` proxy preserves the relayed success and error envelopes. Gateway-generated authentication, request-validation, and address-rate-limit failures use problem documents instead. The gateway's per-session device-poll and sign-poll limits return ProblemDetails with `Retry-After: 60`, while relayed errors keep their own JSON envelope. CLI clients must inspect the HTTP status, content type, and headers before parsing a body.
