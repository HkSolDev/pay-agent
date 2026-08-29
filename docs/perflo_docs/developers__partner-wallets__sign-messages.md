> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Sign a message with a partner wallet

> Bind one personal_sign message to a single-use handoff and verify the Perflo wallet's returned signature.

**Goal:** receive and verify one Ethereum Improvement Proposal 191 (EIP-191) signature from the Perflo wallet permanently linked to the signed-in partner user.

Your backend binds the exact message to a 60-second handoff. Your parent page passes only that nonce to Perflo's cross-origin frame; the frame resolves the message, wallet, subject, and result origin itself.

The frame signs automatically once the matching Perflo session and wallet are ready. The `/approve` route name and an `approved` result describe cryptographic completion, not a user-consent event. Collect and enforce any required per-action consent before minting the handoff.

## Prerequisites

* Completed [partner request authentication](/developers/partner-wallets/authentication).
* A fresh status read with `linked: true` and a non-null `walletAddress`.
* A signed-in Privy user with the embedded Ethereum wallet used during provisioning.
* A parent page served from the exact web origin registered with Perflo.

## 1. Bind one message to a handoff

Sign and send `POST /partner/v1/handoff` with exactly one `action`. The only supported type is `personal_sign`:

```json theme={null}
{
  "action": {
    "type": "personal_sign",
    "message": "Sign in to Acme"
  }
}
```

The message must contain 1 to 5,000 UTF-16 code units. The complete JSON body must also fit within 8,192 bytes, so escaped or multibyte characters can reach the byte cap first.

Do not include `walletAddress` or any other action key. Perflo resolves the wallet from the permanent binding.

Before sending, capture one attempt context: the current `appASubject`, Privy session when present, embedded partner-wallet object and address, linked Perflo `walletAddress`, original message, and a monotonically increasing generation. Retire that generation if the user logs out, the subject or session changes, or Privy replaces either wallet object or address.

A successful response creates a 60-second, single-use capability:

```json theme={null}
{
  "expiresAt": "2026-08-20T12:01:00.000Z",
  "nonce": "oJXyD5OVZQz5OAuO2yJKaySKHpJOj9CuLhqUkqMwXxg"
}
```

After awaiting the handoff response, recheck the entire attempt context before accepting its nonce. Store the original subject, both wallet addresses, message, generation, nonce, and `expiresAt` together. Never use one handoff for another message or browser identity.

## 2. Embed the signing page

Set the iframe source to the Perflo `/approve` page with the encoded nonce:

```html theme={null}
<iframe
  allow="publickey-credentials-get https://api.perflo.ai; publickey-credentials-create https://api.perflo.ai"
  referrerpolicy="no-referrer"
  src="https://api.perflo.ai/partner/v1/approve?nonce=handoff_nonce"
  title="Perflo signature execution"
></iframe>
```

The page is an HTML browser surface, not a JSON endpoint. Your backend must not call `POST /partner/v1/action/validate`; the framed page redeems the nonce itself.

The iframe requires the WebAuthn permissions shown above. No cross-origin resource sharing (CORS) headers are sent on the partner wallet surface, so your parent-page browser JavaScript must not call its JSON routes directly.

Capture the iframe's exact `contentWindow` after mounting it. Start a 15-second deadline at mount and retire the attempt if that window does not send its correlated `ready` message in time.

## 3. Authenticate every frame message

Bind messaging to the captured window and attempt generation. Replies must target that same window, never a global window reference or `*`:

```typescript theme={null}
const perfloOrigin = 'https://api.perflo.ai';
const activeWindow = approvalFrame.contentWindow;
const activeGeneration = signingGeneration;

function isActiveEvent(event: MessageEvent): boolean {
  return activeWindow !== null
    && event.origin === perfloOrigin
    && event.source === activeWindow
    && approvalFrame.contentWindow === activeWindow
    && signingGeneration === activeGeneration;
}

function replyToActiveFrame(payload: unknown): void {
  if (activeWindow === null) return;
  if (approvalFrame.contentWindow !== activeWindow) return;
  if (signingGeneration !== activeGeneration) return;
  activeWindow.postMessage(payload, perfloOrigin);
}
```

Use an exact-key check for each message variant rather than accepting a superset:

```typescript theme={null}
function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
```

Reject an event unless `isActiveEvent(event)` remains true. For approval messages, also require `requestId` to equal the current handoff nonce and require the exact key set in the table below. Retire the iframe and increment the generation after one terminal result.

Handle these exact signing-result payloads:

| Status     | Exact fields                                 | Meaning                                                         |
| ---------- | -------------------------------------------- | --------------------------------------------------------------- |
| `ready`    | `source`, `status`, `requestId`              | Perflo initialized the framed wallet client                     |
| `approved` | `source`, `status`, `requestId`, `signature` | The linked Perflo wallet automatically signed the bound message |
| `rejected` | `source`, `status`, `requestId`              | The signing flow ended without a signature                      |
| `failed`   | `source`, `status`, `requestId`, `reason`    | Initialization or wallet-session setup failed                   |

Every approval payload uses `source: "perflo-approve"`. The failure reasons have exact meanings:

| Reason                     | Meaning                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `initialization_failed`    | The framed Privy client failed to initialize                                                      |
| `authentication_timeout`   | SIWE login started, but no usable Perflo session appeared within 15 seconds                       |
| `wallet_readiness_timeout` | A Perflo session exists, but its matching embedded wallet did not become usable within 15 seconds |

An approved result has this shape:

```json theme={null}
{
  "requestId": "oJXyD5OVZQz5OAuO2yJKaySKHpJOj9CuLhqUkqMwXxg",
  "signature": "0x123456789012345678901234567890123456789012345678901234567890123412345678901234567890123456789012345678901234567890123456789012341b",
  "source": "perflo-approve",
  "status": "approved"
}
```

