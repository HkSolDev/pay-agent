> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Partner wallet endpoint reference

> Exact requests, responses, errors, limits, and single-use nonce behavior for the partner wallet API.

The partner wallet API contains five strict JSON endpoints under `https://api.perflo.ai/partner/v1/`. Four are backend routes authenticated by both a partner signature and Privy user token; the cross-origin Perflo signing frame calls the fifth with a single-use nonce.

## Endpoint summary

Each endpoint accepts `POST` with JSON and no query parameters:

| Path                              | Caller               | Purpose                                               |
| --------------------------------- | -------------------- | ----------------------------------------------------- |
| `/partner/v1/provision/challenge` | Partner backend      | Mint the wallet-control proof text                    |
| `/partner/v1/provision/confirm`   | Partner backend      | Verify the proof and create the permanent binding     |
| `/partner/v1/link/status`         | Partner backend      | Read the current binding                              |
| `/partner/v1/handoff`             | Partner backend      | Bind one text message to a 60-second capability       |
| `/partner/v1/action/validate`     | Perflo signing frame | Redeem the capability and resolve the signing context |

The separate `GET /partner/v1/approve?nonce=handoff_nonce` route returns the HTML signing page. It is not a JSON endpoint. The frame signs automatically when its matching session and wallet are ready; its route name does not describe a user-consent event.

## Common request rules

Every JSON body uses an exact key set. An unexpected top-level key returns `400 invalid_request`. Inside the handoff's `action`, an unexpected key, invalid `type`, invalid `message`, or caller-supplied wallet returns `422 unsupported_action`.

`Content-Type` must resolve to `application/json` after removing parameters and comparing without case sensitivity. For example, `application/json; charset=utf-8` is valid. Other media types return `415 invalid_content_type`.

No cross-origin resource sharing (CORS) header is sent, including on errors. Call the four signed routes from your backend, and load the signing page as a document in an iframe.

## Backend authentication

Challenge, confirmation, link status, and handoff use a hash-based message authentication code (HMAC) and require these headers:

| Header                | Format                                      |
| --------------------- | ------------------------------------------- |
| `Authorization`       | `Bearer privy_access_token`                 |
| `X-Partner-Id`        | Perflo-issued partner UUID                  |
| `X-Partner-Key`       | Issued key version, such as `v1`            |
| `X-Partner-Timestamp` | Unix timestamp in seconds                   |
| `X-Partner-Signature` | 43-character unpadded base64url HMAC-SHA256 |

Confirmation also requires `Privy-Id-Token: privy_identity_token`.

The canonical HMAC string has five newline-separated fields and no trailing newline:

```text theme={null}
key_version
UPPERCASE_METHOD
/partner/v1/path_without_query
unix_timestamp_seconds
lowercase_sha256_hex_of_exact_body_bytes
```

Use the issued secret string's UTF-8 bytes directly as the HMAC key. The timestamp window is ±120 seconds. See [authenticate partner wallet requests](/developers/partner-wallets/authentication) for a TypeScript implementation and key rotation.

The bearer token's audience must match the Privy application registered to the partner ID, and its declared lifetime must not exceed one hour. Perflo isolates the subject as `<partner ID>:<Privy DID>` and returns only the unnamespaced Privy decentralized identifier (DID) as `appASubject`. Clients never send either form.

The signed timestamp limits freshness but does not deduplicate a request. A replayed handoff can mint a second nonce; use the recovery rule for each endpoint instead of applying one automatic POST-retry policy.

## Common response rules

