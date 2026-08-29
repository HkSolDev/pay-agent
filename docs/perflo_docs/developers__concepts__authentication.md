> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Authentication and token lifecycle

> Use customer Perflo tokens, gateway device credentials, and mandate-scoped pairing tokens without exposing financial authority.

Choose the credential from the operation's caller class. A valid bearer token does not imply permission to call every bearer-authenticated route.

| Caller           | Credential                             | Authority                                          |
| ---------------- | -------------------------------------- | -------------------------------------------------- |
| Customer backend | Perflo EdDSA `accessJwt`               | The customer's identity and customer-only routes   |
| Paired agent     | Opaque gateway `pfa_` token            | Scopes derived from one active mandate and pairing |
| CLI refresh      | Perflo `refreshToken` in the JSON body | Exchange for a current customer credential set     |
| Webhook receiver | Per-subscription HMAC secret           | Verify deliveries for one customer subscription    |

`GET /v1/public-config`, device start, device poll, token refresh, sign poll, and connect-code redemption require no bearer. Their request payload or short-lived code is still sensitive.

## Keep the customer token server-side

Send the customer's Perflo access token as a bearer token from your backend:

```http theme={null}
Authorization: Bearer customer_access_jwt
```

The gateway verifies each token's EdDSA signature against Perflo's published signing keys before trusting its claims. The token is financial authority over the customer's Perflo account. Holding it in browser JavaScript would let an XSS vulnerability act as the customer, so production integrators must keep it in a server-side session or similarly protected backend store.

Perflo's own demo browser client stores and sends the token deliberately, to exercise the contract end to end. It is a test surface, not an integration pattern to copy.

Sensitive customer actions require the signed `iat` to be no more than five minutes old. A `403` problem with `code: "step_up_required"` means refresh the customer token and retry the same logical action. Token freshness is not a separate multifactor-authentication claim.

## Manage the customer token

The gateway relays exactly seven Perflo CLI endpoints:

| Method | Path                 | Purpose                                      |
| ------ | -------------------- | -------------------------------------------- |
| `POST` | `/cli/device/start`  | Start device authentication                  |
| `POST` | `/cli/device/poll`   | Poll the device session                      |
| `POST` | `/cli/token/refresh` | Refresh a customer Perflo token              |
| `GET`  | `/cli/devices`       | List devices and identify the gateway device |
| `POST` | `/cli/token/revoke`  | Revoke a customer token or device            |
| `POST` | `/cli/sign/start`    | Start a CLI signing approval                 |
| `POST` | `/cli/sign/poll`     | Poll the signing session                     |

Successful responses and relayed failures pass through exactly as Perflo returns them; the gateway adds no token format of its own. Gateway authentication, validation, and address-rate-limit failures use `application/problem+json`. The gateway's per-session poll limit returns ProblemDetails with `Retry-After: 60`, while relayed errors keep their own JSON envelope. Check the status and content type before parsing, apply the polling interval in the response, and treat refresh-token replacement as atomic.

See [authorize a customer device](/developers/get-started/authorize-device) for exact request bodies, response states, interval units, refresh, device listing, and revocation.

<Warning>
  Treat the `sid` from sign start as a short-lived secret: sign poll is public, and the session ID is the capability. Do not let one customer observe or poll another customer's session.
</Warning>

## Keep the gateway device separate

Operations on the customer's account run through a second device credential encrypted by the gateway. If it has not been linked, a read or write returns `409 account_authorization_required`. Call `POST /v1/perflo-connections`, open its hosted action, and poll `POST /v1/perflo-connections/current/poll`. Never copy the customer's token into this stored gateway credential slot.

Pairing, mandate, target, reservation, idempotency, and reconciliation constraints are applied to every call made with this credential. Treat the stored credential as sensitive: it is the account's authority, which is why the API never returns it.

See [connect a Perflo login](/developers/get-started/connect-perflo) for the complete hosted-action, polling, readiness, reconnect, and disconnect flow.

## Pair an external agent

An agent receives neither the customer token nor a general OAuth grant. The customer creates a mandate, issues a ten-minute single-use connect code, and passes it out of band. The agent redeems it without prior authentication:

```bash theme={null}
curl --fail-with-body --request POST \
  --header 'Content-Type: application/json' \
  --data '{"code":"ABCD-EFGH-JKLM-NPQR","agent_name":"Invoice assistant"}' \
  https://api-gateway.perflo.ai/v1/connect-codes/redeem
```

The successful response returns the `pfa_` token once, with `mandate_id`, `scopes`, and `expires_in`. Store it like a password. The token remains the same when refreshed at `POST /v1/agent-tokens/refresh`; refresh updates its issue time rather than rotating it. The configured maximum age is a refresh checkpoint, not a bound on theft: revocation or mandate expiry is what ends a copied token's authority. Because nothing else bounds a copied token, the mandate's own limits are what a leaked one can actually spend. See [size a mandate](/developers/guides/agent-mandates#choose-the-mandate-kind) for setting them to that.

See [agent mandates](/developers/guides/agent-mandates) for scope derivation, pairing revocation, and limit enforcement.

## Verify webhook signatures separately

The subscription signing secret is not a bearer token. Use it only to verify `Perflo-Signature` over the exact request bytes. Store one secret per subscription and rotate it by replacing the subscription. See [webhooks](/developers/guides/webhooks).
