> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Authorize a customer device

> Run the Perflo device flow, obtain a customer token, refresh it safely, and revoke the device when it is no longer needed.

**Goal:** a validated Perflo access and refresh token pair for one customer, stored on your backend, that you can refresh and revoke.

Use the device-flow `/cli/*` proxy endpoints to sign a customer in to Perflo without collecting a password. Your backend starts a device session, the customer approves it on `app.perflo.ai`, and your backend receives the customer's Perflo access and refresh tokens. CLI signing approvals use `/cli/sign/start` and `/cli/sign/poll`; see [authentication and token lifecycle](/developers/concepts/authentication).

<Warning>
  The completed device response contains the customer's Perflo access and refresh tokens. Keep them in an encrypted server-side credential store. Do not return them to browser JavaScript, put them in URLs, commit them, or log request and response bodies from this flow.
</Warning>

## Prerequisites

* A customer with a Perflo login.
* A server process that can protect access and refresh tokens.
* `curl` and `jq` for the examples.

Set the gateway origin:

```bash theme={null}
export PERFLO_API_BASE_URL=https://api-gateway.perflo.ai
```

## 1. Start device authorization

Choose names the customer will recognize on the Perflo approval screen:

```bash theme={null}
DEVICE_START=$(curl --fail-with-body --request POST \
  --header 'Content-Type: application/json' \
  --data '{"clientName":"Your integration","deviceName":"Production backend"}' \
  "$PERFLO_API_BASE_URL/cli/device/start")
```

The response contains `data.sid`, `data.connectUrl`, `data.pollInterval`, and `data.expiresIn`. `pollInterval` is milliseconds and `expiresIn` is seconds.

Treat start as successful only when the HTTP response succeeds, `success` is true, and every required `data` field is present and usable. The proxy relays bodies without runtime response-model validation.

```bash theme={null}
export PERFLO_DEVICE_SID=$(jq -er \
  'select(.success == true) | .data.sid | select(type == "string" and length > 0)' \
  <<<"$DEVICE_START")
export PERFLO_CONNECT_URL=$(jq -er \
  '.data.connectUrl | select(type == "string" and length > 0)' \
  <<<"$DEVICE_START")
jq -e '
  (.data.pollInterval | type == "number" and . > 0) and
  (.data.expiresIn | type == "number" and . > 0)
' >/dev/null <<<"$DEVICE_START"
```

Treat `sid` as a short-lived secret. Do not let one customer observe or poll another customer's session.

## 2. Send the customer to Perflo

Before opening `$PERFLO_CONNECT_URL`, parse it and require its origin to equal `https://app.perflo.ai`. Open it in the customer's browser. The customer signs in to Perflo and approves the named device there.

Do not ask the customer to enter Perflo credentials into your application. Do not proxy or embed the Perflo login page.

## 3. Poll at the advertised interval

Wait `max(500, pollInterval)` milliseconds between calls and stop when `expiresIn` elapses. Tight polling is rate-limited by both client address and session ID.

```bash theme={null}
DEVICE_POLL=$(curl --fail-with-body --request POST \
  --header 'Content-Type: application/json' \
  --data "$(jq -nc --arg sid "$PERFLO_DEVICE_SID" '{sid:$sid}')" \
  "$PERFLO_API_BASE_URL/cli/device/poll")
```

Branch on `data.status`:

| Status     | Action                                                           |
| ---------- | ---------------------------------------------------------------- |
| `pending`  | Wait at least the advertised interval, then poll again.          |
| `complete` | Store `data.result` atomically and stop polling.                 |
| `denied`   | Stop. Tell the customer approval was declined.                   |
| `expired`  | Stop. Start a new device session if the customer wants to retry. |

If the gateway returns `429`, wait for the `Retry-After` interval. Do not rotate session IDs to bypass the limit.

The gateway's per-session poll limit returns `application/problem+json` with `code: "rate_limited"`, `retryable: true`, a request ID, and `Retry-After: 60`. Relayed errors keep their own JSON envelope. Inspect the HTTP status and content type before parsing the response.

## 4. Store the completed credential set

On `complete`, require `data.result.accessJwt`, `refreshToken`, `expiresAt`, `deviceId`, `email`, and `walletAddress`. `expiresAt` is Unix time in milliseconds. `token` is a deprecated migration field; do not use it as a fallback.

Store the credential set as one record. Exporting values is convenient for this walkthrough, but a production process should read them directly from its secret store:

