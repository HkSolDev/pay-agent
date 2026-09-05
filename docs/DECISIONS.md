# Decisions

One paragraph per decision, why it was made, as the PRD (Section 16.1) asked for.

## Payment execution: pluggable interface, RazorpayX live today, Perflo behind it

Perflo KYC didn't clear despite following up over several days, and there was no
point stalling the whole build on that. `worker/src/payment-executor.ts` defines
one interface; `payment-executor-perflo.ts` and `payment-executor-razorpay.ts`
are two implementations of it. `payment-executor-select.ts` picks RazorpayX only
when its three env vars are set — unset, Perflo is the default. Everything
upstream (classify, extract, resolve, verify, decide) never sees which one is
running. As of 4 Sep, Perflo is connected (see below) and is now the live path.

## Perflo connected under a teammate's account, not personal KYC

Personal KYC is still pending. A teammate (Abhinav) gave explicit permission and
the OTP to connect his own Perflo account so the CLI integration could be tested
for real rather than staying an untested guess. This is a stopgap, not the
intended end state — the PRD requires the app to read back the connected
account's email and refuse to run if it isn't the owner. Real auto-pay against a
teammate's money should not run unattended; only manual, confirmed test payments
were run this way.

## First fully successful Perflo payment — and a real ~₹100 flat fee discovered

4 Sep 2026: after the two fake/underfunded test failures below, ran a real
`beneficiary pay` of ₹200 to a real bank account (own account, real IFSC +
account number). This one succeeded end to end: `beneficiary pay` returned
`confirmed:true`, `tx status` showed `"status":"success"`, and the Perflo
dashboard's own transfer receipt confirms it landed — **but only ₹99.20 of
the ₹200 sent actually reached the bank account.** The dashboard shows the
breakdown directly: ~2.117 USDC (≈₹200.06) debited, "Bank receives: 99.20
INR". A separate quote for a ₹101 transfer in the dashboard UI showed the
same pattern explicitly: "Fee: -100 INR".

This means the payout rail on this account has a flat fee of roughly ₹100
per transfer, regardless of amount sent. Consequences for this project:

- The PRD's own suggested test amount, ₹20 (Section 14: "treat ₹20 as the
  standard test amount"), is not usable on this account/rail — the fee alone
  is 5x the transfer amount, so nothing meaningful would arrive.
- Both earlier ₹1 test payments (below) likely failed for exactly this
  reason: the fee exceeded the amount being sent, so there was nothing left
  to actually pay out.
- Real invoices this agent would auto-pay need to be well above ₹100 to be
  worth paying through this rail at all — a genuine constraint on what
  "auto-pay a small monthly bill" can mean in practice here.
- Not yet confirmed whether this fee is fixed to this sandbox/teammate
  account or is Perflo's standard production fee — worth asking directly
  rather than assuming either way.

Cross-checked against Perflo's own docs (`concepts__fees-and-limits.md`,
mirrored locally): payout fees are a documented, expected category —
"Cards and payouts: any card processing or payout cost, itemized before you
confirm | Card and banking partners" — set by Perflo's banking partner, not
Perflo itself, and always shown before confirming (matches what the app's
own quote screen showed). So this isn't a bug or a surprise fee; it's
real, expected behavior. What's not published anywhere is the actual ₹100
figure — no fee schedule exists with real numbers, only "shown live at
confirmation time." Discoverable only by actually trying a transfer.

## Fee-safety floor added to auto-pay: AUTO_PAY_MIN_AMOUNT_INR

Direct consequence of the ~₹100 flat-fee discovery above: nothing in the
policy engine stopped `auto_pay` from firing on a small invoice that would
mostly (or entirely) go to the fee, with no owner in the loop to notice
before it happened — auto-pay's whole point is that no one reviews it first.

Added `amountAboveMinimum` (`worker/src/auto-pay-eligibility.ts`) as a new
guardrail in `decidePolicy` (`worker/src/policy-engine.ts`), wired into both
the normal ingest path (`level1-pipeline.ts`) and the policy-only
re-evaluation path (`reevaluate-policy.ts`) — the same two call sites as the
existing `amountWithinOwnerCeiling`. Configured via
`AUTO_PAY_MIN_AMOUNT_INR`, defaulting to **₹200** when unset.

This is the mirror image of `AUTO_PAY_MAX_AMOUNT_INR`'s ceiling, but
deliberately shaped differently in one respect: the ceiling defaults to "no
extra restriction" when unset (an opt-in tightening), while this floor
defaults to a real, non-zero value (₹200) when unset. Fee-safety is meant to
be on by default, not something a deployment has to remember to configure.

**Why ₹200, not ₹100 or ₹150:** the live-reproduced case that motivated this
guard — a ₹200 payment that only delivered ₹99.20 net — is itself the
boundary case the default is set to block, not merely amounts far below it.
`amountAboveMinimum` requires the amount to be *strictly greater than* the
floor (`amountInr > floor`), so a ₹200 invoice is blocked under the default,
not allowed through at the edge. Below this floor, more than half the
payment would go to the fee — not a reasonable trade to make automatically.
An invalid or non-numeric `AUTO_PAY_MIN_AMOUNT_INR` falls back to the ₹200
default rather than disabling the guard, matching the "fee-safety is a
default" intent above.

Manual "Confirm & pay" is not affected by this at all, same as the existing
owner ceiling — an owner can still choose to pay a small amount by hand and
accept the fee; this guard only stops it from happening *automatically* and
unreviewed.

Test-first: `worker/src/auto-pay-eligibility.test.ts` (the pure threshold
function, including the exact ₹200 boundary case and an env override) and
`worker/src/policy-engine.test.ts` (a ₹50 invoice must resolve to
`needs_approval`, not `auto_pay`).

## First real Perflo payment call: response shape was also a guess, and was wrong

4 Sep 2026: ran a real `beneficiary pay` against a deliberately-fake test
account (placeholder IFSC/account number, so nothing would actually reach a
real person). Real response: `{"ok":true,"status":"timeout","moved":true,
"confirmed":false,"paymentId":"...","txHash":"0x..."}` — fields are top-level,
not nested under `data` as `perflo-cli.ts` guessed from the CLI's help text.
`tx status` on that hash afterward showed `"status":"failed"` — the fake
account was correctly rejected, no money reached anywhere. Fixed
`classifyPerfloStdout` to read top-level fields and to treat `confirmed:false`
as `PerfloUnknownOutcomeError` even when a `txHash` is present — a reference
existing doesn't mean the payment landed, only `tx status`/`activity` can
confirm that, which is exactly what the reconciler is for. Both affected unit
tests (`perflo-cli.test.ts`) updated to the real shape.

## The Perflo CLI had renamed its commands since the PRD was written

The PRD (26 Aug) documents `perflo recipient add` / `perflo grant enable` /
`perflo recipient pay`. The installed CLI (`@perflo/cli@6.1.0`) uses
`beneficiary` and `policy` instead — confirmed directly against `--help` output
once a real account was connected on 4 Sep. `worker/src/perflo-cli.ts` was
calling the old, now-nonexistent command and had never been run against a live
account before, so this was never caught earlier. Fixed to call
`beneficiary pay`.

## Perflo's India beneficiary schema has no UPI-by-VPA option

`perflo beneficiary schemas --country IN` returns only `bank.in.inr` (IFSC +
account number) — no UPI schema exists in the connected account. The PRD's test
plan assumes paying a VPA directly (e.g. `riya@okaxis`). This is an open
question for Perflo, not something fixable from this side; documented here so
it isn't mistaken for a bug in this codebase. `payee-approval-deps.ts` still
stores payment methods generically (UPI or NEFT) at the database layer, so once
Perflo exposes a UPI rail (or the answer is "pay through NEFT with resolved bank
details instead"), no schema change is needed here.

## LLM is boxed into classify/extract only, everything else is code

Per the PRD's own architecture: the classifier and extractor take no tools and
return structured JSON only; the verifier's checks (auth alignment, lookalike
domains, injection scanning, changed-details detection) are deterministic code,
not an LLM judgment call; the policy engine and payment executor are plain code
paths an LLM can never reach. This is the actual safety property of the system,
not a nice-to-have — it means a prompt injection anywhere in an email, PDF, or
page can, at worst, cause a misclassification, never a payment.

## Exact-match payee resolution is the single hard gate, not a score

`payee-resolver.ts` treats sender identity + payment-method hash as the only
path to auto-pay eligibility (mirrors FR-16). A new sender, a new payment
method, or any mismatch between the two routes to `needs_approval` regardless of
how convincing everything else looks. This was kept as a hard boolean rather
than folding it into the verifier's soft score, because a scored system can be
tuned into paying a changed-bank-details attack if the weights drift — the PRD
calls this out as the single control that kills most business email compromise
on its own, and it shouldn't be adjustable by a threshold.

## Auto-pay is gated by two independent switches plus every other guardrail

`AUTO_PAY_MODE` (deployment-wide) and a per-payee opt-in toggle both have to be
on, on top of the policy engine's own `auto_pay` decision, before a payment
executes. Two switches instead of one so a single flipped env var can't turn on
unattended spending for every payee at once — a payee has to be individually
opted in even after the feature itself is enabled.

## Idempotency and locking live at three separate layers

A unique `idempotencyKey` on `payment_intent`, a row-level claim
(`claimPaymentIntent`, `SELECT ... FOR UPDATE`-style) so only one worker can
move an intent from `pending` to `claimed`, and a per-payee lock so two intents
for the same payee never execute concurrently. These are three different
failure modes (duplicate intent creation, two workers racing the same intent,
two intents for one payee racing each other) and each needed its own control —
collapsing them into one check was tried informally during design and found to
miss the "same payee, two different invoices" case.

## DEMO_MODE exists to test the pipeline without needing arbitrary real senders

`DEMO_MODE=true` relaxes payee resolution to allow any sender (see
`level1-pipeline.ts`), used only for seeding realistic-looking test scenarios
through `demo:inbox`/`demo:payees`. It never touches the payment step itself —
`demo:payees` explicitly never calls Perflo, its recipient/grant IDs are local
placeholders. This was necessary because testing "does the verifier catch a
lookalike domain" realistically needs a range of sender addresses that a single
real test inbox can't produce on its own.

## Payee approval, split in two: beneficiary registration is real, the guardrail step is still stubbed

`payee-approval-deps.ts` originally faked both `createPerfloRecipient` and
`enablePerfloGrant` (local nickname, local grant ID, no CLI call) so the
Payees UI could be built and demoed before Perflo was connected.

**As of commit `312effa`, only half of that is still true.**
`createPerfloRecipient` now really calls `perflo beneficiary add` and
registers a real Perflo beneficiary — clicking "Approve payee" today
genuinely creates a real payee on Perflo's side.

`enablePerfloGrant` is **still exactly the old stub** — it returns a fake
local grant ID and never calls `policy enable`. No real spending guardrail
gets set up, and no approval link is shown anywhere in the app yet. This
matters because `policy enable` can't complete inside the same synchronous
request `createPerfloRecipient` runs in — it blocks on a real browser/device
approval that can take an unknown amount of time — so it has to become its
own separate step (the two-phase `pending_grant` approach), not just a
second function call bolted onto the same action. That's the next slice.

**Don't read "beneficiary registration is real" as "the whole approval flow
is real"** — this exact conflation has already caused confusion once (an
answer describing the *intended* two-step UX got read as describing current
behavior). Only step one exists in code right now.

## No login/auth built yet

The PRD's approval flow (Section 10.2) is a signed, single-use email link →
login → approval page. This build is queue-only with no auth and no outbound
approval emails — deprioritized in favor of getting the pipeline (classify →
extract → resolve → verify → decide → pay) solid first, since that's what
Section 16.3 says is evaluated first. Known gap, not an oversight.

## No x402 verification — blocked by the same Perflo access issue, not skipped separately

Section 8.3's checks (`verify_email`, `browse_web`, `search_web`, `make_call`)
are Perflo's own marketplace/MCP tools, not a separate provider. They were
unreachable for the same reason payments were: no connected, KYC'd account.
Only the free/deterministic checks in Section 8.2 exist. This is one root cause
with two consequences, not two independent gaps, and is worth testing now that
an account is connected.

## `enablePerfloGrant` is real now: the one-pending-grant-at-a-time lock lives in the database, not in application code

The previous entry above ("Payee approval, split in two") documented
`enablePerfloGrant` as still a stub. It is no longer a stub — see
`docs/PLAN_GUARDRAIL_APPROVAL.md` for the full design; this entry records
the specific decisions made while implementing it (session of 4 Sep 2026,
branch `feat/perflo-beneficiary-approval`, uncommitted as of this entry —
see hands-off.md for exact file list and why nothing is committed yet).