Every response carries `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. JSON responses use `Content-Type: application/json; charset=utf-8`.

Success bodies contain only the fields documented for that endpoint. There is no `success` field. Every error body contains only an error code:

```json theme={null}
{
  "error": {
    "code": "invalid_request"
  }
}
```

Errors contain no message, detail, field pointer, or request ID.

## `POST /partner/v1/provision/challenge`

This route returns the exact wallet-control challenge for the bearer subject.

### Challenge request

| Property       | Value                                    |
| -------------- | ---------------------------------------- |
| Authentication | Partner signature and Privy bearer token |
| Body           | Exactly `{}`                             |
| Body limit     | 1,024 bytes                              |
| Query          | None                                     |

```json theme={null}
{}
```

### Challenge `200` response

```json theme={null}
{
  "appASubject": "did:privy:clz9k1abc4defghijklmnop",
  "expiresAt": "2026-08-20T12:02:00.000Z",
  "message": "Connect your Perflo wallet to Acme Pay\n\nThis proves you control the Acme Pay wallet and creates a separate Perflo wallet for this account.\nIt does not send a transaction, move funds, give Acme Pay the Perflo signing key, or approve later actions.\n\nAcme Pay: https://app.acme.com\nPerflo: https://api.perflo.ai\nPerflo App ID: cm0perfloappid0000000000\nRequest nonce: UvImZaYMEtKJGF2VDuiBNgkWb2sRPReNbA_TkB_yOaE",
  "nonce": "UvImZaYMEtKJGF2VDuiBNgkWb2sRPReNbA_TkB_yOaE"
}
```

| Field         | Type            | Meaning                                              |
| ------------- | --------------- | ---------------------------------------------------- |
| `appASubject` | string          | Unnamespaced Privy DID derived from the bearer token |
| `expiresAt`   | ISO 8601 string | Challenge expiry, 120 seconds after minting          |
| `message`     | string          | Exact nine-line proof text                           |
| `nonce`       | string          | 43-character base64url challenge nonce               |

At most one live challenge exists per subject. Concurrent mints return the same live challenge, and an expired challenge is replaced.

Rebuild the nine-line message locally and require exact equality before signing. Lines 2 and 5 are empty; separators are `\n`; there is no trailing newline or carriage return:

```text theme={null}
Connect your Perflo wallet to registered_partner_name

This proves you control the registered_partner_name wallet and creates a separate Perflo wallet for this account.
It does not send a transaction, move funds, give registered_partner_name the Perflo signing key, or approve later actions.

registered_partner_name: https://registered.partner.example
Perflo: https://api.perflo.ai
Perflo App ID: perflo_privy_app_id
Request nonce: challenge_nonce
```

The registered name is 1 to 40 characters from letters, digits, spaces, and `. , & ' ( ) -`. It has no leading, trailing, or doubled spaces and cannot equal `Perflo`, `Perflo App ID`, or `Request nonce`.

### Provision challenge errors

| Status | Code                   | Recovery                         | Condition                                                   |
| ------ | ---------------------- | -------------------------------- | ----------------------------------------------------------- |
| `400`  | `invalid_request`      | Correct the request              | Body is not exactly `{}`                                    |
| `401`  | `unauthorized`         | Correct credentials              | Partner signature or bearer token failed                    |
| `413`  | `request_too_large`    | Correct the request              | Body exceeds 1,024 bytes                                    |
| `415`  | `invalid_content_type` | Correct the request              | Media type does not resolve to JSON                         |
| `429`  | `rate_limited`         | Retry after the budget resets    | Partner request budget is exhausted                         |
| `500`  | `server_misconfigured` | Contact support                  | Required service configuration is unavailable               |
| `500`  | `internal_error`       | Retry the same challenge request | A retry converges on the live challenge when one was minted |

## `POST /partner/v1/provision/confirm`

This route verifies the partner wallet proof, creates a fresh Perflo wallet, and permanently binds it to the bearer subject.

### Confirmation request

| Property       | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| Authentication | Partner signature, Privy bearer token, and `Privy-Id-Token` |
| Body           | Exactly `nonce`, `signature`, and `walletAddress`           |
| Body limit     | 4,096 bytes                                                 |
| Query          | None                                                        |

```json theme={null}
{
  "nonce": "UvImZaYMEtKJGF2VDuiBNgkWb2sRPReNbA_TkB_yOaE",
  "signature": "0x123456789012345678901234567890123456789012345678901234567890123412345678901234567890123456789012345678901234567890123456789012341b",
  "walletAddress": "0x1234567890123456789012345678901234567890"
}
```