```bash theme={null}
export PERFLO_CUSTOMER_TOKEN=$(jq -er \
  '.data.result.accessJwt | select(type == "string" and length > 0)' <<<"$DEVICE_POLL")
export PERFLO_REFRESH_TOKEN=$(jq -er \
  '.data.result.refreshToken | select(type == "string" and length > 0)' <<<"$DEVICE_POLL")
export PERFLO_CUSTOMER_DEVICE_ID=$(jq -er \
  '.data.result.deviceId | select(type == "string" and length > 0)' <<<"$DEVICE_POLL")
jq -e '
  .data.status == "complete" and
  (.data.result.email | type == "string" and length > 0) and
  (.data.result.walletAddress | type == "string" and length > 0) and
  (.data.result.expiresAt | type == "number" and . > now * 1000)
' >/dev/null <<<"$DEVICE_POLL"
```

Verify the token against the gateway:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/v1/identity"
```

The response must report `actor_type: "customer"`. Bind the stored credential to the returned `subject` and `wallet`; never select a customer from an unverified request parameter.

## 5. Refresh as one atomic replacement

Before `expiresAt`, exchange the refresh token:

```bash theme={null}
TOKEN_REFRESH=$(curl --fail-with-body --request POST \
  --header 'Content-Type: application/json' \
  --data "$(jq -nc --arg refresh_token "$PERFLO_REFRESH_TOKEN" \
    '{refreshToken:$refresh_token}')" \
  "$PERFLO_API_BASE_URL/cli/token/refresh")
export NEXT_PERFLO_CUSTOMER_TOKEN=$(jq -er \
  'select(.success == true) | .data.accessJwt | select(type == "string" and length > 0)' \
  <<<"$TOKEN_REFRESH")
export NEXT_PERFLO_REFRESH_TOKEN=$(jq -er \
  '.data.refreshToken | select(type == "string" and length > 0)' <<<"$TOKEN_REFRESH")
jq -e '(.data.expiresAt | type == "number" and . > now * 1000)' \
  >/dev/null <<<"$TOKEN_REFRESH"
```

Serialize concurrent refresh attempts. Refresh is not idempotent: the refresh token can rotate when it is spent. Replace the stored `accessJwt`, `refreshToken`, and `expiresAt` together only after every check above succeeds. Never keep the new access token with an old refresh token. A refreshed access token also renews the five-minute freshness window required by sensitive customer actions.

If the refresh response is lost or ambiguous, keep the last validated tuple unchanged but do not retry its refresh token. It may already have rotated. Run a fresh device authorization from step 1 and store that fully validated credential set as the deterministic recovery path. Use the new access token to list devices and revoke the superseded device when it is still present. Follow the same recovery path when the old refresh token is explicitly rejected.

## 6. List or revoke devices

List the customer's devices with the access token:

```bash theme={null}
curl --fail-with-body \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  "$PERFLO_API_BASE_URL/cli/devices"
```

After the customer connects the gateway, the row matching the gateway's own device carries `isGatewayDevice: true` when the gateway has enough evidence to annotate it. Absence of a true row does not prove that no local link exists. The device authorized in this guide and the gateway device are different rows; never infer the gateway row from a display name.

Revoke this customer device when the integration no longer needs it:

```bash theme={null}
curl --fail-with-body --request POST \
  --header "Authorization: Bearer $PERFLO_CUSTOMER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "$(jq -nc --arg device_id "$PERFLO_CUSTOMER_DEVICE_ID" \
    '{deviceId:$device_id}')" \
  "$PERFLO_API_BASE_URL/cli/token/revoke"
```

## If something goes wrong

* Polling returns `429`: you are polling faster than the advertised interval. Honour `Retry-After`; rotating session IDs to evade the limit is rate-limited too.
* `data.status` is `denied` or `expired`: stop polling. Start a new device session only if the customer wants to retry.
* A required field is missing from a successful response: treat the step as failed. The proxy relays bodies without runtime response-model validation, so a `2xx` alone does not prove the payload is usable.
* A refresh response is lost or ambiguous: keep the last validated credential tuple, do not retry that refresh token, and run a fresh device authorization from step 1. The refresh token may already have rotated.
* A `/cli/sign/start` call returns `401`: sign start requires the customer bearer token. Refresh the customer token and retry.

## Where to go next

[Connect the same Perflo login to the gateway](/developers/get-started/connect-perflo). That second device is what the `/v1/*` routes acting on the customer's Perflo account use. Onboarding, identity, and the connection routes themselves need nothing beyond the customer token, which is how you reach a connection in the first place.