Perflo's own rule, quoted directly from its docs (`developers__guides__
agent-mandates.md` and `developers__guides__beneficiaries-transfers.md`,
mirrored locally under `docs/perflo_docs/`): *"Only one live approval can
exist for a customer at a time."* Our app has to enforce the same rule on
its own side too, because `policy enable` blocks for real minutes waiting
on a human, and a second concurrent request from this app would either
collide with Perflo's own rejection (surfaced as a raw, confusing error)
or — worse — race against it.

**Why a database constraint, not an application-level check-then-write:**
a plain "query for any pending_grant row, then if none exists, write one"
is a textbook TOCTOU (time-of-check-to-time-of-use) race — two concurrent
"Approve" clicks on two *different* payees can both pass the check before
either commits its write. The fix is a Postgres **partial unique index**:

```sql
CREATE UNIQUE INDEX "payees_one_pending_grant_key" ON "payees" ("status") WHERE "status" = 'pending_grant';
```

Because every row inside that filtered index carries the identical value
(`'pending_grant'`), Postgres itself refuses a second row from ever
entering that state — enforced as part of the `UPDATE`/`INSERT` statement,
not as a separate step a caller could race. This is not expressible in
`schema.prisma`'s own DSL (no partial/filtered unique index support as of
Prisma 7.10), so it lives only in the migration SQL
(`20260904142701_payee_pending_grant_approval`) with a comment there
warning against removing it on a future schema-drift reconciliation.

**Confirmed live, not assumed:** writing through Prisma Client (never
`$queryRaw`/`$executeRaw`) surfaces the violation as
`PrismaClientKnownRequestError` with `code === "P2002"` — verified by an
actual concurrent-write test (`worker/src/payee-approval-deps.integration.
test.ts`, "only one of two concurrent approvals for different payees wins
the lock", using real `Promise.all` against real Postgres, not mocks) and
by a second test proving the raw `payees_one_pending_grant_key` constraint
name surfaces in the error even from a plain two-sequential-inserts case
(`reconcile-grant-approvals.test.ts`).

**Retry after denial/expiry reuses the same payee row, doesn't create a
second one.** `Payee.status` gained two new values: `pending_grant`
(waiting) and `not_approved` (a prior attempt was denied or expired — see
below). A `not_approved` payee is exactly what `lastGrantOutcome`'s "cleared
once a new attempt starts" comment describes as retryable: `startPendingGrant`
(`payee-approval-deps.ts`) looks up any existing `PayeeIdentity` for the
sender first, and if that payee's status is `not_approved`, transitions the
*same* row back to `pending_grant` (a conditional `updateMany`, itself
still protected by the same partial unique index) instead of trying to
`create` a second payee — which would otherwise collide with the sender's
own separate unique constraint (`payee_identities.sender_addr`) and surface
a confusing raw error. Any other pre-existing status (already
`pending_grant`, `approved`, `revoked`) is treated as locked rather than
silently reused.

## Expiry is a safety net, not an event — two clocks, not one

There is no webhook or callback telling us when a `pending_grant` row
should stop blocking. Something has to check, so `pendingGrantExpiresAt`
(set once, at the moment the CLI call starts) is checked in two places,
sharing one implementation (`worker/src/reconcile-grant-approvals.ts`'s
`expireStalePendingGrants`) so the two can never disagree about what counts
as stale:

1. **Inline**, at the top of `startPendingGrant`, every time anyone tries
   to claim the lock — so a stale lock never blocks a legitimate new
   attempt just because nobody happened to trigger the periodic sweep yet.
2. **Periodically**, once per the worker's normal poll cycle
   (`worker/src/index.ts`, alongside the existing `reconcileStuckPayments`
   call) — so a `pending_grant` row doesn't sit forever if nobody clicks
   Approve on anything else.
3. **Once at worker startup**, explicitly, before Gmail sync or anything
   else runs — this is the crash-recovery case (plan §4): if the worker
   process restarted while a `policy enable` child process was running
   detached, the in-memory handle to that child is gone, and there is no
   operation id to re-attach to or ask Perflo "is this still open." A row
   already past its expiry is resolved immediately; a row not yet expired
   is simply left for the next sweep (there is genuinely nothing else to
   do — we cannot re-attach to a lost child process).

**Do not conflate this with `Payee.grantExpiresAt`** — that field (already
existed before this session) is the *authority* expiry: how long an
already-active grant stays usable once approved, driven by the owner's own
`--expires-days` choice. `pendingGrantExpiresAt` is the *approval* expiry:
how long the unclicked browser link itself stays worth waiting on. These
are deliberately two different clocks on two different fields.

**The real number, measured live, not guessed:** ran `policy enable
testpayee --per-payment "1 INR" --total-cap "5 INR" --count 1
--expires-days 1 --json` on 4 Sep 2026, deliberately never clicked the
approval link, and let it run. The CLI itself gave up after **615.88
seconds** (~10 minutes 16 seconds) and exited with a clean, definite
`{"ok":false,"error":{...,"message":"policy allowing payments to testpayee
timed out. Try again.","recoverable":false}}` — not a hang, not a killed
process, a real answer. `GRANT_APPROVAL_TIMEOUT_MS` (`worker/src/perflo-
cli.ts`) is set to 660,000ms (11 minutes) — a clean number with margin
above the measured 615.88s — and reused as both the manual `spawn` kill
timer (a backstop for a process that somehow hangs *longer* than its own
documented internal timeout) and the app-side `pendingGrantExpiresAt`
ceiling, so the UI's "waiting" window and the CLI's own real timeout line
up rather than being two independently-guessed numbers.

**A real, live-observed correction to the plan's own hypothesis:** the plan
guessed `policy enable --json` might print Perflo's `CliSignStart` API
shape (`{sid, approveUrl, pollInterval, expiresIn}` — a real schema, but
for a *different* Perflo API surface, `/cli/sign/start`). The real,
observed first line is simpler: `{"ok":true,"status":"awaiting_browser",
"approveUrl":"https://app.perflo.ai/approve?sid=..."}` — no separate
`sid`/`pollInterval`/`expiresIn` fields; the `sid` is present but only
embedded in the URL's own query string. `worker/src/perflo-cli.ts`'s
`extractApproveUrl` parses exactly this real shape, with a plain
`https?:\/\/\S+` regex fallback kept only as a defensive measure, never the
primary path.

## `policy enable`'s CLI call runs detached from the HTTP request — what "detached" actually means here

The plan calls for `policy enable` to run "detached from the request (a
worker-side job, not inline in the server action)," since it blocks for up
to ~11 minutes and a Next.js server action cannot hold an HTTP response
open that long. The concrete implementation: `ApprovePayeeDeps.
enablePerfloGrant` returns `void`, not a `Promise` `approvePayee` awaits —
it fires `enableGrantViaPerfloCli(...)` and immediately returns, letting
the promise chain (`.then(...).catch(...)`) keep running fire-and-forget
inside whichever long-running Node process happened to call it (today:
the Next.js app process itself, since `payee-approval-deps.ts` is imported
directly by `app/app/payee-actions.ts`, same as `createPerfloRecipient`
already was).

**This is a deliberate simplification, not the only possible reading of
"detached."** It does *not* spin up a separate OS process or hand the job
to the dedicated `worker/src/index.ts` daemon — there is no IPC mechanism
between the app and worker processes in this codebase (they only ever
communicate through the shared Postgres database), and `perflo-cli.ts` has
none of the Composio/Turbopack-bundling problems that forced `sync-once-
cli.ts` to be a genuinely separate subprocess (see hands-off.md's
"Turbopack import-extension gotcha" section) — so there was no forcing
reason to introduce that complexity here. The requirement this satisfies
is narrower and concrete: the HTTP response to "Approve payee" returns
immediately, never blocking on the CLI call. Whichever process (app or
worker) happens to still be running when the CLI eventually exits is what
writes the final outcome — which is exactly why the crash-recovery sweep
above treats "the process died mid-approval" generically, regardless of
which of the two processes that was.

**Consequence worth knowing:** since the Next.js dev server restarts far
more often than the dedicated worker process (every file save, per hands-
off.md's own repeated notes), a `pending_grant` row started via the app in
dev is more likely to hit the crash-recovery path than one started via a
long-lived production deployment would be. Not a bug — just something to
expect when testing this locally.

## Webhooks: still deliberately deferred, reconfirmed with this slice

The plan's own explicit non-goal, reconfirmed while implementing: Perflo
supports webhooks for operation-state transitions, but they need a public
HTTPS callback URL, and this app is intentionally local-only right now
(unchanged from the "No webhooks" non-goal documented earlier in this
project's `hands-off.md`). Polling (the expiry sweep above) is the
mechanism here, the same shape `payment-reconcile.ts` already established
for stuck payments — deliberately not something to build ahead of an
actual public deployment.

## A real test-isolation hazard the lock itself surfaced

Writing tests against `payees_one_pending_grant_key` uncovered a real,
reproducible problem, not just a theoretical one: since the lock is a
genuinely global, table-wide invariant and this project's test suite runs
against one shared, real local Postgres database (not a per-test
transaction or fixture reset), any test that leaves a payee row in
`pending_grant` state past its own file's cleanup — even briefly — can
block a *different* test file's attempt to claim the same lock, causing
failures that look like a real bug but are actually test-fixture leakage.

Concretely hit this twice this session: a mocked `enableGrantViaPerfloCli`
promise deliberately left unresolved to prove "the lock holds" would sit
in `pending_grant` until that file's own `afterAll`, which is not
guaranteed to run before another file's tests start. Fixed by having every
test file that exercises this lock (`payee-approval-deps.integration.
test.ts`, `payee-approval-deps.enable-grant.test.ts`, `reconcile-grant-
approvals.test.ts`, `app/app/payee-actions.test.ts`) force-clear any stray
`pending_grant` row in its own `beforeEach`, not just rows matching its own
id/sender prefix — and release any row a specific test intentionally holds
before that test itself ends, rather than deferring to file teardown. This
is the same general class of shared-dev-DB flakiness already documented
elsewhere in `hands-off.md` (the pre-existing `riya@okaxis` VPA fixture
collision under default test parallelism) — not a new category of problem,
but a new instance of it worth naming here since the fix pattern
(force-clear a *global* invariant, not just your own prefix) is reusable
for any future table-wide constraint this project adds.

**Also worth knowing for whoever runs this suite next:** `pnpm test --
--no-file-parallelism` (double `--`) does **not** actually pass
`--no-file-parallelism` to vitest — pnpm's `--` plus the script's own lack
of a trailing `--` means the flag lands as a vitest *positional* argument
(a file-path filter), silently ignored, and the suite runs with default
parallelism regardless. The correct invocation is `npx vitest run
--no-file-parallelism` (or `pnpm exec vitest run --no-file-parallelism`)
run directly, bypassing the `pnpm test` script wrapper for this one flag.

## Real Gmail inbox connected via Composio and live end-to-end ingestion verified

5 Sep 2026: Verified that the Gmail ingestion pipeline is fully operational against a live inbox.
Rather than an in-house IMAP or custom OAuth client, Gmail ingestion connects through Composio
(`@composio/core`) under the persistent entity `perflo-ap-owner` (`worker/src/gmail.ts`). Verified that
an active connection (`hemantkumar4213@gmail.com`, account `ca_WrLRGxq2ls5f`) was already authenticated
and healthy. Dispatched a real test invoice email (`Invoice TEST-01` with INR 500, bank account number,
and IFSC) directly via Composio's `GMAIL_SEND_EMAIL` tool, and triggered the worker's ingest pass
(`worker/src/sync-once-cli.ts`). Confirmed end to end: the message was retrieved from Gmail, parsed,
classified as an invoice (confidence 0.95), payment details extracted (bank_neft, 500.00 INR), policy
evaluated (`needs_approval`), and persisted to Postgres (`cmtnwqxgw0000c5aqgpvg73i2`). This proves the
pipeline functions on real email traffic without mocks or local seed scripts, closing an open item from
the 4 Sep handoff.

## `tests/injections/` red-team fixture suite added (PRD Section 8.7 rule 7 / Appendix C) — T-17 gap found, not fixed

5 Sep 2026: PRD Section 8.7 rule 7 requires "a red-team folder: `tests/injections/*.eml`, run it in CI"
covering the phishing scenarios in Section 15's table (T-14 through T-17, plus variants). That folder
didn't exist. Added it: `tests/injections/load-eml.ts` parses a raw `.eml` string (headers, body, base64
attachments) into the same `RawGmailMessage` shape `worker/src/ingest.ts` consumes, so each fixture can be
run through the real, un-mocked pipeline entrypoint (`ingestGmailMessages`) — the same seam
`worker/src/ingest.test.ts` already uses — rather than through a hand-built classifier/extractor stub
that could hide a real integration gap. Classification and extraction use the real deterministic
backends (never the LLM ones, so the suite never spends API credit); the only stub is
`fetchAttachmentBytes`, standing in for Gmail's `attachments.get` and backed by the fixture's own
embedded attachment bytes.

Five fixtures were written: T-14 (body injection), T-15 (the same injection hidden in a PDF's text
layer instead of the visible body), T-16 (invoice link whose final redirect domain doesn't match the
sender), T-17 (message fails DMARC/auth alignment while also carrying bank details different from the
already-approved payee on file), and one `20_ignore_previous_variants.eml` covering a prompt-injection
phrasing variant of T-14/20 from the same table.

**T-14, T-15, T-16 pass. T-17 fails — this is a real pipeline gap, not a flaky or badly-written test.**
Root cause, traced in `worker/src/level1-pipeline.ts:105-112`: when payee resolution returns
`details_changed` (an already-approved sender emailing from the same address but with new bank/UPI
details) or `multiple_payment_methods`, the pipeline deliberately strips `payment_method_mismatch` out
of `verification.hardFails` before policy evaluation. That rule exists so an ordinary "vendor updated
their bank account" email doesn't get needlessly quarantined — it should fall through to
`needs_approval` so a human reviews the changed details. The strip is unconditional on `authPassed`,
though: it fires the same way whether or not the message's own DMARC/SPF alignment failed. T-17 is
exactly the case that rule doesn't distinguish — a message that both fails sender authentication *and*
carries changed bank details. The PRD's Section 15 table calls that combination a hard `quarantine`
(auth failure + detail change together indicate takeover, not a legitimate vendor update), but today it
resolves to `needs_approval` like any other detail change, because the `authPassed` state is never
checked before the strip runs.

**Left unfixed, flagged only** — the correct fix is almost certainly to gate the
`details_changed`/`multiple_payment_methods` strip on `verification.authPassed === true` (only forgive
the mismatch when auth itself is clean), but that's a policy-logic change to `level1-pipeline.ts` that
touches the hard-fail path for every message, not just this fixture, so it deserves its own review and
test pass rather than a same-session patch bundled with fixture-writing. Whoever picks this up next:
`worker/src/level1-pipeline.ts:110` is the exact line, `tests/injections/injections.test.ts`'s T-17 case
is the regression test that should go green once it's fixed, and the fix should keep T-16 (a clean-auth,
no-detail-change case) still passing to `needs_approval`/`resolved` as it does today.

## Explicit `Payee Name:` labels are source-grounded in the LLM extractor

5 Sep 2026: A live invoice containing `Payee Name: Test Vendor` persisted
`extractionSummary.payeeName` as `Name`. The cause was the deterministic
fallback computed by `llm-extractor.ts`: its broad `payee` label pattern
treated `Payee` as the complete label and captured the next token, `Name`.
The LLM wrapper returned that fallback unchanged whenever the model call
failed validation, timed out, or was unavailable; a model response with the
same label-token artifact was also accepted because payee names previously
had no source corroboration.

The wrapper now matches the complete, line-anchored `Payee Name:` label in
the untrusted source text and uses the text after the colon as deterministic
evidence, for both valid-model and fallback paths. It also tells the model
explicitly that label words are not field values. The correction is narrow:
it applies only to an explicit `Payee Name:` line, rejects email-like values,
and does not infer names from unlabeled text. Regression coverage uses the
exact `Payee Name: Test Vendor` shape and proves the previous `Name` result is
replaced by `Test Vendor`.

## Queue filter excludes rejected invoices from "Needs approval" tab

5 Sep 2026: An invoice whose owner explicitly rejected it (`reviewStatus: "rejected"`) remained visible in the "Needs approval" tab and continued incrementing its KPI count. The cause in `app/app/queue-view.tsx` was that `isNeedsApproval` only checked `policyDecision === "needs_approval"` and `hasPaymentAttempt()`, ignoring human review outcomes recorded on `email.reviewStatus`. Because `policyDecision` describes immutable intake-time evaluation while `reviewStatus` records subsequent human review decisions, an un-checked `reviewStatus === "rejected"` left the invoice indefinitely stuck in the "Needs approval" queue. Fixed by adding `item.email.reviewStatus !== "rejected"` to `isNeedsApproval` across all three call sites (summary counts, tab filtering, card rendering), and rendering an explicit `<span className="tag tag-neutral">rejected</span>` badge on the card when viewed in the "All activity" tab.

## `preparePayment` surfaces honest prerequisite error for unresolved payees

5 Sep 2026: Submitting the "Prepare payment" form on an invoice with an unapproved/unresolved payee (`new_payee`, `resolvedPayeeId === null`) crashed the Next.js page with an uncaught runtime error overlay: `"The email to pay no longer exists."`. The check at `app/app/actions.ts:28` was overloaded: it verified both that the `Email` record existed and that `resolvedPayeeId` was non-null, but used an inaccurate message that blamed a missing email record instead of communicating the prerequisite requirement to the user. Changed the error message to `"This invoice's payee hasn't been approved yet — approve the payee in /payees first."`, keeping the underlying safety check completely intact while giving the owner actionable, truthful feedback on why preparation is blocked.

## T-17 fixed: auth-failure hard fail no longer stripped when payee status is `details_changed`

5 Sep 2026. Follow-up to the "`tests/injections/` red-team fixture suite added" entry above, which found but deliberately left this gap unfixed. This entry documents only the fix — read that entry first for the full discovery narrative.

**What was verified against the PRD before touching any code** (via `/grill-with-docs`, not from memory or the earlier report):
- Section 15's phishing table, line 551: T-17's required outcome is literally "Auth failure flagged, `quarantined`."
- Section 8.1 row #3: "Compromised real mailbox sends 'new bank details'" (i.e. `details_changed` on its own, auth passing) → `needs_approval, flagged`. This is the case the existing code already handled correctly and that must keep working.
- Section 8.1 rows #4 and #11 independently confirm the same shape of rule elsewhere in the same table: a soft signal alone is soft, but "hard if combined with #3 [a details change]." Auth failure combined with a details change is that same pattern — neither condition is a hard fail alone in the general case, but the combination is.
- `worker/src/verifier.ts` was already computing `authPassed` (DMARC pass, or aligned SPF+DKIM pass) and already pushing `payment_method_mismatch` into `hardFails` whenever a known sender's extracted payment methods didn't match their approved ones — regardless of `authPassed`. The bug was never in the verifier; it was entirely in `level1-pipeline.ts` unconditionally discarding that hard fail afterward.

**The fix, and why it's this narrow and nothing more:** `worker/src/level1-pipeline.ts`'s strip condition
(previously `resolution.status === "details_changed" || resolution.status === "multiple_payment_methods"`,
unconditional) is now `resolution.status === "multiple_payment_methods" || (resolution.status === "details_changed" && verification.authPassed)`.
Two deliberate scope boundaries, both worth stating explicitly for anyone auditing this change:
1. **`multiple_payment_methods` is untouched** — still stripped unconditionally, auth-passed or not. The PRD gives no test case or table row asking for auth-failure-plus-multi-rail to quarantine, `level1-pipeline.test.ts`'s existing multi-rail test already runs with `auth: { dmarc: null, spf: null, dkim: null }` (i.e. auth failing) and expects `needs_approval`, and touching that behavior was not what this task asked for. Widening the fix to cover it would have been scope creep on a payment-safety-adjacent code path with no PRD backing and no failing test demanding it.
2. **No new hard-fail label was added.** The fix does not invent an `auth_failure_with_details_change` check — it simply stops discarding the `payment_method_mismatch` hard fail the verifier already produces, exactly as `tests/injections/injections.test.ts`'s T-17 assertion expects (`hardFails` still contains `"payment_method_mismatch"` for T-17, not a new string). Minimal diff, no new surface area.

**Verified test-first (`/test-driven-development`):** confirmed the T-17 test was red before touching
`level1-pipeline.ts` (`expected [] to include 'payment_method_mismatch'` — the fail was already being
stripped even with `authPassed: false`), applied the one-condition change above, then reran and confirmed
green. `npx vitest run tests/injections/ worker/src/level1-pipeline.test.ts --no-file-parallelism`: **3
test files, 11/11 tests passed** — all five fixtures (T-14, T-15, T-16, T-17, and the `20_ignore_previous`
variant) plus `load-eml.test.ts` and the existing `level1-pipeline.test.ts` (including the
`multiple_payment_methods` case, confirming it stayed at `needs_approval`).

**Also ran the full `worker/src` suite** (`npx vitest run worker/src --no-file-parallelism`) to check for
unrelated regressions: 295/299 pass; 4 failures, all pre-existing and unrelated to this change —
`payee-store.integration.test.ts` and `demo-scenarios.integration.test.ts` fail on
`decryptPaymentMethod`/`payee-crypto.ts` with `"Unsupported state or unable to authenticate data"` (an
AES-GCM auth-tag mismatch), nowhere near `level1-pipeline.ts` in the stack trace, and inside
`payee-approval-deps.ts`'s territory, which another session was actively editing concurrently and which
this task was explicitly told not to touch. `git diff --stat` on the five off-limits files
(`worker/src/payee-approval-deps.ts`, `worker/src/payee-approval-deps.enable-grant.test.ts`,
`app/app/payee-actions.test.ts`, `app/app/queue-view.tsx`, `app/app/actions.ts`) confirms zero lines from
this task — this session's own diff touches exactly one file, `worker/src/level1-pipeline.ts` (17 lines).

## Document the grant handoff as an owner action, not a payment or payee action

5 Sep 2026: The Abhinav approval runbook follows the code's actual two-phase boundary: adding the payee creates the Perflo beneficiary and a local `pending_grant` row, then a detached `perflo policy enable` process emits a per-run browser URL and waits. The person opening that URL must be the connected Perflo account holder (or someone authorized to approve for that account); Abhinav should not open it merely because he is the payee. The runbook separates a clean Perflo refusal from an ambiguous process timeout because the database states differ: a clean `ok:false` becomes `not_approved`/`denied`, whereas a killed or unparseable process remains `pending_grant` until the expiry sweep changes it to `not_approved`/`expired`. None of these steps sends a payment, and approval does not turn on the separate per-payee auto-pay toggle.

Repository visibility was checked read-only before proposing commands. `HkSolDev/pay-agent` is currently public. The proposed sequence is an explicit `gh repo edit ... --visibility private --accept-visibility-change-consequences`, followed by the GitHub collaborators REST endpoint with `permission=push`. These commands require repository administration permission and are intentionally documented but not executed because visibility changes can detach public forks, affect stars/watchers and rulesets, and expose prior Actions logs according to the installed `gh` warning; collaborator access is also an owner-controlled decision.

## End-to-end browser regression verification of UI filter, honest error messaging, and LLM payee name extraction

5 Sep 2026: Conducted a live browser regression pass on `http://localhost:3000` verifying three recent fixes across commits `40eccc4`, `63b6a90`, and `a63d1d8`:
1. **Queue filter on rejected reviewStatus (`40eccc4`)**: Verified that rejecting an invoice removes it from the "Needs approval" tab and updates the KPI counter. "Invoice TEST-01" (with `reviewStatus: "rejected"`) does not appear in "Needs approval" (counter verified at 17, down from 18, and later 16 before TEST-02 arrived). Switching to "All activity" tab confirmed "Invoice TEST-01" renders with the neutral `rejected` badge.
2. **Honest `preparePayment` prerequisite error (`63b6a90`)**: Verified that attempting to prepare a payment on an invoice with an unresolved/unapproved payee (`resolvedPayeeId: null`) renders the honest error message: `"This invoice's payee hasn't been approved yet — approve the payee in /payees first."`, replacing the former misleading error claiming the email record did not exist.
3. **LLM extractor source-anchoring on `Payee Name:` (`a63d1d8`)**: Dispatched a fresh test invoice ("Invoice TEST-02", Gmail message ID `1a07024a8cbfdb18`) containing `"Payee Name: Apex Logistics"`. Synchronized via `worker/src/sync-once-cli.ts` (inserted row `cmtnz14nr0000x2aqo81qx6ht`). Confirmed both in Postgres (`extractionSummary.payeeName: "Apex Logistics"`, confidence 1.0) and in the live browser review queue that the card displays `₹650.00 → Apex Logistics [BANK_NEFT]` and the review drawer displays `Apex Logistics` (Confidence 100%), with zero occurrence of the previous `"Name"` label artifact.

All checks passed with verifiable evidence and real browser screenshots. No source code was modified.

## Test-suite non-determinism: two real bugs found, one confirmed to be the wrong shape

5 Sep 2026. Task: fix `pnpm test` non-determinism (9 vs 10 failures between runs, `pending_grant`/`grant_in_progress` assertions flipping). Two bugs were handed in as already-diagnosed; both were independently re-verified against real command output before any fix, per `/grill-with-docs`-style rigor, and one turned out to have a different actual mechanism than described.

**Bug #1 (env-var leak) — confirmed exactly as described, fixed mechanically.** `worker/src/payee-store.integration.test.ts`, `worker/src/demo-scenarios.integration.test.ts`, `worker/src/payee-rail-lifecycle.integration.test.ts`, and `worker/src/payee-approval-deps.integration.test.ts` each set `process.env.PAYEE_ENCRYPTION_KEY`/`PAYEE_HASH_KEY` to a fake test key in `beforeEach` and never restored it — only `worker/src/payee-crypto.test.ts` already did this correctly. Since vitest reuses worker processes across files, whichever of these ran last in a shared worker left the fake key active for the next file's real-data assertions. Fixed by mirroring `payee-crypto.test.ts`'s exact pattern in all four files: capture `savedEncryptionKey`/`savedHashKey` at module load (before any test mutates them), restore both in `afterAll`.

**Bug #2 (grant-approval lock race) — the description put the bug in the wrong place.** The task described this as "a remaining lock-acquisition race" inside `payee-approval-deps.ts`. Direct inspection of `startPendingGrant` (`worker/src/payee-approval-deps.ts:138-236`) showed its locking is already correct: the existing-payee retry path does a conditional `updateMany({ where: { id, status: "not_approved" } })` (a real compare-and-swap at the row level), the new-payee path relies on the real, table-wide partial unique index (`payees_one_pending_grant_key`, `packages/db/prisma/schema.prisma:163-165`, added by migration `20260904142701`), and both paths correctly map a `P2002` violation to `{ status: "locked" }` via `isPendingGrantLockViolation`. Five isolated reruns of `payee-approval-deps.integration.test.ts`'s own concurrent-lock tests passed 5/5 — the race was never reproducible within one file.

The real mechanism: `pnpm test` (`vitest run`, no config existed before this) uses vitest's default file-level parallelism, so `worker/src/payee-approval-deps.integration.test.ts`, `worker/src/payee-approval-deps.enable-grant.test.ts`, `worker/src/reconcile-grant-approvals.test.ts`, and `app/app/payee-actions.test.ts` — the four files that each create or mutate a `status: "pending_grant"` row — run **concurrently in separate workers against the same real Postgres database and the same real global constraint.** Each file's own `beforeEach`/`clearAnyStrayLock()` only clears a row left by an earlier run of *itself*; none of them can see or wait on another file running its own pending_grant tests at the exact same moment in a different worker. When two files' legitimate lock-contention assertions (each expecting exactly one `pending_grant` winner and one `grant_in_progress`/`locked` loser) happened to overlap in real time, a third file's unrelated row would occupy the single global slot, and one or both files would see the wrong split — which run got unlucky is a scheduling accident, hence the flip between 9 and 10 failures rather than a stable count.

**Fix: `vitest.config.ts` (new file), not an application-code change.** Added a `test.projects` split: a `default` project excluding the four affected files (unchanged parallelism, ~330 tests), and a `shared-pending-grant-lock` project containing only those four with `fileParallelism: false`, so they run sequentially against each other while the rest of the suite stays fast. No change was needed to `payee-approval-deps.ts`, `payee-approval-deps.enable-grant.test.ts`, `reconcile-grant-approvals.test.ts`, or `app/app/payee-actions.test.ts` for this bug — confirmed via `git diff --stat`, which shows zero lines touched in any of them for bug #2. This required going outside the originally-approved file list; confirmed with the user before creating the file (two `AskUserQuestion` rounds — the first also surfaced and got a decision on the unrelated payee-store finding below).

**A third, separate, deterministic (non-flaky) bug was found and left unfixed, by agreement.** `worker/src/payee-store.integration.test.ts` and `worker/src/demo-scenarios.integration.test.ts` fail on every single run, isolated or not, independent of both bugs above. Cause: `loadApprovedPayees()` (`worker/src/payee-store.ts:22-53`, not in this task's editable file list) scans **every** `grantApproved: true` payee table-wide, not scoped to a test's own fixture IDs. A real payee row, "Test Auto-Pay Vendor" (`autopaytest@okaxis`, id `cmtgw2cc70000yqaqw3rl5vmp`), created 31 Aug by `worker/src/manual-edge-case-run.ts` for ongoing manual live-verification against the real Perflo account (see the ₹100-fee/`AUTO_PAY_MIN_AMOUNT_INR` entries above) and encrypted under the real `.env` `PAYEE_ENCRYPTION_KEY`, sits permanently in the shared dev Postgres table. Confirmed directly: decrypting it with the real key succeeds; decrypting it under either integration test file's temporary fake key throws the exact `Unsupported state or unable to authenticate data` error both files exhibit. This is not test debris — it's real, deliberately-kept data for a different, ongoing verification workflow, so it was not deleted. Fixing it properly needs a scoping change to `loadApprovedPayees()` in `worker/src/payee-store.ts`, which is out of this task's file list; the user chose (via `AskUserQuestion`) to leave these two tests red and documented rather than widen scope further in this pass.

**Verified: 3 consecutive `pnpm test` runs, byte-identical failure sets** — `4 failed | 332 passed (336)` every time, always the same two files/four tests (the pre-existing, agreed-to-leave payee-store/demo-scenarios issue). Before either fix: 11 then 10 then 14 failures across three baseline runs, non-deterministic. That is genuine determinism for everything this task was scoped to fix.

## 5 Sep 2026 — read-only payment execution security review

Findings, ranked by severity (no execution source was changed):

1. **Critical — a confirmed provider payment can be recorded as retryable and paid twice when the success-state database write fails.** `worker/src/payment-execution.ts:40-45` performs the external payment before persisting `paid`; the same broad `catch` then classifies every non-`PaymentUnknownOutcomeError` exception as `failed` at `worker/src/payment-execution.ts:45-58`. A transient Prisma failure on the `paid` update therefore enters the failure handler; if its guarded update succeeds, the UI exposes Retry for money that already moved. This is especially dangerous on Perflo because `worker/src/perflo-cli.ts:153-163` confirms the local idempotency key is not sent to the provider. Unexpected post-submit exceptions must never default to a definite/retryable failure.
2. **High — Perflo unknown outcomes discard the provider reference and are deliberately skipped forever by reconciliation.** `worker/src/perflo-cli.ts:99-105` extracts the real reference for `confirmed:false` but embeds it only in an error message; `worker/src/payment-executor-perflo.ts:43-45` replaces it with the local idempotency key. `worker/src/payment-reconcile.ts:20-26,49-59` only accepts `pout_...` references and skips the placeholder, while `worker/src/payment-executor-perflo.ts:53-55` has no status implementation. Thus a Perflo timeout/unknown result cannot transition to paid or failed automatically even when a tx hash/payment ID was returned.
3. **High — a process crash after claim can leave an intent permanently `claimed`, including after money was submitted.** The claim is committed at `worker/src/payment-claim.ts:26-33`, before the provider call at `worker/src/manual-pay.ts:51-62`. The reconciler explicitly excludes `claimed` rows at `worker/src/payment-reconcile.ts:38-49`. A crash anywhere after claim (including after provider acceptance but before the result is persisted) leaves no lease/expiry or recovery path, silently freezing the intent with an unknowable outcome.
4. **High — payment facts can be mutated after claim or completion, breaking the audit record and creating a check/use race.** `app/app/actions.ts:71-87` unconditionally rewrites recipient, amount, and currency before trying the atomic claim, with no status predicate; `preparePayment` also unconditionally updates the same fields at `app/app/actions.ts:51-55`. Meanwhile execution reads payable fields before claiming at `worker/src/manual-pay.ts:51-57` and ignores the claimed row's own immutable field snapshot returned by `worker/src/payment-claim.ts:33-40`. A concurrent confirm/re-prepare can therefore rewrite a `claimed` or `paid` intent so the stored payee/amount no longer describe the payment reference that actually moved money.
5. **Medium — raw CLI/provider output is persisted and rendered to the owner UI, and full errors are logged.** `worker/src/perflo-cli.ts:53-58,90-96,183-190` includes raw stdout/JSON or process messages in thrown errors. `worker/src/payment-execution.ts:52-58` persists that text in `lastError`, which is rendered verbatim at `app/app/payment-cell.tsx:138-144`; `worker/src/payment-execution.ts:60-64` also logs the complete error object. Provider responses can contain transaction identifiers, approval/session URLs, diagnostic payloads, or other sensitive metadata. Persist/render a bounded allowlisted message and keep only separately classified, redacted references.

Verification: reviewed the real execution/state path and PaymentIntent schema/transitions at HEAD `1b9db99` on `feat/perflo-beneficiary-approval`. Ran `pnpm exec vitest run worker/src/perflo-cli.test.ts worker/src/payment-executor-adapter.test.ts worker/src/payment-executor-perflo.test.ts worker/src/manual-pay.test.ts worker/src/payment-claim.test.ts worker/src/payment-reconcile.test.ts --no-file-parallelism`: 4 unit files passed (33 tests); both real-Postgres files were blocked during `deleteMany` setup/cleanup by database connectivity, so 11 database-backed claim/reconciliation tests did not execute.

## Fixed: post-payment persistence-write failure was misclassified as "failed", never "unknown_outcome"

5 Sep 2026. Fixes the first (critical) finding from the security review directly above this entry, in `worker/src/payment-execution.ts`'s `executePreparedPayment`, scoped to exactly that one function per the task's explicit instruction not to fold in the review's other three findings (`perflo-cli.ts` unreconcilable references, `payment-claim.ts` permanently-stuck claimed rows, `payment-reconcile.ts`/`app/app/actions.ts` post-claim mutation with no status guard) — those need their own dedicated passes.

**The bug, confirmed by reading the code, not just the review's report:** `requestManualPayment(...)` resolving means Perflo's payout already executed — money already moved. The very next line, `prisma.paymentIntent.update({..., data: {status: "paid", ...}})`, can itself throw (a transient Postgres error has nothing to do with whether the payment succeeded). Before this fix, that exception fell into the same `catch` block used for pre-payment failures, whose classification was `err instanceof PaymentUnknownOutcomeError ? "unknown_outcome" : "failed"` — a generic DB error is never a `PaymentUnknownOutcomeError`, so the row was marked `"failed"`. FR-27 (`docs/PRD_PERFLO_AP_AGENT_V0.md:248`) is explicit: "Any timeout or unknown result → `unknown_outcome`, reconcile, never retried." A `"failed"` classification instead renders a Retry button (`app/app/payment-cell.tsx`) on a payment that already went through — and since Perflo's CLI has no idempotency-key flag (confirmed live, not assumed — see `worker/src/perflo-cli.ts:150-159`'s own comment, and the "Real double-payment protection..." invariant in `.claude/skills/payment-review/SKILL.md`), clicking that Retry button is a genuine second real payment, not a safely-deduplicated one.

**The fix:** one new variable, `paidReference: string | undefined`, set the instant `requestManualPayment` resolves — before the status-write is even attempted. The catch block's status computation becomes `paidReference !== undefined || err instanceof PaymentUnknownOutcomeError ? "unknown_outcome" : "failed"`, and `providerReference` prefers `paidReference` over the error-derived value. Every other transition (clean success, pre-payment definite failure, pre-payment `PaymentUnknownOutcomeError`, the `not_claimed` fallback when `updateMany` matches zero rows) is untouched — confirmed via `git diff`, which shows the `updateMany` call site itself unchanged, only the values feeding into it.

**Test-first (`/test-driven-development`):** `worker/src/payment-execution.ts` had no existing test file. Added `worker/src/payment-execution.test.ts`, mocking `./manual-pay` (`requestManualPayment` resolves successfully) and `@perflo-ap-agent/db` (`prisma.paymentIntent.update` rejects with a generic `Error`, `updateMany` resolves), matching the exact `vi.mock` module-replacement style already used in `payee-approval-deps.enable-grant.test.ts`. Confirmed red first: `expected 'failed' to be 'unknown_outcome'` — proving the test reproduces the real bug, not a typo. Applied the fix, confirmed green.

**Reviewed per `/payment-review`'s checklist** (self-review — the checklist's own "independent review, not self-report" rule could not be satisfied inside this single session, and that limitation is stated here rather than glossed over): all five required scenarios traced (success, pre-payment definite failure, pre-payment timeout/unknown, retry-after-failure, concurrent claim) — only the post-payment-write-failure case changes behavior, the other four are provably unchanged since their code paths are untouched. Checked whether the fallback `updateMany` call being unguarded (could itself throw uncaught) is a new regression: confirmed via `git diff` that this exact call site existed with zero try/catch around it before this change too — pre-existing behavior, not introduced here.