| Field           | Type   | Meaning                                                                                        |
| --------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `nonce`         | string | Live 43-character challenge nonce                                                              |
| `signature`     | string | Ethereum Improvement Proposal 191 (EIP-191) `personal_sign` signature over the exact challenge |
| `walletAddress` | string | Embedded Ethereum wallet that produced the proof                                               |

The identity token must match the bearer user, match its session when `sid` is present, attest exactly one embedded Ethereum wallet, and name `walletAddress`.

### Confirmation `200` response

```json theme={null}
{
  "appASubject": "did:privy:clz9k1abc4defghijklmnop",
  "linked": true,
  "recoveryFactors": ["wallet"],
  "walletAddress": "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"
}
```

| Field             | Type           | Meaning                                                                         |
| ----------------- | -------------- | ------------------------------------------------------------------------------- |
| `appASubject`     | string         | Unnamespaced Privy DID derived from the bearer token                            |
| `linked`          | boolean        | Always `true` after successful confirmation                                     |
| `recoveryFactors` | string\[]      | Deduplicated recovery factors, starting with `wallet`                           |
| `walletAddress`   | string or null | Fresh Perflo wallet address, or null if an existing bound wallet is unavailable |

The response address is the Perflo wallet, not the wallet that signed the challenge. A fresh wallet starts with `wallet`; `passkey` is the only factor that can join later. The array contains no more than 16 entries.

Confirmation is idempotent and safe to retry. An existing link returns live status, and an existing provisioning operation resumes without rechecking the proof. Otherwise, Perflo verifies the identity token, challenge subject, locally derived message, and signature before redeeming the challenge.

### Provision confirmation errors

| Status | Code                             | Recovery                                            | Condition                                                                |
| ------ | -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `400`  | `invalid_request`                | Correct the request                                 | Nonce, signature, address, or key set is malformed                       |
| `401`  | `signature_invalid`              | Same challenge                                      | Wallet proof failed; the challenge remains live                          |
| `401`  | `unauthorized`                   | Correct credentials                                 | Partner, bearer, or identity credential failed                           |
| `403`  | `challenge_expired`              | New challenge                                       | Challenge expired, belongs to another subject, or lost a redemption race |
| `409`  | `provisioning_recovery_required` | Contact support                                     | The 23-hour create window passed without a recoverable user              |
| `413`  | `request_too_large`              | Correct the request                                 | Body exceeds 4,096 bytes                                                 |
| `415`  | `invalid_content_type`           | Correct the request                                 | Media type does not resolve to JSON                                      |
| `429`  | `rate_limited`                   | Retry the same confirmation after the budget resets | Partner request budget is exhausted                                      |
| `500`  | `server_misconfigured`           | Contact support                                     | Required service configuration is unavailable                            |
| `500`  | `internal_error`                 | Retry the same confirmation                         | An unhandled failure interrupted the idempotent operation                |
| `502`  | `provisioning_failed`            | Same confirmation                                   | Provisioning state or wallet creation failed transiently                 |

## `POST /partner/v1/link/status`

This route returns the authoritative binding for the bearer subject.

### Link status request

| Property       | Value                                    |
| -------------- | ---------------------------------------- |
| Authentication | Partner signature and Privy bearer token |
| Body           | Exactly `{}`                             |
| Body limit     | 1,024 bytes                              |
| Query          | None                                     |

```json theme={null}
{}
```

### Link status `200` responses

A linked user with an available wallet returns:

```json theme={null}
{
  "appASubject": "did:privy:clz9k1abc4defghijklmnop",
  "linked": true,
  "recoveryFactors": ["wallet", "passkey"],
  "walletAddress": "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"
}
```

An unlinked user returns:

```json theme={null}
{
  "appASubject": "did:privy:clz9k1abc4defghijklmnop",
  "linked": false,
  "recoveryFactors": [],
  "walletAddress": null
}
```

A binding whose wallet is unavailable returns `linked: true`, `walletAddress: null`, and its known recovery factors. This is a valid linked state, not an unlinked result.

