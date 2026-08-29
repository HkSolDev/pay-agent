> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Connect a Perflo login

> Link the gateway's dedicated device to the authenticated customer's Perflo account and verify capabilities.

**Goal:** a `connected` Perflo connection for one customer, so `/v1/*` routes can read and write on that account.

Connect the gateway after you have a customer Perflo token. The customer approves a second device on the same Perflo account. The gateway encrypts that device credential and uses it for `/v1/*` operations without ever returning it to your integration.

The customer device from [device authorization](/developers/get-started/authorize-device) authenticates your requests. The gateway device created here performs work on the account. They have separate device IDs and lifecycles.

## Prerequisites

* A valid customer `accessJwt` stored by your backend.
* A token whose `iat` is no more than five minutes old for start, reconnect, or disconnect. Refresh the customer token first if necessary.
* The customer available to approve the connection in a browser.

```bash theme={null}
export PERFLO_API_BASE_URL=https://api-gateway.perflo.ai
export PERFLO_CUSTOMER_TOKEN='customer_access_jwt'
```

## 1. Read the current onboarding state

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/onboarding"
```

Use `perflo_connection` as the connection gate:

| Status               | Next action                                                    |
| -------------------- | -------------------------------------------------------------- |
| `not_connected`      | Start a connection.                                            |
| `pending`            | Resume the existing browser action or poll it.                 |
| `connected`          | Continue to the `/v1/*` routes.                                |
| `reconnect_required` | Refresh the customer token and start a replacement connection. |

`capabilities` reports which surfaces the gateway currently exposes. It does not prove that the customer is connected. Before using a surface that reads or writes on the customer's Perflo account, require both `perflo_connection: "connected"` and its capability boolean. A false capability produces `503`, not an empty successful result.

The routes that reach a connection are the exception, because nothing could be connected before they run: `GET /v1/public-config`, `GET /v1/identity`, `GET /v1/onboarding`, `POST /v1/perflo-connections`, and `POST /v1/perflo-connections/current/poll` all answer without one.

## 2. Start or resume the connection

The request has no body and no idempotency key:

```bash theme={null}
CONNECTION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/perflo-connections")
```

A new connection returns `201` with `status: "pending"` and an `action`:

```json theme={null}
{
  "status": "pending",
  "account_identifier": null,
  "action": {
    "kind": "connect",
    "url": "https://app.perflo.ai/connect?...",
    "expires_at": "2026-08-13T13:30:00Z",
    "poll_after_ms": 3000
  }
}
```

The values are illustrative. Validate `action.kind`, require the URL origin to equal `https://app.perflo.ai`, and stop at `expires_at`. Repeating start while the stored session remains valid returns that session instead of creating another one.

If the API returns `403 step_up_required`, refresh the customer token and retry. Token freshness is derived from the signed `iat` claim; this is not a separate multifactor event.

## 3. Have the same customer approve

Open `action.url` in the customer's browser. The customer must sign in to the same Perflo wallet named by the bearer token. The gateway refuses a completed link whose wallet does not match.

Do not collect Perflo credentials, embed the login on another origin, or attach the customer bearer token to the hosted URL.

## 4. Poll the connection

Wait at least `action.poll_after_ms` milliseconds, then poll:

```bash theme={null}
CONNECTION=$(curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/perflo-connections/current/poll")
```

This route has no idempotency key. Repeat it only while the response or a fresh onboarding read reports `pending`. While pending, wait for the next positive `poll_after_ms` value. If it is absent, use a conservative three-second interval. Stop at `expires_at`.

* `connected` means the credential was validated, matched to the customer, and stored encrypted. The customer's own `account_identifier` is returned in full.
* `not_connected` means a first-time approval was denied or expired, or the customer disconnected. Start again only if the customer wants to retry.
* `reconnect_required` means a prior connection needs replacement.

If a poll response is lost or ambiguous, read `GET /v1/onboarding` before doing anything else. Completion retires the one-time link session, so blindly polling again can return `404` even though the gateway stored the credential successfully. Continue when onboarding says `connected`; poll again only when it says `pending`; otherwise follow the status table in step 1.

If a problem document sets `refresh_onboarding: true`, read `/v1/onboarding` again before choosing another action.

## 5. Verify readiness

Read onboarding again and then make a `/v1/*` read:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/accounts"
```

An unlinked or unusable device returns `409 account_authorization_required`. Refresh onboarding and follow the connection status instead of repeatedly calling the failed route.

## Disconnect safely

Finish or reconcile unsettled operations before disconnecting. A card-account withdrawal resting at `submitted`, or one that is `indeterminate` and whose `next_reconcile_at` is null, is not one of them: it needs no finishing and does not block the disconnect. The disconnect can return `409 perflo_disconnect_blocked` while an `indeterminate` withdrawal's single outstanding reconciliation pass is scheduled or running. Wait for the pass to finish and clear the operation's `next_reconcile_at`, then disconnect. The indeterminate row stays at the front of the operations list because it is an anomaly to look at, not work to wait on. Active mandates stay in place: disconnecting removes the link but keeps the account authority, and reconnecting the same account re-enables it.

If the customer wants an agent's standing authority actually stopped, revoke the mandate first. Revoking a beneficiary-payment mandate acts on the Perflo account itself and needs the stored credential, so `POST /v1/mandates/{mandate_id}/revoke` answers `409 account_authorization_required` once the account is disconnected. Reconnect the same account to revoke it, or stop the authorization in Perflo directly.

Then use a fresh customer token:

```bash theme={null}
curl --fail-with-body --request DELETE \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/perflo-connections/current"
```

Success is `204` with no body. This route coordinates local link removal (the gateway erases its stored credential) and best-effort revocation of the gateway device. Directly revoking the row marked `isGatewayDevice` through `/cli/token/revoke` is an incident kill switch, not the normal disconnect path.

If the delete response is lost or ambiguous, read `GET /v1/onboarding` before another write:

* `not_connected` means disconnect completed. Do not repeat it.
* `connected` means the revocation attempt did not advance past local preparation. With a fresh customer token, retry the exact delete after rechecking the unsettled-operation prerequisites.
* `reconnect_required` means the revocation was rejected or could not be authenticated. Reconnect the same account through steps 2 to 4, then disconnect it.

An uncertain revocation outcome retries automatically in the background, so you never resend the delete to move it along. Re-reading onboarding after such a retry reports `reconnect_required` or `not_connected` once it lands. `not_connected` means the disconnect finished and nothing is left to do; `reconnect_required` still needs the customer, so reconnect the same account through steps 2 to 4 and disconnect it again.

Do not infer failure from a missing `204`; onboarding is the recovery source of truth.

## If something goes wrong

* `403 step_up_required` on start, reconnect, or disconnect: the customer token's signed `iat` is older than five minutes. Refresh the token and retry the same call.
* `404` on the poll route after the customer approved: completion retires the one-time link session. Read `GET /v1/onboarding` instead of polling again.
* The poll never leaves `pending` and `expires_at` has passed: the hosted action is dead. Start a replacement connection.
* The completed link is refused: the customer approved on a different Perflo wallet than the bearer token names. Have the same customer sign in to the same wallet.
* `409 account_authorization_required` on a `/v1/*` route: the gateway device is unlinked or unusable. Re-read onboarding and follow the status table in step 1 rather than retrying the failed route.

## Where to go next

<Warning>
  This connection is the customer's authority over their own account, and every customer token, pairing, mandate, target, reservation, idempotency, reconciliation, and uncertain-write control is applied against the account it links. Disconnecting removes the gateway's device link and erases its stored credential, but it does not revoke that authority: mandates, agent pairings, beneficiaries, cards, quotes, and webhook subscriptions survive, and a later reconnect of the same Perflo account re-enables them. Before disconnecting, finish or reconcile unsettled operations so no uncertain write is left without a credential to reconcile it. A card-account withdrawal resting at `submitted`, or one that is `indeterminate` and whose `next_reconcile_at` is null, needs no finishing and does not block. The disconnect can return `409 perflo_disconnect_blocked` while an `indeterminate` withdrawal's single outstanding reconciliation pass is scheduled or running. Wait for the pass to finish and clear the operation's `next_reconcile_at`, then disconnect. The indeterminate row stays at the front of the operations list because it is an anomaly to look at, not work to wait on. Revoke any mandate the customer wants stopped before disconnecting, because a beneficiary-payment mandate can only be revoked while the account is connected.
</Warning>

Continue with the [quickstart](/developers/get-started/quickstart) to verify identity, connection state, and accounts.

<Note>
  No credential this page handles ever reaches an agent: the gateway device credential is never returned by the API at all.

  An agent never receives a key. The customer's Perflo token stays in your backend; the agent holds only a `pfa_` pairing token bound to one mandate, and its scopes come from the mandate kind rather than from anything the agent asserts. An agent cannot raise a cap or extend its own permissions: every bound is rechecked immediately before paying, so a request over a cap is refused rather than queued. Revoking a pairing always works and needs no Perflo connection — `DELETE /v1/mandates/{mandate_id}/pairings/{pairing_id}` invalidates the token immediately and cancels that pairing's unsent executions — but it does not undo a payment already submitted or left indeterminate. Revoking the mandate itself is the one revocation that can need the connected account's credential, because `POST /v1/mandates/{mandate_id}/revoke` needs a live connection for a beneficiary-payment mandate, so revoke the mandate before disconnecting.

  Stopping an agent is always an explicit revocation, never a side effect of disconnecting: a disconnect leaves every mandate standing, so end the ones the customer wants stopped while the account is still connected. Every payment an agent makes is the customer's own payment, recorded as an operation on their account.
</Note>