## 4. Answer Sign-In with Ethereum bootstrap messages

When the frame has no usable Perflo session, it uses Sign-In with Ethereum (SIWE) to authenticate through the user's existing partner wallet. The frame sends an address request first:

```json theme={null}
{
  "phase": "address",
  "requestId": "12345678-1234-1234-1234-123456789012",
  "source": "perflo-siwe"
}
```

The frame generates a fresh UUID for this SIWE exchange. Its `requestId` is distinct from the 43-character handoff nonce.

Return the current embedded Ethereum wallet as a valid Ethereum address, or report that none is available:

```json theme={null}
{
  "address": "0x1234567890123456789012345678901234567890",
  "phase": "address",
  "requestId": "12345678-1234-1234-1234-123456789012",
  "source": "perflo-siwe",
  "status": "available"
}
```

The unavailable response has the same fields except `status: "unavailable"` and no `address`. Before either response, require the subject, session, partner-wallet object and address, active window, and generation to match the attempt snapshot. Send the response with `replyToActiveFrame`.

The frame then sends a sign request with the same SIWE `requestId` and a `message`. Before signing, require the exact source, phase, request ID, key set, and this 12-line message structure:

```json theme={null}
{
  "message": "validated_12_line_siwe_message",
  "phase": "sign",
  "requestId": "12345678-1234-1234-1234-123456789012",
  "source": "perflo-siwe"
}
```

```text theme={null}
api.perflo.ai wants you to sign in with your Ethereum account:
partner_wallet_address

By signing, you are proving you own this wallet and logging in. This does not initiate a transaction or cost any fees.

URI: https://api.perflo.ai
Version: 1
Chain ID: 1
Nonce: alphanumeric_nonce_of_at_least_8_characters
Issued At: canonical_iso_8601_timestamp
Resources:
- https://privy.io
```

Reject a message containing a carriage return, another wallet address, origin, version, chain ID, statement, resource, or malformed timestamp. If it matches, capture the current wallet object, address, subject, session, and generation, then sign with that wallet.

```json theme={null}
{
  "phase": "sign",
  "requestId": "12345678-1234-1234-1234-123456789012",
  "signature": "0x123456789012345678901234567890123456789012345678901234567890123412345678901234567890123456789012345678901234567890123456789012341b",
  "source": "perflo-siwe",
  "status": "signed"
}
```

After the asynchronous wallet signature resolves, recheck the captured wallet object, address, subject, session, active window, and generation before sending `status: "signed"`. If any value changed, or if validation or signing fails, send the same `source`, `phase`, and `requestId` with `status: "rejected"` and no signature. Use `replyToActiveFrame` for every response.

A `signed` response signature must be a valid `0x`-prefixed hexadecimal string of exactly 132 characters. The frame silently ignores a response that fails its exact shape, address, request ID, or signature checks.

The frame allows 15 seconds for address discovery, SIWE message generation, and the SIWE signature exchange. Complete both phases within that window. A bootstrap timeout does not make an earlier handoff safe to reuse.

## 5. Verify the action signature

Treat an `approved` message as untrusted input until you verify it against the original attempt:

1. Require the current subject, session, partner wallet, active window, and generation to match the snapshot captured before handoff minting.
2. Read `POST /partner/v1/link/status` again from your backend for that original subject.
3. Require `appASubject` to equal the captured original subject and `walletAddress` to equal the captured linked Perflo wallet.
4. Recover the EIP-191 signer from the exact original handoff message and returned signature.
5. Require the recovered address to equal the fresh `walletAddress`, case-insensitively.
6. Recheck the complete attempt context after every awaited status or verification operation.

Store the exact message, signature, verified wallet address, and handoff nonce only if every check passes. An `approved` result proves that signature completed; it does not prove that the user approved the action.

## If something goes wrong

* `422 unsupported_action` from handoff: send exactly `type` and `message`, use `personal_sign`, and remove any wallet field.
* `413 request_too_large`: shorten the message based on serialized UTF-8 bytes, not only JavaScript string length.
* A handoff request ends without a readable response: do not replay the signed POST automatically because another request creates another nonce. Discard any late response, retire the attempt, and wait out the possible 60-second capability before minting a replacement.
* The frame misses the 15-second `ready` deadline: retire its window and generation, then verify the API origin, certificate, iframe permissions, registered frame origin, and Privy allowed origins.
* The frame reports `initialization_failed`: verify the Perflo origin and Privy client configuration, then use a new handoff.
* The frame reports `authentication_timeout`: confirm that the parent answers both SIWE phases from the current embedded wallet within the 15-second deadlines.
* The frame reports `wallet_readiness_timeout`: confirm that the linked Perflo wallet remains available, then mint a new handoff.
* A returned signature fails verification: discard it, reread link status, and do not retry with the same nonce.
* The user closes the frame: closing it does not prove that an in-progress signature stopped. Retire the frame and mint a new handoff only for a new signing attempt.
* Frame or signature failures remain unexplained: contact `support@perflo.ai` with the partner ID, route, original `appASubject`, and UTC timestamp. Never include tokens, secrets, signatures, or nonces.

## Where to go next

Use the [partner wallet endpoint reference](/developers/partner-wallets/reference) for exact response fields, the action-validation nonce burn matrix, and retry rules.

<Warning>
  The frame signs a caller-selected message automatically and is an origin-isolation boundary, not a user-consent boundary. A relying service can attach consequences to a valid EIP-191 signature. Collect required consent before minting the handoff, constrain allowed messages in your backend, and never treat `approved` as proof of consent.
</Warning>