| Field             | Type           | Meaning                                              |
| ----------------- | -------------- | ---------------------------------------------------- |
| `appASubject`     | string         | Unnamespaced Privy DID derived from the bearer token |
| `linked`          | boolean        | Whether a permanent binding exists                   |
| `recoveryFactors` | string\[]      | Deduplicated factors, capped at 16 entries           |
| `walletAddress`   | string or null | Current bound wallet when available                  |

An unlinked result always couples `linked: false`, `walletAddress: null`, and `recoveryFactors: []`. Unreadable wallet or recovery data returns an error instead of a misleading empty successful result.

### Link status errors

| Status | Code                   | Recovery                               | Condition                                          |
| ------ | ---------------------- | -------------------------------------- | -------------------------------------------------- |
| `400`  | `invalid_request`      | Correct the request                    | Body is not exactly `{}`                           |
| `401`  | `unauthorized`         | Correct credentials                    | Partner signature or bearer token failed           |
| `413`  | `request_too_large`    | Correct the request                    | Body exceeds 1,024 bytes                           |
| `415`  | `invalid_content_type` | Correct the request                    | Media type does not resolve to JSON                |
| `429`  | `rate_limited`         | Retry the read after the budget resets | Partner request budget is exhausted                |
| `500`  | `server_misconfigured` | Contact support                        | Required service configuration is unavailable      |
| `500`  | `internal_error`       | Retry the read                         | An unhandled failure interrupted the request       |
| `502`  | `link_lookup_failed`   | Retry the read                         | Wallet or recovery data could not be read reliably |

## `POST /partner/v1/handoff`

This route validates and binds the unchanged `action.message` to a single-use browser capability.

### Handoff request

| Property       | Value                                                  |
| -------------- | ------------------------------------------------------ |
| Authentication | Partner signature and Privy bearer token               |
| Body           | Exactly one `action` with exactly `type` and `message` |
| Body limit     | 8,192 bytes                                            |
| Query          | None                                                   |

```json theme={null}
{
  "action": {
    "type": "personal_sign",
    "message": "Sign in to Acme"
  }
}
```

| Field            | Type   | Constraint                   |
| ---------------- | ------ | ---------------------------- |
| `action.type`    | string | Exactly `personal_sign`      |
| `action.message` | string | 1 to 5,000 UTF-16 code units |

The outer body must contain only `action`; another top-level key returns `400 invalid_request`. Inside `action`, any key beyond `type` and `message`, including `walletAddress`, returns `422 unsupported_action`. Invalid action types and messages also return `422`. The body byte cap applies independently of the message's code-unit cap.

### Handoff `200` response

```json theme={null}
{
  "expiresAt": "2026-08-20T12:01:00.000Z",
  "nonce": "oJXyD5OVZQz5OAuO2yJKaySKHpJOj9CuLhqUkqMwXxg"
}
```

| Field       | Type            | Meaning                                                     |
| ----------- | --------------- | ----------------------------------------------------------- |
| `expiresAt` | ISO 8601 string | Capability expiry, 60 seconds after minting                 |
| `nonce`     | string          | 43-character base64url capability, valid for one redemption |

Pass the nonce only as the parent page's iframe URL: `GET https://api.perflo.ai/partner/v1/approve?nonce=handoff_nonce`. Your parent page does not receive the action body; the cross-origin Perflo frame resolves it during validation.

### Handoff errors

| Status | Code                   | Recovery                      | Condition                                                  |
| ------ | ---------------------- | ----------------------------- | ---------------------------------------------------------- |
| `400`  | `invalid_request`      | Correct the request           | Outer body or key set is malformed                         |
| `401`  | `unauthorized`         | Correct credentials           | Partner signature or bearer token failed                   |
| `413`  | `request_too_large`    | Correct the request           | Serialized body exceeds 8,192 bytes                        |
| `415`  | `invalid_content_type` | Correct the request           | Media type does not resolve to JSON                        |
| `422`  | `unsupported_action`   | Correct the action            | Action keys, type, message, or wallet selection is invalid |
| `429`  | `rate_limited`         | Retry after the budget resets | Partner request budget is exhausted before minting         |
| `500`  | `server_misconfigured` | Contact support               | Required service configuration is unavailable              |
| `500`  | `internal_error`       | Do not replay automatically   | The handoff outcome is unknown                             |