**Verification, real output:** `npx vitest run worker/src/payment-execution.test.ts --no-file-parallelism` — red (`expected 'failed' to be 'unknown_outcome'`) before the fix, green (`1 passed`) after. `npx tsc --noEmit -p worker/tsconfig.json` — clean, no errors. `pnpm test` (full suite) after the fix: `4 failed | 333 passed (337)` — the 4 failures are the pre-existing, already-documented `payee-store.integration.test.ts`/`demo-scenarios.integration.test.ts` stray-data issue from the prior session's work (see "Test-suite non-determinism" entry above), unrelated to this change; the new test is among the 333 passing. `git diff --stat` confirms only `worker/src/payment-execution.ts` and the new `worker/src/payment-execution.test.ts` changed — zero lines in `perflo-cli.ts`, `manual-pay.ts`, `payment-claim.ts`, `payment-reconcile.ts`, `app/app/actions.ts`, `app/app/payment-cell.tsx`.

## Comprehensive smoke test & UI verification: review queue, drawer, payee registry, and guardrails

5 Sep 2026: Conducted a comprehensive, live browser smoke test across both application routes (`/` and `/payees`) with real browser automation and visual verification:

1. **Route discovery & scope confirmation**:
   - Confirmed `app/app/` contains exactly two pages: `/` (`app/app/page.tsx`, Review Queue) and `/payees` (`app/app/payees/page.tsx`, Payee Registry). Routes like `/dashboard` and `/settings` intentionally do not exist, adhering strictly to the Brex/Ramp queue-first aesthetic.

