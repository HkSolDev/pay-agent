# Level 0 feature acceptance

## Junk filter

Run `pnpm exec vitest run worker/src/junk-filter.test.ts`.

- An email is ignored only when it has a `List-Unsubscribe` header and no INR amount.
- The filter is deterministic code; it must not invoke an LLM.
- A message without `List-Unsubscribe` remains in the queue for later classification.

## Manual Pay

Run `pnpm exec vitest run worker/src/manual-pay.test.ts`.

- The UI must expose a `Pay` button for an eligible queued email.
- Clicking it must require an explicit owner confirmation.
- The server must load recipient and amount from the database, never accept them from browser input.
- The server must atomically claim the payment before it calls the Perflo adapter.
- If the claim is already held, it must not call Perflo.
- The Perflo adapter must receive the payment intent's stable idempotency key.
