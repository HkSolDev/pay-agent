> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Use the TypeScript SDK

> Install the Perflo TypeScript SDK preview, configure a bearer token, and make typed API calls.

**Goal:** a typed Perflo client in your browser, backend, or Cloudflare Worker that you can trust with a money movement.

Use the `@perflo/finance-sdk` TypeScript software development kit (SDK) from browsers, Node.js, or Cloudflare Workers. Create a client for each credential, handle HTTP failures through the returned fields, and persist mutation controls before sending money.

## Prepare your runtime

Choose the runtime and credential storage required by your integration. Before you begin, prepare:

* Node.js 22.18 or later for installation and builds
* A browser, Node.js backend, or Cloudflare Worker that can store the credential used by the integration
* A customer Perflo token or a mandate-scoped `pfa_` agent token for protected operations

Read [authentication and token lifecycle](/developers/concepts/authentication) before storing or rotating credentials.

## Install the SDK

<Note>
  The SDK is a preview distributed as a GitHub Release tarball. Its package identity is already `@perflo/finance-sdk`, so your imports will not change when npm distribution begins.
</Note>

Set the preview release location in your shell:

```bash theme={null}
sdk_version="v0.1.0-beta.13"
sdk_archive="perflo-finance-sdk-0.1.0-beta.13.tgz"
sdk_releases="https://github.com/perflo-ai/perflo-finance-sdk/releases"
```

Install the tarball with pnpm or npm:

```bash theme={null}
pnpm add "$sdk_releases/download/$sdk_version/$sdk_archive"
# or
npm install "$sdk_releases/download/$sdk_version/$sdk_archive"
```