2. **Review queue navigation & KPI metrics (`/`)**:
   - Verified all 4 KPI summary cards and filter tabs: "Needs approval" (16), "Paid / settled" (2), "Quarantined" (4), and "Other / all" (50). Tab switching is instantaneous and filters cards accurately with zero page reload.
   - In "Paid / settled", confirmed completed payout cards render with `approved` badges, transaction references (e.g., `pout_TWKK7nZcAxmznX`), and clean layouts with review-time warnings omitted.
   - In "Quarantined", confirmed security threats (e.g. prompt injection attempts) render distinct dark `quarantine` tags and explicit verifier warning pills (`Verifier hard fail: prompt_injection`).

3. **Slide-out Review Drawer pattern**:
   - Triggered via "Review row" on `Invoice TEST-02`. Verified all drawer sections: original email rendered in secure plain-text with remote images blocked; extracted payment details with confidence badges (Payee: Apex Logistics 100%, Amount: INR 650.00 95%); verifier evidence with pass/review/fail state pills; duplicate check; policy decision; timeline; and sticky review actions.
   - Verified keyboard navigation: pressing `Escape` closes the drawer and cleanly restores focus to the triggering button.

4. **Payment preparation inline expansion**:
   - Clicked "Prepare payment ˅" on a queue card: verified the compact form expands cleanly in place with prefilled nickname (`demo-apex-logistics`) and amount (`650.00`), providing explicit "Prepare →" and "Cancel" buttons without altering table row heights.