The handoff route has no idempotency key. After a transport failure or `500 internal_error`, discard any late response and wait out the possible 60-second capability before starting another deliberate signing attempt.

## `POST /partner/v1/action/validate`

This route redeems a handoff and returns the exact signing context to the cross-origin Perflo frame. Partner backends and parent-page browser code do not call it.

### Action validation request

| Property       | Value                          |
| -------------- | ------------------------------ |
| Authentication | Single-use handoff nonce only  |
| Body           | Exactly `nonce`                |
| Body limit     | 1,024 bytes                    |
| Query          | None                           |
| Rate limit     | 300 requests per IP per minute |

```json theme={null}
{
  "nonce": "oJXyD5OVZQz5OAuO2yJKaySKHpJOj9CuLhqUkqMwXxg"
}
```

### Action validation `200` response

```json theme={null}
{
  "appASubject": "did:privy:clz9k1abc4defghijklmnop",
  "message": "Sign in to Acme",
  "requesterOrigin": "https://app.acme.com",
  "type": "personal_sign",
  "walletAddress": "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"
}
```

| Field             | Type          | Meaning                                                        |
| ----------------- | ------------- | -------------------------------------------------------------- |
| `appASubject`     | string        | Partner subject stored with the handoff                        |
| `message`         | string        | Validated, unchanged `action.message` bound at handoff minting |
| `requesterOrigin` | origin string | Exact registered origin that may receive the signature         |
| `type`            | string        | `personal_sign`                                                |
| `walletAddress`   | string        | Bound Perflo wallet resolved during redemption                 |

The request never supplies the wallet or requester origin. The frame signs `message` byte for byte with `walletAddress` and posts the result only to `requesterOrigin`.

### Nonce consumption

The validation result determines whether the single-use nonce survives:

| Outcome                                       | Status and code            | Nonce state                               |
| --------------------------------------------- | -------------------------- | ----------------------------------------- |
| Malformed body or nonce                       | `400 invalid_request`      | Nothing looked up                         |
| Body exceeds 1,024 bytes                      | `413 request_too_large`    | Preserved; nothing looked up              |
| Media type is not JSON                        | `415 invalid_content_type` | Preserved; nothing looked up              |
| Dead or unknown nonce                         | `403 handoff_expired`      | Untouched                                 |
| Stored action is invalid                      | `422 unsupported_action`   | Consumed                                  |
| Subject has no binding                        | `403 not_linked`           | Consumed                                  |
| Stored subject has no usable partner          | `422 unsupported_action`   | Consumed                                  |
| Bound wallet is unavailable                   | `422 wallet_unavailable`   | Consumed                                  |
| Link lookup fails transiently                 | `502 link_lookup_failed`   | Preserved                                 |
| Redemption race is lost                       | `403 handoff_expired`      | Already consumed                          |
| IP rate limit is exceeded                     | `429 rate_limited`         | Preserved                                 |
| Required service configuration is unavailable | `500 server_misconfigured` | Not specified; do not reuse automatically |
| An unhandled failure occurs                   | `500 internal_error`       | Unknown; retrying the same nonce is safe  |
| Validation succeeds                           | `200`                      | Consumed                                  |

The same nonce can be retried after `429 rate_limited`, `500 internal_error`, or `502 link_lookup_failed`, and only before `expiresAt`. After `internal_error`, the retry succeeds if the nonce survived or returns `403 handoff_expired` if it was consumed. A `500 server_misconfigured` is not retryable until Perflo corrects the configuration.

## Error code reference

The error code determines recovery behavior; all other error details remain opaque:

