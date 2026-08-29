> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Authenticate partner wallet requests

> Bind each backend request to your partner registration, exact JSON body, and signed-in Privy user.

**Goal:** send a partner wallet request that Perflo can authenticate as both your backend and the signed-in Privy user.

Four partner wallet routes require a hash-based message authentication code (HMAC) signature and a Privy bearer token. The signature covers the method, public path, timestamp, and exact body bytes, so changing any signed value invalidates the request.

## Prerequisites

Collect the issued partner credentials and current user credential before constructing a request:

* A partner ID, key version, and signing secret issued by Perflo.
* A Privy application registered to that partner ID.
* A current Privy access token for the user behind the request.
* A backend secret store. Never sign these requests in browser code.

See [register the partner integration](/developers/partner-wallets/overview#register-the-partner-integration) for the values exchanged during onboarding.

## 1. Choose the required credentials

Each credential proves a separate part of the request:

| Credential                | Header                                     | Routes                                            |
| ------------------------- | ------------------------------------------ | ------------------------------------------------- |
| Partner request signature | Four `X-Partner-*` headers                 | Challenge, confirmation, handoff, and link status |
| Privy access token        | `Authorization: Bearer privy_access_token` | Challenge, confirmation, handoff, and link status |
| Privy identity token      | `Privy-Id-Token: privy_identity_token`     | Confirmation only                                 |
| Single-use handoff nonce  | JSON body                                  | Browser-called action validation only             |

The access token's audience must match the Privy application registered to your partner ID. Its declared lifetime must not exceed one hour. Perflo derives `appASubject` from the verified token, so no request accepts a subject field.

## 2. Build the canonical string

Join these five fields with `\n`, with no trailing newline:

```text theme={null}
key_version
UPPERCASE_METHOD
/partner/v1/path_without_query
unix_timestamp_seconds
lowercase_sha256_hex_of_exact_body_bytes
```

Use the value sent in `X-Partner-Key` as `key_version`. The public path excludes the origin and query string. `X-Partner-Timestamp` must be an integer in Unix seconds within 120 seconds of Perflo's clock.

## 3. Sign the canonical bytes

Compute HMAC-SHA256 over the canonical UTF-8 bytes and encode the 32-byte result as unpadded base64url. The result is 43 characters.

Perflo issues 32 secret bytes as a 43-character unpadded base64url string. Use that string directly as the HMAC key's UTF-8 bytes; do not decode it before signing.

This Node.js helper creates the four required headers:

```typescript theme={null}
import {createHash, createHmac} from 'node:crypto';

type PartnerCredentials = {
  id: string;
  keyVersion: string;
  secret: string;
};
```

```typescript theme={null}
function partnerHeaders(
  credentials: PartnerCredentials,
  method: string,
  path: string,
  body: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const canonical = [
    credentials.keyVersion,
    method.toUpperCase(),
    path,
    timestamp,
    bodyHash,
  ].join('\n');
  const signature = createHmac('sha256', credentials.secret)
    .update(canonical).digest('base64url');
  return {'X-Partner-Id': credentials.id,
    'X-Partner-Key': credentials.keyVersion,
    'X-Partner-Timestamp': timestamp,
    'X-Partner-Signature': signature};
}
```

## 4. Serialize once, then hash and send the same string

Create one body string before signing. Pass that same string to `fetch`; do not serialize the payload a second time.

```typescript theme={null}
const path = '/partner/v1/link/status';
const body = JSON.stringify({});
const signedHeaders = partnerHeaders(credentials, 'POST', path, body);

const response = await fetch(`https://api.perflo.ai${path}`, {
  method: 'POST',
  headers: {
    ...signedHeaders,
    Authorization: `Bearer ${privyAccessToken}`,
    'Content-Type': 'application/json',
  },
  body,
});
```

Hashing one serialization and sending another can produce a different byte sequence. That failure returns the same opaque `401 unauthorized` as every other credential failure.

The timestamp limits request freshness; it is not an idempotency key. Replaying a signed `POST /partner/v1/handoff` can mint another nonce, so disable automatic transport retries for that route. Challenge minting converges on one live challenge, confirmation is idempotent, and link status is a read.

## 5. Add the identity token only during confirmation

`POST /partner/v1/provision/confirm` also requires `Privy-Id-Token`. It must identify the same user as the bearer token, match the bearer session when the token carries `sid`, attest exactly one embedded Ethereum wallet, and match the posted `walletAddress`.

Enable Privy identity tokens for your application before starting provisioning. Keep both tokens in request headers, never in a URL.

## Rotate a signing key

Key rotation overlaps two accepted versions:

1. Receive the new key version and secret from Perflo.
2. Keep sending the old version while both versions are accepted.
3. Switch `X-Partner-Key` and the corresponding secret together.
4. Confirm that requests arrive on the new version.
5. Revoke the old version.

An unknown key version and a wrong secret both return `401 unauthorized`. Do not use error bodies to decide whether a rotation succeeded.

## If something goes wrong

* `401 unauthorized`: check the bearer audience and lifetime, partner ID, key version, Unix-seconds timestamp, path without query, body hash, and UTF-8 secret handling. The response does not identify which credential failed.
* `401 signature_invalid` on confirmation: the partner request passed authentication, but the user's wallet proof failed. Retry the proof while the challenge remains live.
* `415 invalid_content_type`: send JSON. Media type matching is case-insensitive and permits parameters such as `charset=utf-8`.
* Requests fail intermittently near the clock boundary: synchronize your backend clock and generate the timestamp immediately before sending.
* Authentication remains opaque after those checks: contact `support@perflo.ai` with the partner ID, route, `appASubject` when known, and UTC timestamp. Never include tokens, secrets, signatures, or nonces.

## Where to go next

Continue with [provision a partner wallet](/developers/partner-wallets/provisioning), or use the [endpoint reference](/developers/partner-wallets/reference) to check exact shapes and limits.

<Warning>
  The signing secret is symmetric authority over your partner requests. Store it in a backend secret manager and exclude it from repositories, browser bundles, logs, analytics, and support tickets.
</Warning>