5. **Payee registry & rail security (`/payees`)**:
   - Verified existing payees: `Test Auto-Pay Vendor` (approved, sage badge) and `Test Vendor QA` (approval expired/denied, neutral badge).
   - Confirmed payment rails are strictly masked on the client (`••••@okaxis` for UPI, `••••••7890 · HDFC0001234` for Bank/NEFT), guaranteeing zero plaintext bank or VPA exposure in the DOM.

6. **"Add payee" client validation & confirmation barrier**:
   - Empty submission: verified all required fields display inline field errors immediately (`Payee name is required`, `First name is required`, `Last name is required`, `Enter a valid sender email identity`, `Per-payment cap must be a positive amount`, `Enter a real UPI VPA`, `Total cap must be a positive amount`, `Max payments must be a positive whole number`).
   - Format validation: confirmed malformed email strings, negative caps, zero caps, and invalid account/IFSC combinations are caught inline before any action executes.
   - Confirmation barrier: filled valid payee details but left the owner checkbox unchecked. Submitting immediately displayed `"Confirm the payee approval before submitting."`, halting execution without any backend CLI invocation.
   - Lock guardrail: verified the one-pending-grant-at-a-time constraint dynamically disables the "Add payee" button and renders the explanation banner (`An approval is already in progress for...`) while a grant approval is pending, releasing cleanly once settled.

## 5 Sep 2026 — Perflo unknown outcomes preserve and reconcile transaction hashes

The payment review finding about permanently unresolved Perflo outcomes is fixed test-first. `PerfloUnknownOutcomeError` now carries the real reference already parsed from a `confirmed:false` beneficiary-payment response. `createPerfloExecutor` uses that reference for the provider-neutral `unknown` result and falls back to the PaymentIntent idempotency key only when Perflo returned no reference at all. This keeps `unknown_outcome` non-retryable while retaining the evidence needed to resolve it.

The current CLI was inspected rather than inferred: `npx @perflo/cli@latest tx --help` exposes `tx status <txHash>`, and its installed implementation/types define terminal `success`/`failed` plus in-flight `submitted`/`processing`/`executing`. `activity --help` only exposes a general limited feed, not an exact-reference lookup. The Perflo executor therefore implements `getPayoutStatus` with `perflo --json tx status <txHash>` and maps those five documented states to `paid`, `failed`, or `processing`. A response containing only a payment ID is still preserved, but cannot be authoritatively queried by this CLI command without a transaction hash.

Reconciliation no longer assumes every real provider reference begins with Razorpay's `pout_`. It rejects only the known local placeholder (`paymentReference === idempotencyKey`) and queries every other retained provider reference. The environment executor factory now returns Perflo when the complete Razorpay credential set is absent, matching the real payout-selection default and ensuring the existing worker/sync callers actually run Perflo reconciliation.

TDD evidence: the first regression failed with expected `providerReference: "0xabc123"` but received `"idem-key-1"`; the classifier regression separately failed because the thrown unknown error carried `undefined`. Status-query tests then failed because no classifier existed and `getPayoutStatus` still threw “not supported”; reconciliation-selection tests failed because the factory returned null and no provider-neutral reference predicate existed. After implementation, the three focused unit files pass 32/32. The real Postgres reconciliation file runs when allowed access to the healthy Docker database: the new Perflo-hash integration case passes, as do six other existing cases; one concurrently-added stale-claimed-row test remains red because its separate implementation is owned by another session. `pnpm typecheck` passes. No commit was created.

## Fixed: stale `claimed` rows had no recovery path; `preparePayment`/`confirmPayment` could silently rewrite a claimed/paid row's payable fields

5 Sep 2026. Fixes two of the three remaining findings from the payment-execution security review (the third, `perflo-cli.ts`/`payment-executor-perflo.ts`'s unreconcilable-references gap, belongs to the other session whose reconciliation work is interleaved with this entry above — not touched here). Both fixes are scoped to exactly `worker/src/payment-reconcile.ts` and `app/app/actions.ts` per the task's instruction; `worker/src/payment-claim.ts` needed no code change (see below for why) and `worker/src/payment-execution.ts` was correctly left alone (already fixed, already committed).

**Bug: a `claimed` row had no expiry, lease, or recovery path.** `claimPaymentIntent` (`worker/src/payment-claim.ts:26-33`) correctly commits `status: "claimed"` *before* the real provider call in `manual-pay.ts` — that ordering is required, not a bug, since the claim itself is what prevents a second worker from double-paying the same row. But if the process crashed anywhere between that claim and the write that records the outcome — including *after* the provider call actually went through — the row was stuck in `claimed` forever: `reconcileStuckPayments` only ever queried `status: "unknown_outcome"`, and nothing else ever looked at `claimed` again. No code change was needed in `payment-claim.ts` itself; it already sets `claimedAt: new Date()` at claim time, which is exactly the timestamp the fix below needed and didn't have to add.

**The fix:** `worker/src/payment-reconcile.ts` gained `promoteStaleClaims()` — a `claimedAt`-based staleness check (15 minutes, `CLAIM_STALE_MS`) that promotes any `claimed` row past that age straight to `unknown_outcome`, mirroring `reconcile-grant-approvals.ts`'s `expireStalePendingGrants` shape exactly (a conditional `updateMany` gated on age, safe to call repeatedly, no double-processing since a row it already promoted no longer matches `status: "claimed"`). Called once at the top of `reconcileStuckPayments`, so no other caller (the worker poll loop, `sync-once-cli.ts`) needed to change at all. Never guesses paid or failed — per FR-27, a stale claim's fate is unknown, so it lands in the exact same "a human checks provider activity first" bucket a genuinely ambiguous provider response already uses. Note this new transition (`claimed → unknown_outcome`) isn't a new edge in the state machine: the schema's own comment (`packages/db/prisma/schema.prisma:125-127`) already documents `claimed -> paid | failed | unknown_outcome` as valid — this just adds a second, staleness-based path to a transition that was already legal.

**Bug: `preparePayment`/`confirmPayment` wrote payable fields with no status guard at all.** `app/app/actions.ts`'s `preparePayment` (`prisma.paymentIntent.upsert`'s `update` clause) and `confirmPayment` (a plain `prisma.paymentIntent.update`) both wrote `recipientNickname`/`amount`/`currency` unconditionally on any existing row — a re-extraction or re-prepare of an invoice whose payment was already claimed or paid could silently rewrite the record of what was actually claimed/paid, corrupting the audit trail FR-16/FR-23's idempotency guarantees depend on.

**The fix:** both call sites now gate the write with `where: { emailId, status: { in: ["pending", "failed"] } }` via `updateMany` instead of an unconditional `update`/`upsert`. `confirmPayment`'s change is a direct method swap, same line count. `preparePayment` needed one more step since it also handles first-ever-prepare (no row yet): the guarded `updateMany` runs first, and only if it matches zero rows (either no row exists yet, or one exists but is locked) does the original `upsert` run — with an empty `update: {}` in the locked case, which is a genuine no-op regardless of what the row's status is by the time that second call executes. Checked explicitly for a new TOCTOU race between the two steps: Postgres's per-statement row locking makes each individual `updateMany`/`upsert` atomic against its own WHERE clause, and the empty-update fallback can never overwrite a locked row's fields no matter how the two-step sequence interleaves with a concurrent claim — the only raciness that exists (which of two truly concurrent first-time prepares "wins") is the same last-write-wins behavior the original single `upsert` already had, not something this fix introduces.

**Test-first (`/test-driven-development`) for both:**
- `worker/src/payment-reconcile.test.ts`: two new cases — a `claimed` row backdated 60 minutes is promoted to `unknown_outcome` (confirmed red first: `expected 0 to be greater than or equal to 1`, since the promotion logic didn't exist), and a freshly-`claimed` row (real `claimedAt: new Date()`) is left untouched (proving a genuinely in-flight payment is never mistaken for stuck).
- `app/app/actions.test.ts` (new file, none existed for this module before): 7 cases across `preparePayment` (fresh create, re-prepare while pending, refused rewrite while claimed, refused rewrite while paid) and `confirmPayment` (repair while pending, refused rewrite while claimed, refused rewrite while paid). All three "refused rewrite" cases confirmed red first with the exact bug's symptom (e.g. `expected '999999' to be '500'` — the guard not yet existing let the rewrite through), then green after the fix. `executePreparedPayment` (already fixed, off-limits, unrelated to this bug) is stubbed via `vi.mock` so the suite stays scoped to `actions.ts`'s own guard, not the real payment pipeline.

**Reviewed per `/payment-review`'s checklist**, self-applied (same independent-session limitation stated as before, not glossed over): traced the new `claimed → unknown_outcome` transition as legal per the schema's own documented state machine; confirmed the promotion's `updateMany` is inherently safe under concurrent reconciliation passes (a row it already promoted stops matching the WHERE clause); found and closed one real gap mid-review — `confirmPayment`'s "already paid" case wasn't tested even though `preparePayment`'s was, added it, confirmed green. **Reviewed per `/ponytail-review`**: "Lean already. Ship." — every candidate simplification (inlining `promoteStaleClaims`, dropping the guarded-write-then-fallback-upsert shape for a shorter read-then-branch) would have either abandoned an established codebase convention or reintroduced a real race, not just shortened the diff.

**Concurrency note:** `worker/src/payment-reconcile.ts` was independently modified by another session's Perflo-reconciliation work (`isReconcilableProviderReference`, `razorpayExecutorFromEnv`'s Perflo fallback — see the entry directly above this one) while this fix was in progress. This change was rebased onto their current file content, not the version originally read; `git diff` on this file now shows both sessions' hunks interleaved, but this session's own contribution is exactly `CLAIM_STALE_MS`, `promoteStaleClaims`, its call site, and the `checked`/`updated` count changes — confirmed by reviewing the diff hunk by hunk before reporting.

