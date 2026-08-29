> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Test the live TypeScript SDK

> Connect a customer account and exercise the production Perflo Finance API with guarded reads, sessions, webhooks, quotes, and mutations.

**Goal:** run the SDK against a real customer account, verify supported production surfaces, and preserve enough evidence to reconcile every financial request safely.

The SDK repository includes one TypeScript runner for the production API. Its default account run changes only the device connections that you approve. It does not create beneficiaries, cards, mandates, purchases, transfers, withdrawals, or webhooks unless you enable the matching option.

## 1. Prepare the source checkout

Clone the repository, install its locked development dependencies, then generate and build the SDK:

```bash theme={null}
git clone https://github.com/perflo-ai/perflo-finance-sdk.git
cd perflo-finance-sdk
corepack enable
pnpm install --frozen-lockfile
pnpm run generate
pnpm run build
```

The repository pins pnpm and enforces a seven-day minimum package release age. Node.js 22.18 runs the TypeScript file directly through its built-in [TypeScript type stripping](https://nodejs.org/download/release/v22.18.0/docs/api/typescript.html), so the exercise adds no runtime package.

Finish generation and compilation before you export a customer token or live mutation fixture. `pnpm test:live` starts only the audited TypeScript runner, so build tools and development dependencies do not inherit live credentials.

Every HTTP request times out after 30 seconds. Set `PERFLO_LIVE_REQUEST_TIMEOUT_MS` to another value in milliseconds when a controlled test environment needs a different bound. Connection and operation polling have separate three-minute overall deadlines through `PERFLO_LIVE_CONNECTION_TIMEOUT_MS` and `PERFLO_LIVE_OPERATION_TIMEOUT_MS`.

Verify production reachability without connecting an account:

```bash theme={null}
pnpm test:live -- --public-only
```

The command calls `GET /v1/public-config` with the built local SDK and prints a summary. A successful public smoke ends with `Summary: 1 passed, 0 failed, 0 skipped`.

## 2. Connect and verify a customer account

Run the complete default exercise from an interactive terminal:

```bash theme={null}
pnpm test:live
```

Complete the account flow in this order:

1. Open the first `https://app.perflo.ai` URL that the command prints. Sign in and approve the device named **Perflo Finance SDK live exercise**.
2. Read the email and masked wallet in the terminal. Type the full email to confirm that this is your account.
3. If the gateway has no usable Perflo connection, type `CONNECT`.
4. Open the second `https://app.perflo.ai` URL. Approve the gateway device while signed in to the same Perflo account.
5. Return to the terminal and press Enter. The exercise polls at the advertised interval and starts the live read pass after onboarding reports `connected`.

The first device authenticates this process. The second connection lets `/v1/*` routes act on that same Perflo account. Read [authorize a customer device](/developers/get-started/authorize-device) and [connect a Perflo login](/developers/get-started/connect-perflo) for the token and recovery contracts behind these two approvals.

The exercise keeps newly issued customer credentials in memory and never prints them. To use a customer token from your server-side credential store, pass it through the environment:

```bash theme={null}
export PERFLO_CUSTOMER_TOKEN='customer_access_jwt'
pnpm test:live
```

An interactive run asks you to confirm the email returned by the approved device session. It also rejects the run if that email differs from an email already recorded on the gateway customer. For a non-interactive read run, set `PERFLO_CONFIRMED_ACCOUNT_EMAIL` to the exact email on the authenticated customer record. A customer record without an email requires interactive device authorization. Add `--no-connect` when you want gateway reads without creating or replacing the Perflo connection.

Creating or replacing the Perflo connection requires a customer token issued within the previous five minutes. If a stored token is older, rerun without `PERFLO_CUSTOMER_TOKEN` and approve a new device authorization.

## 3. Read the result

Each line starts with one outcome:

* `PASS`: the live call returned a usable success response
* `FAIL`: the call or a required response check failed
* `SKIP`: the connected account has no matching capability, no resource ID was available for a detail call, or the slow authorized-device read returned one `504`

The exercise sends read requests sequentially with a short delay between them. The authorized-device list can time out for accounts with many devices, so one `504` on that read is reported as `SKIP` instead of failing the pass. Every other device-list error and every `504` from another endpoint remains a failure.

The default connected run covers these surfaces:

| Surface       | Calls                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Account setup | Public config, customer identity, onboarding, authorized devices                                |
| Money reads   | Know Your Customer (KYC) status, deposit accounts, display currency, activity, spending account |
| Beneficiaries | Countries, schemas, beneficiary list, first beneficiary detail                                  |
| Cards         | Card list, first card’s transactions                                                            |
| Authority     | Mandate list, first mandate detail, beneficiary grants                                          |
| Operations    | Operation list, first operation detail                                                          |
| Services      | Catalogue, capability search, first service detail, purchases, first purchase detail            |
| Events        | Webhook subscription list                                                                       |

The account-scoped reads are gated: the exercise calls one only when onboarding reports `connected` and that surface's capability boolean is true, and records a `SKIP` otherwise. The reads that need neither are not gated and always run — public configuration, customer identity, onboarding, operations, and webhook subscriptions — as does the authorized-device read, whose single `504` is the `SKIP` described above. A failed call on an advertised capability is a `FAIL`. Empty collections produce a valid list `PASS` and a detail `SKIP`.

Set an existing withdrawal ID to cover the one detail route that has no list endpoint:

```bash theme={null}
export PERFLO_LIVE_SPENDING_WITHDRAWAL_ID='withdrawal_id_from_your_store'
pnpm test:live
```

## 4. Create a hosted KYC session

When the account needs to start or continue verification, pass `--kyc-session`:

```bash theme={null}
pnpm test:live -- --kyc-session
```

Type `KYC` when prompted. The exercise verifies that the returned action uses HTTPS, carries no embedded credentials, and names a host of at least two ASCII labels of letters, digits and inner hyphens, none of them `localhost` and none beginning `xn--`, each label at most 63 characters and the host at most 253, with one trailing dot allowed and a final label that is neither all digits nor `0x` hex. It refuses IP literals, a zero or empty port, a percent sign or bracket in the authority, and a backslash, a space or an ASCII control character anywhere. It then prints the URL Perflo states for the customer. This check does not verify ownership, DNS resolution, or reachability. Open the URL in the same customer's browser. This creates no financial operation and does not poll KYC; run the default read pass later to observe the new status.

## 5. Add non-executable quote coverage

Pass `--quotes` to quote the first returned service. A purchase quote records a five-minute observation but does not buy the service.

To test a transfer quote too, supply an existing beneficiary and a source amount:

```bash theme={null}
export PERFLO_LIVE_TRANSFER_QUOTE='{"beneficiary_id":"beneficiary_id","source":{"amount":"10.00","currency":"USD"}}'
pnpm test:live -- --quotes
```

A transfer quote is an estimate. The exercise does not turn `PERFLO_LIVE_TRANSFER_QUOTE` into a transfer.

## 6. Test webhook registration and cleanup

Supply a public HTTPS receiver, then enable the webhook lane:

```bash theme={null}
export PERFLO_LIVE_WEBHOOK_URL='https://receiver.example.com/perflo'
pnpm test:live -- --webhook
```

Type `WEBHOOK` when prompted. The exercise creates the subscription without printing its one-time signing secret, then deletes that subscription. This tests registration and deletion, not delivery or hash-based message authentication code (HMAC) verification. Use the [webhooks guide](/developers/guides/webhooks) to test a signed delivery against a receiver that preserves the raw request body.

The callback URL cannot contain credentials, a query, or a fragment. If the create response is unknown, the exercise reports newly observed subscription IDs but does not delete any of them because it cannot prove which client created them. If deletion or its follow-up read fails, the exercise prints the known created subscription ID for manual cleanup without printing the signing secret.

## 7. Run explicit live mutations

The `--mutations` lane can create live resources and move real money. It runs only in an interactive terminal, requires one exact `RUN …` phrase per financial mutation, and rejects confirmed mutations when the customer token is more than five minutes old. Card reveal creates no financial operation and uses the separate phrase `REVEAL CARD`.

Configure one or more scenarios before running the lane:

| Environment variable                    | JSON value                                                              | Live effect                          |
| --------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| `PERFLO_LIVE_BENEFICIARY`               | `BeneficiaryCreate`                                                     | Creates a saved payout beneficiary   |
| `PERFLO_LIVE_CARD_CREATE`               | `CardCreate`                                                            | Issues a card                        |
| `PERFLO_LIVE_CARD_ACTION`               | `{"action":"freeze","card_id":"existing_card_id"}`                      | Freezes or unfreezes one card        |
| `PERFLO_LIVE_CARD_REVEAL_ID`            | Card ID string                                                          | Creates a hosted card reveal session |
| `PERFLO_LIVE_MANDATE`                   | `CreateMandateData["body"]`                                             | Creates bounded agent authority      |
| `PERFLO_LIVE_MANDATE_EXECUTION`         | `{"mandate_id":"existing_mandate_id","body":MandateExecutionCreate}`    | Pays under a mandate                 |
| `PERFLO_LIVE_BENEFICIARY_GRANT_PAYMENT` | `{"grant_id":"existing_grant_id","body":BeneficiaryGrantPaymentCreate}` | Pays under a beneficiary grant       |
| `PERFLO_LIVE_PURCHASE`                  | `PurchaseCreate`                                                        | Buys a live service                  |
| `PERFLO_LIVE_SPENDING_WITHDRAWAL`       | `SpendingWithdrawalCreate`                                              | Returns held spending funds          |
| `PERFLO_LIVE_TRANSFER`                  | `QuoteCreate`                                                           | Quotes and then submits a transfer   |

Use generated SDK types and live discovery results to build each JSON value. Beneficiary fields come from `beneficiarySchemas`; service input comes from `getService`; IDs come from their matching list calls. The [beneficiary and transfer](/developers/guides/beneficiaries-transfers), [cards](/developers/guides/cards), [agent mandates](/developers/guides/agent-mandates), [service purchases](/developers/guides/service-purchases), and [spending](/developers/guides/spending) guides define each body and prerequisite.

For example, this submits a real transfer after quoting the exact request:

```bash theme={null}
export PERFLO_LIVE_TRANSFER='{"beneficiary_id":"beneficiary_id","source":{"amount":"10.00","currency":"USD"}}'
pnpm test:live -- --mutations
```

The terminal shows the quote and transfer body. Type `RUN transfer` only after you verify the beneficiary, amount, currency, and estimate.

## 8. Reconcile or clean up a mutation run

The exercise holds an exclusive lock while it reads and updates `.perflo-live-api-state.json`. The versioned journal is bound to the API origin, authenticated subject, and customer ID, and the repository ignores it. Set `PERFLO_LIVE_JOURNAL` when you need another secure local path.

Persistence happens in stages:

1. Before a financial request, the exercise atomically writes its exact method, path, body, confirmation payload, and idempotency key with mode `0600`. It syncs the file and parent directory before dispatch.
2. After a confirmation intent succeeds, it adds the confirmation intent ID before submitting the financial request.
3. Immediately before dispatch, it records the submission start time. A missing time therefore proves that the financial request was not sent.
4. After the financial response names an operation that matches the journaled action and submission window, it adds the operation ID before polling. A mismatched response ID is retained only as untrusted support evidence and does not block a verified replacement.
5. After a terminal operation read, it records `succeeded`, `failed`, or `cancelled`.

An uncertain response may have no operation ID. An `indeterminate` operation or interrupted poll also remains unresolved. The exercise refuses every later mutation until the journal proves a terminal result. Do not delete the entry, change its idempotency key, or rerun the request.

Reconcile every entry that already has an operation ID:

```bash theme={null}
pnpm test:live -- --reconcile
```

The command reads and follows the recorded operation. It updates terminal entries and leaves `indeterminate` or unreadable entries blocked. Rerun it after the operation changes or follow [operations and errors](/developers/concepts/operations-errors) for a customer-assisted approval.

When an uncertain response has no operation ID, the same command inspects recent same-kind operation history and prints the journal entry ID, idempotency key, and possible operation IDs. Those fields are not sufficient to choose an operation safely. Send the journal entry ID, idempotency key, API origin, customer email, and timestamps to [support@perflo.ai](mailto:support@perflo.ai) without sending the request body.

If support identifies the exact operation, bind and reconcile it:

```bash theme={null}
export PERFLO_LIVE_RECONCILE_ENTRY_ID='journal_entry_id'
export PERFLO_LIVE_RECONCILE_OPERATION_ID='support_verified_operation_id'
pnpm test:live -- --reconcile
```

Verify the redacted request, then type the complete `ATTACH operation_id TO journal_entry_id` phrase printed by the command. The exercise rejects an operation with the wrong kind or creation window.

If the attached operation is still open, rerun the same command after its state changes. Leaving the same entry and operation environment variables set is safe: matching evidence is treated as already attached and conflicting operation IDs are rejected.

If support proves that no operation exists, mark that definitive result instead:

```bash theme={null}
export PERFLO_LIVE_RECONCILE_ENTRY_ID='journal_entry_id'
export PERFLO_LIVE_RECONCILE_NO_OPERATION='journal_entry_id'
pnpm test:live -- --reconcile
```

Type the complete `RESOLVE journal_entry_id AS NO OPERATION` phrase only after support verifies the idempotency record. The journal records the request as rejected, which permits a later new logical request with a new key.

If a process is killed or the host loses power while the journal is locked, verify and remove only the stale lock:

```bash theme={null}
pnpm test:live -- --unlock
```

The command refuses to remove a lock owned by a running process. For a dead owner, type the complete `UNLOCK pid` phrase that it prints. An unreadable lock must be at least one minute old and uses `UNLOCK UNKNOWN`; first verify that no other live exercise is running. This removes only `.perflo-live-api-state.json.lock`, not the mutation journal.

The exercise does not close cards, revoke mandates, revoke the gateway device or the device it authorized, or disconnect the Perflo account. Closing a card or revoking a mandate destroys authority the customer may still want, and disconnecting erases the credential that revoking a mandate needs. Clean up a successful test through its task guide after you verify the final state.

## If something goes wrong

* A device or Perflo connection approval that expires must be started again. Do not reuse its session ID or URL.
* A `/v1/*` call that fails after onboarding advertises its capability is a test failure, not a valid skip. Record the printed problem code and `request_id` when present.
* An uncertain financial submission, `indeterminate` operation, or interrupted poll must stay in the journal. Run `pnpm test:live -- --reconcile`; do not resubmit it or change its idempotency key.
* An unknown webhook create outcome may leave a subscription active. Use the reported candidate IDs for manual investigation; do not delete an ID until ownership is verified.

If the inline recovery steps do not resolve the failure, send the command mode, API origin, account email, timestamp, problem code, and `request_id` when present to [support@perflo.ai](mailto:support@perflo.ai). For a financial request, include the journal entry ID and idempotency key, but not the request body, access token, confirmation intent, webhook signing secret, or hosted action URL.

## Where to go next

* [Authorize a customer device](/developers/get-started/authorize-device) explains device polling, token storage, and refresh.
* [Connect a Perflo login](/developers/get-started/connect-perflo) covers connection recovery and capability discovery.
* [Operations and errors](/developers/concepts/operations-errors) defines safe mutation reconciliation.
* Use the [beneficiary and transfer](/developers/guides/beneficiaries-transfers), [cards](/developers/guides/cards), [agent mandates](/developers/guides/agent-mandates), [service purchases](/developers/guides/service-purchases), and [spending](/developers/guides/spending) guides to verify final state and clean up resources deliberately.

<Note>
  The `--mutations` lane spends real money on a real customer account. A mandate created there is live agent authority that outlives the run: the exercise issues no connect code and revokes no mandate, so the authority stands until it expires or the customer revokes it, and any agent later paired to it can spend inside those caps.

  An agent never receives a key. The customer's Perflo token stays in your backend; the agent holds only a `pfa_` pairing token bound to one mandate, and its scopes come from the mandate kind rather than from anything the agent asserts. An agent cannot raise a cap or extend its own permissions: every bound is rechecked immediately before paying, so a request over a cap is refused rather than queued. Revoking a pairing always works and needs no Perflo connection — `DELETE /v1/mandates/{mandate_id}/pairings/{pairing_id}` invalidates the token immediately and cancels that pairing's unsent executions — but it does not undo a payment already submitted or left indeterminate. Revoking the mandate itself is the one revocation that can need the connected account's credential, because `POST /v1/mandates/{mandate_id}/revoke` needs a live connection for a beneficiary-payment mandate, so revoke the mandate before disconnecting.

  Size every live mandate at the amount you would accept losing for the length of its expiry, and clean up through [agent mandates](/developers/guides/agent-mandates) once you have verified the final state.
</Note>