The package is ECMAScript module (ESM) only and uses Web Platform APIs. It has no runtime dependencies, and its distribution contains no Node builtin imports. Browsers and Cloudflare Workers can use `globalThis.fetch` or pass an injected `fetch` implementation. The package exports generated operations and types from its root. Review the source and release checksums in the [Perflo Finance SDK repository](https://github.com/perflo-ai/perflo-finance-sdk).

## Test the SDK against production

To connect a real customer account and exercise capability-gated reads, hosted sessions, quotes, webhooks, and guarded mutations, follow [test the live TypeScript SDK](/developers/get-started/live-api-exercise).

## Create a customer client

Create one client with the customer token. The default origin is `https://api-gateway.perflo.ai`.

```typescript theme={null}
import {
  createPerfloClient,
  getIdentity,
  isProblemDetails,
} from "@perflo/finance-sdk";

const client = createPerfloClient({
  token: "customer_access_jwt",
});
```

The client sends `Authorization` only for operations that require bearer authentication. It omits browser credentials, never follows redirects, and returns redirects as non-ok results. Node.js and Cloudflare Workers preserve the 3xx status; browsers expose the Fetch-standard opaque redirect response. When a token is configured, the client can retry an authenticated request once after a successful agent-token refresh, as described below.

Read the verified caller identity through the same client:

```typescript theme={null}
const { data, error, response } = await getIdentity({ client });

if (isProblemDetails(error)) {
  console.error(error.code, error.detail, response?.status);
} else if (error) {
  console.error("The identity request failed", response?.status, error);
} else if (data) {
  console.log(data.actor_type, data.subject, data.wallet);
}
```

HTTP error statuses do not drive exception-based control flow. The `error` field is `unknown` because it can hold a problem document, an unexpected HTTP body, a decode failure, a request-construction failure, or a Fetch failure. Use `isProblemDetails(error)` before reading problem fields. Request-construction, network, and Fetch failures return without a response.

Generated operations decode their declared successful response as JSON even when the server sends a different `Content-Type`. An empty or malformed non-`204` success returns a decode error with the HTTP response instead of successful data. A `204` result has `data: undefined`; a JSON `null` remains `data: null`.

## Resolve rotated credentials per request

Pass a callback when your credential store can replace the token. The client resolves the callback before each protected operation.

```typescript theme={null}
const rotating_client = createPerfloClient({
  token: async () => process.env.PERFLO_CUSTOMER_TOKEN,
});

const identity = await getIdentity({
  client: rotating_client,
});
```

The callback may return a string, `undefined`, or a promise of either value. If it resolves to a `pfa_` token, an authenticated `401` calls the agent-token refresh route with the token used by the failed request. A valid refresh response causes the SDK to resolve your callback again for the retry. The response token is never pinned into callback state, so your credential store remains authoritative.

Customer access tokens never trigger the agent-token refresh route. Keep the existing customer access/refresh-token state machine around generated SDK operations. Exchange the refresh token through the generated public operation, then atomically persist the returned credential pair:

```typescript theme={null}
import { refreshToken } from "@perflo/finance-sdk";

const refreshed_customer = await refreshToken({
  body: { refreshToken: credential_store.refreshToken },
  client: rotating_client,
});

if (refreshed_customer.data?.data) {
  await credential_store.replace(refreshed_customer.data.data);
}
```

The response can contain a rotated `refreshToken`, a new `accessJwt`, and `expiresAt`. The token callback resolves the new `accessJwt` on the next protected operation. A lost or ambiguous customer refresh response must start a new device authorization because the refresh token can rotate. Keep any customer step-up or fresh-`iat` checks in the surrounding state machine.

## Create an agent client

Create a separate client for each mandate-scoped agent token. Separate clients do not share authentication state.

```typescript theme={null}
const agent_client = createPerfloClient({
  token: "pfa_agent_pairing_token",
});

const agent_identity = await getIdentity({
  client: agent_client,
});
```

The gateway limits this client to the active pairing and mandate behind its `pfa_` token. Read [agent mandates](/developers/guides/agent-mandates) before executing an agent action.

## Refresh an agent token

The gateway's `POST /v1/agent-tokens/refresh` route re-stamps the pairing and returns the same token value. Schedule the next refresh within `expires_in` seconds after receiving a successful response. The mandate can shorten this duration. Call the client method when you need an explicit freshness checkpoint:

```typescript theme={null}
const refreshed = await agent_client.refreshAgentToken();

if (isProblemDetails(refreshed.error)) {
  console.error(refreshed.error.code, refreshed.response?.status);
} else if (refreshed.error) {
  console.error("The token refresh failed", refreshed.response?.status);
}
```

The generated `refreshAgentToken({ client: agent_client })` operation remains available. A valid response replaces a static client token. Callback clients do not store the response value and resolve the callback for their next authenticated request.

Automatic agent refresh is on by default for clients whose resolved credential starts with `pfa_`. On an authenticated `401`, the SDK makes one raw refresh request and retries the original request once. The retry preserves the method, URL, serialized body, `Idempotency-Key`, and `Idempotency-Replay-Not-After`. A failed refresh or second `401` returns the original result. If the retry reaches the server but its response is lost, the SDK returns the retry transport error with no response. That outcome is not a definitive no-operation result and prohibits a replacement write. Customer tokens, the refresh route itself, and public operations never trigger automatic agent refresh.

Disable automatic refresh when another layer owns the policy:

```typescript theme={null}
const manually_refreshed_client = createPerfloClient({
  autoRefreshToken: false,
  token: "pfa_agent_pairing_token",
});
```

Concurrent expired-token requests can each refresh. No cross-request lock is required because re-stamping is idempotent and the token value does not rotate.

## Call a public operation

Public operations need no token. Create an unauthenticated client and pass it to `publicConfig`:

```typescript theme={null}
import {
  createPerfloClient,
  publicConfig,
} from "@perflo/finance-sdk";

const public_client = createPerfloClient();
const { data: public_data, error: public_error } = await publicConfig({
  client: public_client,
});
```

The generated authentication metadata keeps `Authorization` off this request, even when another client has a token.

## Generate keys for purchase quotes

Configure `idempotencyKeyFactory` when purchase quotes need an SDK-managed key:

```typescript theme={null}
const quoting_client = createPerfloClient({
  idempotencyKeyFactory: () => crypto.randomUUID(),
  token: "pfa_agent_pairing_token",
});
```

The factory runs only for `POST /v1/purchase-quotes` when the request has no `Idempotency-Key`. It never overwrites a caller-provided quote key. An automatic refresh retry reuses the generated key.

The SDK never generates keys for purchases, transfers, or any other mutation. Persist and supply those keys yourself. After a `submission_uncertain` result, never invent a replacement key or create a replacement operation.

## Submit a confirmed transfer

Persist the confirmed quote, confirmation intent ID, idempotency key, and exact body before the first request. Then pass request parts through the generated `body` and `headers` groups:

```typescript theme={null}
import { createTransfer } from "@perflo/finance-sdk";

const transfer = await createTransfer({
  client,
  body: {
    quote_id: "confirmed_transfer_quote_id",
  },
  headers: {
    "Confirmation-Intent-ID": "confirmation_intent_id",
    "Idempotency-Key": "idempotency_key_for_transfer",
  },
});
```

The SDK serializes only the values you supply. It does not create confirmations or generate transfer idempotency keys. This example uses a customer token, so a `401` returns to your customer access/refresh-token state machine. Automatic agent-token refresh applies only when the sent credential starts with `pfa_`.

Inspect the `ProblemDetails` fields and replay header before choosing the next action:

```typescript theme={null}
const replayed =
  transfer.response?.headers.get("Idempotent-Replayed") === "true";

console.log("replayed", replayed);

if (isProblemDetails(transfer.error)) {
  console.error(
    transfer.error.code,
    transfer.error.retryable,
    transfer.error.submission_uncertain,
  );
} else if (transfer.error) {
  console.error("The transfer request failed", transfer.response?.status);
}
```

If `submission_uncertain` is `true`, stop new writes for that logical transfer and reconcile its operation. Do not generate another idempotency key or submit a replacement payment. Read [confirmation and idempotency](/developers/concepts/confirmation-idempotency) and [operations and errors](/developers/concepts/operations-errors) before implementing mutation recovery.

The package exports two helpers for this decision:

```typescript theme={null}
import {
  isDefinitiveNoOperation,
  isSubmissionUncertain,
} from "@perflo/finance-sdk";

if (isSubmissionUncertain(transfer.error)) {
  await reconcile_recorded_operation();
}
```

`isSubmissionUncertain(error)` returns `true` only when the error carries `submission_uncertain === true`. `isDefinitiveNoOperation(error)` returns `true` only when all four conditions hold:

* `status` is a `4xx` value other than `408`
* A valid, non-null problem document exists
* `submission_uncertain !== true`
* `problem.code` does not start with `idempotency_`

A definitive no-operation result proves the write never landed, so a replacement operation is safe. Every other result requires the recovery policy documented in [operations and errors](/developers/concepts/operations-errors).

## If something goes wrong

* `error` is set but `response` is `undefined`: no API response arrived, and a financial request may have reached the server. This is not a definitive no-operation result. Do not create a replacement write until you reconcile the recorded operation or otherwise prove dispatch never occurred.
* `error` is set and `response.ok` is true: the success body did not match its declared JSON contract. For a financial mutation, keep the persisted body and idempotency controls and reconcile the operation before another write.
* A protected operation still returns `401`: automatic refresh was disabled, the refresh failed, or the one retry also returned `401`. The SDK returns the original result and does not make a second refresh attempt.
* A mutation returns `submission_uncertain: true`: stop new writes for that logical action and reconcile its operation. Never generate a replacement idempotency key.

## Where to go next

Use the [TypeScript SDK reference](/developers/reference/typescript-sdk) for every client method, generated operation, alias, and type-naming rule. Use the **API reference** tab for wire-level schemas and status-specific responses. Keep the [curl tutorial](/developers/get-started/quickstart) as the transport-level reference for raw requests and headers, and read [operations and errors](/developers/concepts/operations-errors) before implementing mutation recovery.