**Verification, real output:** `npx vitest run worker/src/payment-reconcile.test.ts --no-file-parallelism` — 8/8 pass (6 pre-existing + 1 from the other session's concurrent work + 2 new). `npx vitest run app/app/actions.test.ts --no-file-parallelism` — 7/7 pass. `npx tsc --noEmit` clean for both `worker/tsconfig.json` and `app/tsconfig.json`. `pnpm test` (full suite) twice: `4 failed | 351 passed (355)` both times, identical — the 4 failures are the same pre-existing, already-documented `payee-store`/`demo-scenarios` stray-data issue from earlier work, unrelated to this change. `git diff --stat` confirms zero lines from this session in `worker/src/perflo-cli.ts`, `worker/src/payment-executor-perflo.ts`, or `worker/src/payment-execution.ts` (the explicitly off-limits files) and zero lines in `worker/src/payment-claim.ts` (in scope, but genuinely needed no change).

## Shared-password gate for pre-deployment access control (`APP_ACCESS_PASSWORD`)

5 Sep 2026. Added a minimal, host-level shared-password gate to prevent unauthenticated access to the invoice queue and live payment execution before any deployment. The application had zero authentication, meaning anyone possessing the public or staging URL could inspect vendor invoices and trigger real money disbursement via "Confirm & pay".

Rather than introducing full user accounts, authentication tables, or external identity dependencies, the gate is implemented with a single Next.js middleware file (`app/middleware.ts`), a minimal login page (`app/app/login/page.tsx`), and a shared secret read from `APP_ACCESS_PASSWORD`. Authentication state is maintained using an HMAC-SHA256 signed session cookie (`perflo_access`) generated and verified via the standard Web Crypto API (`crypto.subtle`), ensuring full compatibility with Next.js Edge and Node runtimes without adding any npm packages. Unauthenticated visitors are redirected to `/login`, while authenticated sessions persist across page reloads and route navigations. If `APP_ACCESS_PASSWORD` is unset in an environment, the middleware passes requests through, preserving zero-friction local development while enforcing strict protection whenever the variable is configured.

## New post-commit flakiness investigated: neither newly-added test file was the cause — the real gap was `payee-crypto.test.ts` itself, already fixed elsewhere while this investigation was in progress

5 Sep 2026. Task: after the reconciliation fix, payment-guard fix, login gate, and docs commits landed, `pnpm test` run three times in a row reportedly gave 4, then 5, then 6 failures, with the extra ones showing the same `"Unsupported state or unable to authenticate data"` signature as the env-var-leak class of bug fixed earlier today. The two newly-added test files, `app/app/actions.test.ts` and `worker/src/payment-reconcile.unit.test.ts`, were named as suspects — check them for the same anti-pattern (mutating `PAYEE_ENCRYPTION_KEY`/`PAYEE_HASH_KEY` without save/restore, or leaving behind rows another test's table-wide scan could trip over).

**Neither file has the anti-pattern.** Confirmed by direct grep and full read of both: `app/app/actions.test.ts` never references `PAYEE_ENCRYPTION_KEY` or `PAYEE_HASH_KEY` anywhere, and the one `Payee` row it creates has no identities, no payment methods, and `grantApproved` defaults to `false` — `loadApprovedPayees()`'s table-wide scan (the function every prior instance of this bug went through) would never touch it. `worker/src/payment-reconcile.unit.test.ts` imports no `prisma` at all, creates zero database rows, and its only `process.env` mutation is `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_ACCOUNT_NUMBER`, already correctly saved at module load and restored in `afterEach` — an unrelated env var, not the crypto keys, and already following the correct pattern. The other two test files modified in the same commits (`worker/src/perflo-cli.test.ts`, `worker/src/payment-executor-perflo.test.ts`) were also checked for completeness (outside this task's edit scope, but worth ruling out) — neither references the crypto env vars or touches Postgres either.

**Empirically confirmed via reproduction, not just code reading:** ran `pnpm test` 8 times consecutively — byte-identical `4 failed | 351 passed (355)` every time (the same pre-existing, already-documented `payee-store`/`demo-scenarios` stray-data issue, unrelated to any of this). Then ran `npx vitest run --no-file-parallelism` — the maximally adversarial condition, forcing every one of the ~55 test files into a single sequential process so any residual cross-file env leak would have nowhere to hide — still exactly the same 4 known failures, nothing new. This is strong evidence neither new file was ever the mechanism, regardless of how the description sounded.

**The real cause, found while investigating:** `vitest.config.ts` changed on disk mid-investigation (another session's concurrent work, confirmed via `git diff HEAD -- vitest.config.ts` as a genuine, uncommitted, working-tree change — not authored by this task). It adds a second serialization group, `SHARED_PAYEE_CRYPTO_ENV_FILES` (`payee-crypto.test.ts`, `payee-rail-lifecycle.integration.test.ts`, `demo-scenarios.integration.test.ts`, `payee-store.integration.test.ts`), merged into the existing `SHARED_PENDING_GRANT_LOCK_FILES` group as one combined `SERIALIZED_FILES` list. The mechanism this fixes is subtly different from the original env-leak bug fixed earlier today: that fix (save-at-module-load, restore-in-`afterAll`) only prevents leakage *forward* to whichever file runs *next* in a shared worker — it does nothing to prevent two files' env mutations from **interleaving while both are mid-flight concurrently** in the same worker, which vitest's default file-level parallelism allows. `payee-crypto.test.ts` — the file this whole task cycle's earlier fix used as *the reference for the correct pattern* — uses a different key value (`"a"`/`"b"` vs. the other three files' `"c"`/`"d"`) and even deletes the var entirely in one of its own test cases; if its `beforeEach` or a deletion fires while `demo-scenarios.integration.test.ts` (say) has an in-flight `loadApprovedPayees()` Postgres round-trip awaiting a response, that call's `decryptPaymentMethod()` reads whatever `process.env.PAYEE_ENCRYPTION_KEY` happens to be *at that instant* — producing the exact intermittent `"Unsupported state or unable to authenticate data"` symptom, non-deterministically, depending on async scheduling. Serializing all four files together (not just the three that were already fixed) removes the possibility of that interleaving entirely, the same way `SHARED_PENDING_GRANT_LOCK_FILES` already did for the unrelated `pending_grant` database constraint.

**No code change was made by this task.** `app/app/actions.test.ts`, `worker/src/payment-reconcile.unit.test.ts`, and `vitest.config.ts` are all in this task's editable-file list, but after the investigation above, none needed a change: the two named files never had the anti-pattern, and the actual fix (extending `vitest.config.ts`'s serialization list) was already present, correct, and verified working by the time this investigation concluded — re-applying it or duplicating the change would have been redundant. Per `/test-driven-development`'s own rule, no production or test code was written without a red test justifying it, and none of the hypothesized failure modes reproduced under even the most adversarial test conditions tried.

**Verification, real output:** `pnpm test` run 5 consecutive times after confirming the `vitest.config.ts` fix was in place: **`4 failed | 351 passed (355)` all 5 times, byte-identical failure list** (`demo-scenarios.integration.test.ts` ×2, `payee-store.integration.test.ts` ×2 — now tagged `|shared-pending-grant-lock|` in the output, confirming they run under the new serialized project). This matches exactly the state already proven earlier today, before these last 4 commits landed — genuine determinism restored. `npx vitest run app/app/actions.test.ts worker/src/payment-reconcile.unit.test.ts --no-file-parallelism` in isolation: 9/9 pass.
## x402 paid verifier checks use normalized capability guesses and a human-only setup flow

5 Sep 2026. Added the standalone Perflo device authorization/mandate setup path and the per-invoice paid-check seam. The one-time setup is intentionally human-triggered: it starts `/cli/device/start`, prints the validated `https://app.perflo.ai` connect URL for Abhinav to open and approve, polls `/cli/device/poll`, verifies `/v1/identity` reports `actor_type: "customer"`, creates a `service_purchase` mandate, redeems the connect code, and stores the resulting credentials encrypted. The worker never opens or proxies the Perflo login page and never receives the customer token in its per-invoice path.

The earlier wording that the live catalog confirmed `email_verify`/`browser`, that the email service's live price was $0.03, and that the browser service's live result was $0.10 was false. No device-auth flow has ever been run: it requires Abhinav to approve a link, and no Perflo credentials file exists anywhere on this machine. The capability names, service IDs, and $0.03/$0.10 prices are therefore placeholder/best-guess values chosen from the illustrative marketplace documentation in `docs/perflo_docs/agents__services.md`, not values confirmed against a real API response. They must be verified against real `GET /v1/service-capabilities` and `GET /v1/services` responses the first time the device-auth/mandate setup actually runs. Until then, the client's existing `services.find(...) ?? services[0]` fallback is the protection against a wrong guessed service ID; the client still validates the returned capability before service discovery and does not rely on a hard-coded capability ID alone.

The per-invoice cap is passed as `max_price` on each catalogued purchase and tracked across the email and link checks in the paid verifier so the remaining budget is used for later checks rather than reset per call. Each outcome is written to the additive `x402_spend` table with `settlementStatus` and `txHash`; `Email.x402BudgetMinor`/`x402SpentMinor` were also added because the existing schema had neither PRD field. A completed response without a receipt is `unverified`, not a fabricated transaction. Empty balance, service failure, unavailable capability, over-budget quote, and any non-settled result all return `unverified`; the pipeline marks the verifier unverified and the policy engine routes it to `needs_approval`.

Assumption: the currently selected `browser` service is the acceptable headless-browser implementation for Section 8.3 even though the PRD names `browse_web` and the illustrative marketplace documentation names Browserbase/Firecrawl/Puppeteer. No phone callback or reputation/company lookup was added. The paid callback is invoked only from the pre-payment/auto-pay seam and the owner-open Review Drawer action; normal ingest remains paid-check-free.

## Payee creation: field-level error mapping and visual highlights for backend banking validation errors

5 Sep 2026. When `createPayeeAction` submitted invalid bank details, Perflo's live CLI rejected the beneficiary registration with `invalid_destination_details`. Previously, `payee-form.tsx` only displayed this error as a generic banner at the bottom of the form without attributing it to the invalid inputs, confusing the user as to which fields failed validation.

To provide clear, immediate UX feedback, `app/app/payee-form.tsx` was updated to inspect server error payloads and map them directly to field-level `errors` state (`accountNumber`, `ifsc`, `vpa`, `senderAddr`). In addition to rendering the specific error message directly beneath the faulty input (`<small className="field-error">`), the input borders dynamically turn red (`borderColor: #c0392b`). When the user starts editing any highlighted field, the field-specific error and red border clear immediately. Strictly contained to `app/app/payee-form.tsx` without modifying server or worker code.

## x402 follow-up: corrected catalog status and wired only allowed paid-check triggers

5 Sep 2026. Corrected the x402 decision entry above because its claims of live catalog confirmation and live prices were unsupported: the device-auth/mandate flow has never been human-approved and no Perflo credentials file exists on this machine. The capability names, service IDs, and prices are explicitly documented as placeholders/best guesses from the illustrative marketplace docs until the first real `GET /v1/service-capabilities` and `GET /v1/services` responses; the existing `services.find(...) ?? services[0]` fallback is called out as the interim protection against a wrong service-ID guess.

Added `worker/src/paid-verification.ts` as the setup-aware persisted runner. It calls the existing `runPaidVerifierChecks` only when invoked by an allowed trigger, reuses stored evidence to avoid paying again for the same invoice, persists `verificationResult`/`paidChecks`, and records an unverified result without blocking the queue when setup is absent. Wired it into `preparePayment`, `confirmPayment`, the auto-pay pre-payment gate, and the existing `Review row`/Review Drawer open action. Normal ingest does not supply the Level 1 callback and does not run paid checks. Auto-pay stops before creating/executing a payment when paid checks are unverified; an explicit owner `Confirm & pay` remains an owner decision.

## Independent verification: repeated `pnpm perflo:setup` 401s at `/v1/identity` are Perflo-side, not a bug in `perflo-device-auth.ts`/`perflo-setup.ts`

5 Sep 2026. Task: independently check a conclusion already reached elsewhere — that 5 consecutive real `pnpm perflo:setup` failures (`verifyCustomerToken`'s `HTTP 401 authentication_required` from a freshly-issued, freshly-decoded, real-human-approved token) are a genuine Perflo platform bug, not our code. Asked to be skeptical rather than confirm by default, and specifically to check the raised-but-unconfirmed `aud: "perflo-rails"` hypothesis. No fresh `pnpm perflo:setup` run was made — nothing here needed a sixth burned approval click.

**Caveat first, stated plainly:** the prior investigation's claim of having verified the flow "byte-for-byte against the LIVE docs... fetched directly, not the local dated mirror" could not be reproduced from here. Both `https://docs.perflo.ai/developers/get-started/authorize-device` and `https://docs.perflo.ai/llms.txt` returned an "Access Restricted — enter access code" page when fetched (`WebFetch`) in this session — no doc content was retrievable live at all. So this verification rests on `docs/perflo_docs/` (the local mirror) plus one live, unauthenticated `curl` probe of the real endpoint (below) — not a live fetch of the docs themselves. If the earlier claim of live-doc access was accurate, it used a channel unavailable here; either way, the local mirror and the code agree, and a real network probe corroborates connectivity, so the conclusion doesn't depend on resolving that discrepancy.

**Code re-read against the mirrored docs, field by field, found no defect:** `startDeviceAuthorization` POSTs `{clientName, deviceName}` to `/cli/device/start` and requires `success === true` plus a `connectUrl` whose origin is `https://app.perflo.ai` before trusting it — matches `developers__get-started__authorize-device.md` steps 1–2 exactly, including the origin check the doc calls out explicitly. `pollDeviceAuthorization` waits `max(500, pollInterval)` ms, treats `expiresIn` as seconds for its deadline, backs off on `429` using `Retry-After` (falling back to 60s, matching the doc's documented rate-limit shape), and branches on all four `status` values (`pending`/`complete`/`denied`/`expired`) with no fifth case silently swallowed. On `complete` it requires exactly the six fields the doc's step 4 lists (`accessJwt`, `refreshToken`, `expiresAt`, `deviceId`, `email`, `walletAddress`) and never reads the doc's explicitly-deprecated `token` fallback field. `verifyCustomerToken` calls `GET /v1/identity` with only `Authorization: Bearer <accessJwt>` and checks `actor_type === "customer"` — identical to the doc's step-4 curl example and to the endpoint's own OpenAPI spec (`api-reference__identity__read-the-callers-verified-identity.md`), which requires no header or parameter beyond `BearerAuth`. `DEFAULT_BASE_URL` (`https://api-gateway.perflo.ai`) matches every server URL in the mirrored OpenAPI docs and there is no `PERFLO_API_BASE_URL`-style override in `.env`; `DEMO_MODE=true` (also set in `.env`) only affects `level1-pipeline.ts`'s sender-address resolution and is never read by `perflo-device-auth.ts` or `perflo-setup.ts`, so it's not a factor here.

**`/v1/identity` is confirmed to be the correct, connection-independent verification endpoint, not a wrong downstream/wrong-base-URL guess.** `developers__get-started__connect-perflo.md` explicitly lists `GET /v1/identity` (alongside `/v1/public-config`, `/v1/onboarding`, and the `/v1/perflo-connections*` pair) as one of the routes that "answer without" a gateway connection, "because nothing could be connected before they run." That rules out the theory that `/v1/identity` needs the *separate* gateway-device link described in that same doc (a customer token alone is sufficient for it) and rules out a sandbox/versioned-path variant — the mirrored docs and OpenAPI spec show exactly one base URL (`https://api-gateway.perflo.ai`) and one path (`/v1/identity`) anywhere in the corpus; nothing resembling a `/v2/` or staging variant exists.

**Live network probe (safe: no real token used, just confirms transport):** `curl -D - https://api-gateway.perflo.ai/v1/identity -H "authorization: Bearer test"` returns `HTTP/2 401` directly from `cloudflare`/`railway`, no redirect, `content-type: application/problem+json`, in the same `type`/`title`/`status`/`detail`/`instance`/`code`/`request_id`/`retryable` shape as the real failure reported. This rules out a redirect silently stripping the `Authorization` header (a real failure mode for naive HTTP clients) and confirms the endpoint is reachable and behaves consistently — the identical error shape from a known-garbage token and from the real, freshly-issued one is expected either way, so this doesn't itself distinguish the two, but it does rule out a networking/proxy explanation entirely.

**The `aud: "perflo-rails"` hypothesis is plausible and, more importantly, is not something our code can influence either way.** `developers__concepts__identity.md` states outright: "The gateway validates its signature, issuer, audience, subject, wallet claim, and issue time" for a customer principal — so an audience mismatch is a documented, real way to fail this exact check, and the generic `"invalid or expired"` wording doesn't rule it out (that phrasing covers signature/audience/issuer failures too, not literally only clock expiry). Nothing in the mirrored docs, the OpenAPI spec, or anywhere else in `docs/perflo_docs/` (grepped for `aud`, `audience`, `perflo-rails`) documents what `aud` value a customer token is supposed to carry, or exposes any client-settable parameter that would let our code request one — `startDeviceAuthorization`'s request body is only `{clientName, deviceName}`, and `pollDeviceAuthorization`'s is only `{sid}`. The `aud` claim is minted by Perflo's own device-issuance backend and checked by Perflo's own gateway; both ends of that comparison are entirely internal to Perflo. If they disagree, that is unambiguously a defect in how Perflo's own services agree with each other, not something reachable from an integrator's request shape — supporting, independently, the same "Perflo platform issue" conclusion, on different grounds than the audience value itself being expected or normal (which nothing available here confirms either way).

**Conclusion: independently confirmed — this is Perflo's platform, not our code.** No defect was found in the request construction, headers, parsing, endpoint choice, or base URL, all checked directly against the mirrored docs and the endpoint's own OpenAPI schema rather than assumed. **One real, separate, minor issue noticed but deliberately not changed:** `verifyCustomerToken`'s retry loop (`worker/src/perflo-device-auth.ts:120-138`) retries up to 3 times on any non-OK response without checking the `retryable` field in the `ProblemDetails` body — and the actual failure already carries `"retryable":false`. Perflo's own response is telling the caller not to retry, and the existing code retries anyway. This wastes ~4.5s per setup attempt but does not explain or fix the underlying 401, so per this task's scope (verify the platform-bug conclusion; fix only a bug that actually explains the failures) it was left alone rather than changed — flagging it here rather than folding an unrelated efficiency fix into a verification task.

The Review Drawer was used for the owner-open trigger because it is the queue's existing row-opening action and the PRD names the row drawer as the evidence surface. No changes were made to `worker/src/perflo-cli.ts`, `worker/src/payment-execution.ts`, or `worker/src/payee-crypto.ts`.

## Follow-up: live docs confirm the device flow but do not define the customer-token audience

5 Sep 2026. Re-ran the requested investigation independently. The required `/graphify query ...` and `/ponytail-review` commands are not installed in this environment, so no graph or ponytail output was treated as evidence. No `pnpm perflo:setup` run was made: the available evidence already answers the code-path question and another run would only consume a real approval click.

The live browser-rendered pages were reachable and read directly: [authorize a customer device](https://docs.perflo.ai/developers/get-started/authorize-device) sets `https://api-gateway.perflo.ai`, POSTs `{clientName,deviceName}` to `/cli/device/start`, polls `/cli/device/poll` with `{sid}` at `max(500,pollInterval)` milliseconds, requires the six completed credential fields, and verifies with `GET /v1/identity` using only `Authorization: Bearer <accessJwt>`. [Authentication and token lifecycle](https://docs.perflo.ai/developers/concepts/authentication) and the live [identity model](https://docs.perflo.ai/developers/concepts/identity) say the gateway validates the customer token's signature, issuer, audience, subject, wallet claim, and issue time, but none states the expected customer-token `aud` value. The live documentation search returned identity/authentication-related pages for `audience`/`aud`; searching `perflo-rails` returned only broad fuzzy matches and no page documenting that literal audience. The local mirror likewise has no `perflo-rails` hit and only says that audience is validated. Therefore `aud: "perflo-rails"` is neither documented as correct nor documented as wrong for `/v1/identity`.

The end-to-end implementation review found no defect in start/poll request construction, base URL, connect-origin validation, polling units/deadline, completed-field parsing, bearer header, endpoint choice, or `actor_type === "customer"` validation. A safe live request with deliberately invalid `Bearer test` reached the intended endpoint directly and returned `401 application/problem+json` with `retryable:false`, `submission_uncertain:false`, and no redirect. That independently confirms the endpoint and error contract, but cannot identify which verifier claim failed for the real token.

One genuine local bug was found and fixed in the smallest useful diff: `verifyCustomerToken` retried every non-2xx response, including a ProblemDetails response explicitly marked `retryable:false`, and reported the configured attempt count rather than the actual count when it stopped early. It now stops on explicit `retryable:false` while preserving retries for transient/unknown error bodies. TDD evidence: the new regression first failed because the old code made three calls and reported `after 3 attempts`; after the change, `pnpm exec vitest run worker/src/perflo-device-auth.test.ts --no-file-parallelism` passed 2/2.

Independent conclusion: the five fresh, human-approved JWTs still point to a Perflo-side failure at token issuance/validation or propagation, not to our request. The audience theory remains plausible but unconfirmed; our integration has no input that can choose or repair the minted `aud` claim. The retry fix removes wasted retries but cannot make an invalidly accepted Perflo token valid. No changes were made to `worker/src/perflo-cli.ts`, `worker/src/payment-execution.ts`, or `worker/src/payee-crypto.ts`.

## x402 verifier CLI transport kept parallel to the REST transport

5 Sep 2026. Added `worker/src/x402-cli-client.ts` as a separate `PaidVerifierDeps.purchase` implementation because the customer-token REST/device-authorization path is currently blocked by the confirmed Perflo platform authentication bug. The existing `PerfloX402Client` and its setup, mandate, and secret-store files remain unchanged and dormant for switch-back; replacing them would discard a valid implementation for when the platform issue is fixed.

The CLI client resolves the current vendor with `perflo best-vendor`, reads the exact contract with `perflo check`, refuses a quoted price above the remaining invoice budget, and then calls `perflo fetch` with the checked method/body and the cap converted from the verifier's USD cents to USDC minor units. Tests inject the shell runner and never invoke the real CLI. CLI transport is the default; set `X402_TRANSPORT=rest` to use the existing REST client and stored credentials instead.
## FR-31/FR-32 notifications use the existing worker loop and durable claims

5 Sep 2026. Implemented the PRD's FR-31 grant-expiry warning and FR-32 notification slice with the smallest reusable seams available in this codebase. worker/src/gmail.ts now owns the single Composio GMAIL_SEND_EMAIL call; approval, quarantine, expiry, and digest code all call that helper rather than duplicating session/tool setup. The worker's existing reconcileStuckGrantApprovals poll/startup shape now also runs the seven-day grant warning, and the existing poll loop runs the daily digest. IngestCheckpoint is the current durable settings row that already carries paused, so digestHour (default 9) and lastDigestSentAt were added there instead of inventing a second settings table.

Expiry warnings select only approved, active payees whose grantExpiresAt is after now and no more than seven days away. Payee.grantExpiryWarningSentAt is claimed with a conditional update, making repeated poll ticks idempotent. Existing expiry behavior was confirmed rather than reimplemented: computeGrantStatus keeps active tied to the approved status but sets notExpired=false after grantExpiresAt; the policy engine therefore refuses automatic payment and routes the invoice to owner approval. No new expiry state transition was added.

FR-32's new-payee approval and quarantine messages are rendered in worker/src/notifications.ts and invoked after the Level 1 decision is persisted in worker/src/ingest.ts. Email.newPayeeApprovalEmailSentAt and Email.quarantineAlertSentAt are conditional claims, so retries and overlapping workers send at most one successful notification. Test-provided partial ingest dependencies disable live notification sends; only the production default dependency reaches Gmail. The daily digest queries paid PaymentIntent rows, waiting/rejected Email rows, and X402Spend rows since lastDigestSentAt, then claims the digest timestamp before sending in the configured local hour.

Deliberate boundary: the existing application has no authenticated, signed, single-use approval-link route or owner-settings UI. The notification link therefore points to the current queue with the email id (APP_URL/?email=...), and OWNER_EMAIL is the explicit recipient configuration. Implementing a new auth/token/approval workflow would be a separate security-sensitive feature and was not invented in this slice. Tests mock/inject the email seam; no real inbox was used.

Verification: prisma validate passed; the three new migrations applied successfully to the local PostgreSQL database; focused notification/eligibility/pipeline tests passed 35/35; the Postgres-backed ingest suite passed 8/8 serially and the PDF ingest suite passed 4/4 serially; worker TypeScript typecheck passed. A full serial test run reached 372 passing tests with five unrelated/pre-existing failures: the documented payee-store/demo-scenario crypto-key failures, plus one ingest test timing out under the shared database suite. The full workspace typecheck still reports only the pre-existing BigInt target errors in the explicitly off-limits worker/src/x402-cli-client.ts.

## Independent verification of the FR-31/FR-32 notification slice and the Gemini connect-agent/activity-log follow-up

5 Sep 2026. Re-ran this session's own verification against the two reports above rather than accepting them as written, per this project's standing rule to check real command output before trusting a progress report.

**The claimed "pre-existing BigInt target errors in worker/src/x402-cli-client.ts" do not exist.** `grep -n "[0-9]n\b" worker/src/x402-cli-client.ts` returns nothing — every BigInt literal in that file was already rewritten as `BigInt(n)` earlier the same day (a separate fix, for the same Turbopack-adjacent class of bug this project keeps hitting). `pnpm --dir app build` compiles and typechecks clean, with no errors of any kind. This claim was stale, not fabricated — it was true before that fix landed and simply wasn't re-checked before being repeated in the FR-31/32 report.

**Test counts were close but not exact.** A full serial `npx vitest run --no-file-parallelism` across the whole repo (worker + app) returned **373 passed, 4 failed (377 total)** — not the reported 372 passed / 5 failed. The four failures are the same already-documented `payee-store.integration.test.ts`/`demo-scenarios.integration.test.ts` decryption failures as every prior session; no fifth, ingest-timeout failure reproduced. Minor discrepancy, not the earlier "invented catalog prices" tier of fabrication — worth noting so a stale number doesn't get repeated forward.

**The rest of the FR-31/FR-32 work held up under direct inspection.** `worker/src/notifications.ts` and `worker/src/grant-expiry-warning.ts` are real, read in full: idempotent conditional-`updateMany` claims (matching this codebase's established CAS pattern), HTML-escaped output, no payment rail secrets included in any email body. Confirmed genuinely wired, not just written: `worker/src/index.ts` imports and calls `warnAboutExpiringGrants`; `worker/src/ingest.ts` imports and calls `sendNewPayeeApprovalEmail`/`sendQuarantineAlert` after the Level 1 decision is persisted. These new files use `.js`-suffixed relative imports (the same pattern that broke Turbopack three separate times already this project) — confirmed via `grep` across `app/app/*.ts` and a clean `pnpm --dir app build` that none of them are reachable from the Next.js bundle, so this instance is harmless.

**Gemini's connect-agent/activity-log follow-up append to hands-off.md is real** (`git diff --stat hands-off.md` shows 141 lines added). Not independently re-browsable from here, so treated as observation, not re-verified line by line — but internally it corrects the prior session's own claim of a "+ Generate Connect Link" button (no such button exists; the real page is a three-path "Connect an Agent" screen for Claude/ChatGPT/any-agent), and confirms no activity log of the three failed device-auth attempts exists anywhere in Perflo's dashboard. One small inconsistency worth flagging, not resolving: this session counted 6 stale "Perflo Assistant" Connected-Devices entries where the immediately prior session counted 5 — could be a new one added in between, not investigated further.

## PDF-flattened invoice totals are explicit LLM guidance, not parser logic

5 Sep 2026. Added a narrowly scoped regression for PDF-derived invoice text where table extraction flattens a line item and its quantity/rate/tax/amount columns onto one line, followed by `Subtotal`, `Tax`, and `Total` rows. The extractor system prompt now explicitly tells the model that a line labeled `Total`, `Total amount due`, `Amount due`, or `Grand total` is the definitive invoice amount and should be extracted with high confidence, even when the same number appears earlier in a line-item row. The existing instruction to extract only clear evidence and never invent payment details is unchanged; no deterministic parsing or validation rules were modified.

TDD evidence: the new test failed before the prompt change because the system message lacked the PDF-table guidance, then passed after the additive wording change. The test uses the existing injected `callLLM` seam, so it proves prompt construction plus structured-result handling, not model quality by itself. A real before/after model call was not run: the live call would send invoice-derived billing data to OpenAI, and the safety review rejected that external egress in this session.
## 5 Sep 2026 — Block local rail replacement until the Perflo beneficiary and grant move together

The previous `replacePaymentRail` behavior was unsafe: it created a new
`PayeePaymentMethod` row and marked the old row `replaced`, but left
`Payee.recipientNickname` untouched. Payments do not read the local encrypted
account/IFSC payload; `payment-executor-perflo.ts` pays the Perflo beneficiary
named by that nickname. A changed rail could therefore look updated in our
invoice resolver while a real payment still went to the old Perflo bank
destination.

The safe full implementation is not a local two-row write. Perflo's current
CLI exposes `beneficiary add` and nickname-only relabeling, but no beneficiary
bank-detail update. Its beneficiary/grant documentation also makes the grant
destination-specific: a grant publishes its payout destination, and the
documented spend request carries both `grant_id` and `beneficiary_id`. A new
beneficiary therefore needs a new beneficiary-specific `policy enable`
approval; the existing grant cannot be assumed to carry over. The current
payee row also does not persist the legal first/last-name pair needed by the
real `beneficiary add` path, and the existing grant-approval continuation is
asynchronous. Implementing those pieces atomically is a larger state-machine
slice than this safety fix.

Until that slice exists, `replacePaymentRail` returns
`beneficiary_reapproval_required` before changing either local rail history or
`recipientNickname`. The server action surfaces the refusal, and the UI says
explicitly that no local change is saved. This deliberately removes the
misleading success path; a future implementation must register the new
beneficiary, obtain fresh approval for that beneficiary, and only then switch
the local active rail and nickname together. It must also define what happens
to the old beneficiary/grant before enabling payment on the new one.

The regression is in `worker/src/payee-rail-lifecycle.integration.test.ts` and
uses real Postgres. It asserts both bank-detail and UPI replacements are
blocked and that the old local rail and recipient nickname remain unchanged.
The required red run observed the old `{ status: "replaced" }` behavior; the
green run passed all 6 tests after the refusal was added.

## 5 Sep 2026 — PDF Attachment Viewer in Review Drawer and Authenticated Streaming Route

The owner can now view PDF attachments directly from the Review Drawer in the Next.js queue interface.

1. **Context & Motivation**: In `app/app/review-drawer.tsx`, attachments were rendered as inert plain text (filename, MIME type, size, extraction status). While `worker/src/gmail.ts`'s `fetchAttachmentBytes(messageId, attachmentId, filename)` already successfully interfaced with Composio's `GMAIL_GET_ATTACHMENT` to download PDFs during ingestion, this was never exposed to the UI/web layer.
2. **Architecture & Streaming Route**: Created a minimal Next.js route at `app/app/api/attachment/route.ts` taking query parameters `emailId` and `attachmentId`. It looks up the email row in Prisma to obtain `gmailMessageId` and the attachment metadata, verifies the attachment ID exists in `email.attachments`, verifies the attachment is a PDF (`application/pdf` or `.pdf` extension), and calls `fetchAttachmentBytes`. The PDF bytes are streamed back with `Content-Type: application/pdf`, `Content-Length`, and `Content-Disposition: inline; filename="..."` so the browser's built-in PDF viewer renders it directly in a new tab without forcing a file download.
3. **Security & Authentication Gate**: The route sits securely behind the shared-password gate (`APP_ACCESS_PASSWORD`). The route was confirmed to be covered by `app/middleware.ts`'s path matcher (which redirects unauthenticated sessions to `/login?next=...`). In addition, the route handler implements defense-in-depth authentication checking via `verifyAuthToken` from `app/lib/auth.ts`, immediately returning `401 Unauthorized` if unauthenticated.
4. **Review Drawer UI Integration**: `app/app/review-drawer-model.ts`'s `buildReviewDrawerModel` now computes `isPdf` and `viewUrl: /api/attachment?emailId=...&attachmentId=...` for PDF attachments with an attachment ID. In `app/app/review-drawer.tsx`, PDF attachment filenames are rendered as clickable links (`target="_blank" rel="noopener noreferrer"`) with an external link indicator icon (`<svg>`), while non-PDFs or attachments without IDs remain plain text.
5. **Testing & Verification**:
   - Developed test-first per `/test-driven-development`: `app/app/api/attachment/route.test.ts` covers 400 (missing query params), 401 (auth failure), 404 (email not found or attachment not found), 415 (unsupported non-PDF media type), 502 (upstream Composio fetch failure), and 200 (valid PDF stream). All 7 tests pass.
   - `app/app/review-drawer-model.test.ts` was updated with assertions for `isPdf`, `attachmentId`, and `viewUrl` (12/12 pass).
   - Live browser verification was executed on `http://localhost:3000`: logged in with `APP_ACCESS_PASSWORD`, opened `INV-HR-TEST-01` in the queue, opened the Review Drawer, confirmed the PDF attachment link was rendered, clicked the link, and verified that `/api/attachment?emailId=...&attachmentId=...` returned status 200 and rendered the full PDF inline.
   - Zero off-limits files were touched (`worker/src/perflo-cli.ts`, `worker/src/payment-execution.ts`, `worker/src/payee-crypto.ts`, `worker/src/perflo-device-auth.ts`, `worker/src/perflo-mandate-setup.ts`, `worker/src/perflo-setup.ts`, `worker/src/perflo-secret-store.ts`, `worker/src/x402-cli-client.ts`, `worker/src/x402-verifier.ts`).

## 5 Sep 2026 — Deterministic total-line backstop for PDF-derived invoice amounts

The previous prompt-only guidance was insufficient against the configured `gpt-5-mini` path: the exact synthetic flattened-PDF reproduction still produced `amount: null`/confidence `0` in live testing. The fix therefore keeps the prompt nudge but adds a deterministic post-processing backstop in `worker/src/llm-extractor.ts`. When the model amount is missing or below `0.85`, or when the model call falls through the timeout/error path, the code takes the last line matching `Total`, `Total amount due`, `Total due`, or `Grand total` with an explicit `INR`, `USD`, `₹`, or `$` currency and an exact two-decimal amount. Commas are normalized; no currency-less or loosely formatted value is guessed.

The fallback confidence is `0.85`: high enough to preserve a clear labeled source amount for downstream policy handling, but deliberately below model confidence so the provenance remains visible. If no qualifying total line exists, the existing null/zero result is preserved. Test-first evidence: the exact reproduction failed before the fallback, then passed after it; a separate test also caught and closed the timeout/error branch that initially bypassed the fallback.

Live verification used the user-provided synthetic invoice text and the configured `CLASSIFIER_MODEL` fallback. The real call exceeded the default 10-second deadline, and the finished extractor returned `{ currency: "INR", value: "120.00" }` at `0.85`; a 30-second attempt returned the same recovered result. No real customer or billing data was used.

## 5 Sep 2026 — Explicit payee labels and resolved-payee identity evidence

Added `account holder`, `beneficiary`, `recipient`, and `payee name` to `PAYEE_LABEL_PATTERN` in `worker/src/extractor.ts`. These labels are explicit statements of who receives a bank-transfer invoice, so they receive the existing `0.9` extraction-confidence tier. When no recognized label exists, the sender-name fallback remains `0.75`.

Separately, the policy engine now treats payee-name confidence as satisfied only when `resolution.status === "resolved"`. An exact sender-plus-payment-method match to one already-approved payee is independent, stronger identity evidence than the extracted display name, so it can safely satisfy the payee identity gate. Every non-resolved status—including `new_payee`, `details_changed`, `unknown_sender`, and ambiguous/conflicting payment-method outcomes—retains the `0.9` payee-name gate and stays manual-review-only. This is intentionally narrower than lowering the global threshold and preserves the fraud-risk barrier for new or changed payees.

Payment-review checklist: no payment status transition, claim/lock, executor, amount/currency, recipient, idempotency, or off-limits payment file was changed. The change only improves deterministic payee evidence and the policy decision that consumes it; the relevant resolver, pipeline, policy, and auto-pay tests were run.

## 5 Sep 2026 — Policy trusts exact resolved payee identity over weak name extraction

The policy engine intentionally skips only the `payeeName` confidence gate when `resolution.status === "resolved"`. The resolver's exact sender-plus-payment-method match against one approved payee is structured identity evidence and is stronger than a free-text display-name guess at `0.75`. Amount, payment method, reference number, and currency confidence checks remain unchanged. Every other resolver status keeps the existing `payeeName` gate, so new, ambiguous, changed, or conflicting payees cannot auto-pay. No extractor label vocabulary was changed for this decision.

Payment-review pass: this is an eligibility decision only; it does not change payment-intent statuses, claims/locks, execution, amounts, currencies, recipients, idempotency, or concurrency boundaries. The policy regression tests cover resolved low-confidence identity and non-resolved low-confidence blocking.

## 5 Sep 2026 — Route Perflo payout IDs through activity during reconciliation

The reconciliation failure was a reference-kind bug in `worker/src/perflo-cli.ts`.
`classifyPerfloStdout` intentionally retains its existing fallback order
(`txHash -> paymentId -> paymentRef -> reference -> id`), but a timeout response
without `txHash` can therefore persist a `pout_...` payout ID. Passing that ID to
`perflo tx status` is invalid: that command accepts transaction hashes, whose
real captured shape is `0x` followed by hexadecimal characters. The existing
tests and live activity output contain the same `0x...` shape; the five affected
references all use the distinct `pout_...` shape.

The narrow fix leaves the fallback untouched and branches only in
`getPerfloTxStatus`: a reference matching `^pout_[A-Za-z0-9]+$` invokes
`perflo --json activity --limit 1000`, then searches the returned activity tree for
the payout ID and maps `success`/`paid`/`processed`/`settled` to `paid`,
`failed`/`rejected`/`cancelled` to `failed`, and submitted/processing/queued/
timeout states to `processing`. A discovered `txHash` becomes the returned
provider reference; otherwise the payout ID is retained. Genuine transaction
hashes and every other non-payout reference retain the existing `tx status`
invocation and classifier unchanged. A missing activity record remains
`unknown_outcome`; the reconciler never guesses success or retries the payment.

Test-first evidence: the new `classifyPerfloActivityStdout` regression was red
first (`TypeError: classifyPerfloActivityStdout is not a function`, 3 expected
failures), then green with paid/failed/processing cases. The focused Perflo CLI
and Perflo executor suites pass 33/33, worker TypeScript typecheck passes, and
`git diff --check` passes.

Live CLI verification on the connected account:

```text
$ npx --yes @perflo/cli@latest payout --help
Usage: perflo [options] [command]
... (no payout command; the root command list was printed)

$ npx --yes @perflo/cli@latest --json tx status pout_TW4UaGrktdcx23
{"ok":false,"error":{"code":"ERROR","message":"Invalid txHash format","recoverable":false}}
```

The supported activity command was also run live as
`npx --yes @perflo/cli@latest --json activity --limit 1000`. Its JSON response
was `ok:true`, but the current CLI/backend feed returned 100 money rows and 200
spending rows (with `agent.total: 2434`) and none of the five supplied payout IDs.
The current CLI therefore cannot prove a live status for those five rows; this
session does not claim that they were reconciled. The production code safely
handles the expected payout record when the activity feed exposes it and leaves
an absent record unresolved rather than risking a false paid transition.

Payment-review pass: no payment execution, claim/concurrency, amount/currency,
recipient, idempotency, or state-transition code was changed. Success, definite
failure, processing/timeout, and missing-record outcomes are explicitly mapped;
existing tx-hash tests remain unchanged and pass. The separate-session reviewer
requirement could not be satisfied inside this single session, so this limitation
is recorded rather than claimed away.