| Status | Code                             | Recovery                                     | Meaning                                                                               |
| ------ | -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `400`  | `invalid_request`                | Correct the request                          | Body shape or field format failed                                                     |
| `401`  | `unauthorized`                   | Correct credentials                          | Any partner, bearer, or identity credential failed                                    |
| `401`  | `signature_invalid`              | Same live challenge                          | Wallet proof failed during confirmation                                               |
| `403`  | `not_linked`                     | New flow after linking                       | The handoff subject has no permanent binding                                          |
| `403`  | `challenge_expired`              | New challenge                                | Challenge expired, belongs to another subject, or lost a race                         |
| `403`  | `handoff_expired`                | New handoff                                  | Capability is dead, unknown, or already consumed                                      |
| `404`  | `not_found`                      | Correct the path                             | No route exists at that partner wallet path                                           |
| `409`  | `provisioning_recovery_required` | Contact support                              | The create window passed                                                              |
| `413`  | `request_too_large`              | Correct the request                          | Request exceeds the route's body limit                                                |
| `415`  | `invalid_content_type`           | Correct the request                          | Media type does not resolve to `application/json`                                     |
| `422`  | `unsupported_action`             | Correct the action or start a new flow       | Action keys, type, message, wallet selection, or stored action context is unsupported |
| `422`  | `wallet_unavailable`             | Contact support                              | The bound wallet is no longer available                                               |
| `429`  | `rate_limited`                   | Retry after the budget resets                | Caller exceeded its request budget                                                    |
| `500`  | `server_misconfigured`           | Contact support                              | Required service configuration is unavailable                                         |
| `500`  | `internal_error`                 | Follow the endpoint rule                     | The request encountered an unhandled failure                                          |
| `502`  | `provisioning_failed`            | Retry the same confirmation                  | Provisioning state or wallet creation failed transiently                              |
| `502`  | `link_lookup_failed`             | Retry the read or preserved validation nonce | Wallet lookup failed or returned unreadable data                                      |

Every `401 unauthorized` has the same response body. The only non-opaque `401` is `signature_invalid` for the wallet proof on confirmation.

For an unexplained error, contact `support@perflo.ai` with the partner ID, route, `appASubject` when known, and UTC timestamp. Never include tokens, secrets, signatures, or nonces.

## Limits and lifetimes

These limits apply independently, so a request must satisfy all relevant rows:

| Limit                    | Value                   | Scope                                                               |
| ------------------------ | ----------------------- | ------------------------------------------------------------------- |
| Challenge lifetime       | 120 seconds             | One live challenge per partner subject                              |
| Handoff lifetime         | 60 seconds              | Single-use capability                                               |
| Request signature window | ±120 seconds            | Difference between request timestamp and Perflo clock               |
| Default body limit       | 1,024 bytes             | Challenge, link status, and action validation                       |
| Confirmation body limit  | 4,096 bytes             | Provision confirmation                                              |
| Handoff body limit       | 8,192 bytes             | Handoff minting                                                     |
| Message length           | 5,000 UTF-16 code units | `action.message`                                                    |
| Backend request rate     | 1,200 per minute        | Per partner across signed routes                                    |
| Frame validation rate    | 300 per minute          | Per IP for action validation                                        |
| Recovery factors         | 16 entries              | Deduplicated response array                                         |
| Frame `ready` deadline   | 15 seconds              | Parent page from iframe mount                                       |
| SIWE bootstrap deadline  | 15 seconds              | Address discovery, message generation, and partner-wallet signature |
| Perflo session readiness | 15 seconds              | From SIWE login start to usable session                             |
| Perflo wallet readiness  | 15 seconds              | From usable session to matching embedded wallet                     |

Expired handoff records can remain stored for one hour before cleanup, but they stop authorizing validation at `expiresAt`.

## Related guides

* [Partner wallet overview](/developers/partner-wallets/overview)
* [Authenticate partner wallet requests](/developers/partner-wallets/authentication)
* [Provision a partner wallet](/developers/partner-wallets/provisioning)
* [Sign a message with a partner wallet](/developers/partner-wallets/sign-messages)
