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
