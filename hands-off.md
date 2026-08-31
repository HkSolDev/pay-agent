# Perflo AP Agent — Hands-off Handoff

Last verified: 2026-08-31 (third session this day — runtime vs. permanent policy blockers, "Re-evaluate policy" / "Resume auto-pay")
Branch: `codex/level1-edge-case-review`. **PR #8 is merged into `main`** (merge commit `3f16a68`) — `main` and this branch are byte-identical as of this update (`git diff origin/main..HEAD` is empty). The earlier "3 additional Level 0 commits on main" divergence warning in this line was itself stale by the time it was written — main had already absorbed everything via PR #7's merge before that warning was added — and is now fully resolved either way. If this line is ever stale again, don't trust it blindly: run `git fetch origin && git diff origin/main..HEAD --stat` yourself before assuming anything about sync state.

## Session summary — 2026-08-31, third session (runtime vs. permanent policy blockers)

**Committed and merged** — this was "not yet committed" when this line was first written, but was committed (`efe8f18`, `9fce068`), pushed, and merged to `main` via PR #8 later the same session. Left uncorrected here for a few messages, which caused real confusion in a follow-up chat (the doc said "not committed"/"no PR open" while git said otherwise) — lesson: update a status line like this the moment the state changes, not just at write time.

**The problem this session fixed:** `AUTO_PAY_MODE` is a runtime env-var switch, but `policy-engine.ts`'s `"Global pause is enabled."` reason used to get written once into an invoice's `policyReasons` at ingest/reprocess time and never refreshed. Flipping `AUTO_PAY_MODE=on` and restarting the worker only affected *new* ingestion — invoices already sitting in the queue kept showing the stale pause reason forever, with no way to refresh them short of a full re-extraction (`retryReviewProcessing`, which itself deliberately never pays). Confirmed live: after setting `AUTO_PAY_MODE=on` and restarting the worker, the queue still showed 12+ invoices blocked by "Global pause is enabled." with no way to tell whether that was current or stale.

**What was built**, all new files unless noted:
- `worker/src/policy-engine.ts` — exported `GLOBAL_PAUSE_REASON`/`PAYEE_AUTOPAY_DISABLED_REASON` constants (previously inline strings other code would have had to guess/re-type) and moved the INR-only currency guard here as `applyCurrencyGuard`, shared between `level1-pipeline.ts` and the new re-evaluation path so they can't drift apart.
- `worker/src/reevaluate-policy.ts` — `reevaluatePolicy(emailId)`: recomputes `decidePolicy`'s output from what's **already stored** on the `Email` row (extraction summary, payee resolution, verification result, duplicate result) — no re-extraction, no re-classification, no LLM call. Only two things are read fresh: the current `AUTO_PAY_MODE` value and the resolved payee's *current* grant/auto-pay-toggle state (via an injected `loadApprovedPayees`/`loadPayeeUsage`, same DI pattern as `IngestDeps`). Persists only `policyDecision`/`policyReasons` — never touches `PaymentIntent`, **never pays**. Same `reviewRetryBlockReason` guard as the existing retry path (refuses to touch a claimed/paid/failed intent). See the file's "rail-trust note" comment for an honest limitation: it trusts the *original* rail match rather than re-verifying sender/rail from scratch — a full re-verification is what `retryLevel1Processing` is still for.
- `worker/src/resume-auto-pay.ts` — `resumeAutoPayForEligibleInvoices()`: the one explicit, narrowly-scoped action that can actually turn a re-evaluated `auto_pay` decision into a real payment. Only considers invoices whose **currently stored** `policyReasons` is *exactly* `[GLOBAL_PAUSE_REASON]` — an invoice blocked by pause *and* something else, or blocked only by the payee's own auto-pay toggle, is left untouched. Re-checks every guardrail live via `reevaluatePolicy` before paying anything, then calls the existing `runAutoPayIfEligible` (same idempotent claim-then-execute path as normal ingest-time auto-pay) — no new payment logic was written. Accepts an optional `scopeToEmailIds` filter used only by tests, so tests never scan/touch whatever real invoices are sitting in the shared local dev DB.
- `app/app/actions.ts`, `app/app/page.tsx`, `app/app/queue-view.tsx` — two new server actions (`reevaluatePolicyAction`, `resumeAutoPayAction`), both run **in-process** (no `execFile` subprocess) since neither new worker module touches the Gmail/Composio SDK, same reasoning as `confirmPayment`. UI: a live `Auto-pay: live` / `Auto-pay: globally paused` badge (computed fresh from `process.env.AUTO_PAY_MODE` on every page render, not read from any stored field), a "Resume auto-pay for N eligible invoices" button next to it, and a per-card distinction — an invoice blocked *only* by the pause gets a neutral note + "Re-evaluate policy" button instead of the same alarm-colored warning pill used for real (permanent) blockers.
- Tests: `worker/src/reevaluate-policy.test.ts`, `worker/src/resume-auto-pay.test.ts` (new, 12 tests total), plus 1 new case in `worker/src/policy-engine.test.ts` for the exported constants. Both new integration test files construct `ApprovedPayee` objects **in memory** rather than through the real encrypted payee-store — deliberately, because this local dev DB has a pre-existing payee with a rail encrypted under a different key (see "A verification lesson" section below / the 4 known pre-existing failures), and `loadApprovedPayees()` throws for the *entire* table if even one row fails to decrypt. Confirmed by hand that this session's test runs never mutated the real queue's invoices (checked before/after with a throwaway script, diffed identical).

**A real bundler bug found and fixed along the way, not just this feature's own code:** Next's Turbopack (unlike `tsc`) does not remap an explicit `.js` import specifier to a sibling `.ts` file. `worker/src/reevaluate-policy.ts` and `resume-auto-pay.ts` were the first files to pull the `.js`-suffixed-import part of `worker/src` (`policy-engine.ts`, `payee-store.ts`, `payment-usage.ts`, `auto-pay-eligibility.ts`, `review-retry.ts`, `auto-pay-runner.ts`) into the Next app's bundle via `actions.ts`. Fixed by switching those files' own imports to the extensionless convention already used by every other worker file reachable from `app/app/actions.ts` (see the existing "Turbopack import-extension gotcha" section further down this file — this is the same rule, just newly triggered by a new import edge). `auto-pay-runner.ts`'s two value imports (`auto-pay-gate`, `payment-execution`) needed the same fix since it's now newly reachable via `resume-auto-pay.ts`.

**Verification:** `pnpm typecheck` clean, `pnpm --dir app build` clean (this specifically caught the Turbopack bug above — dev-server console errors alone were ambiguous/cache-confused, `next build` gave a deterministic repro). `pnpm test`: 279/283 passing, same 4 pre-existing local-fixture failures as before (unrelated). Live-verified in the browser: clicked "Re-evaluate policy" on a stale invoice, its pause warning disappeared and the "Resume auto-pay for N" count dropped accordingly — the full chain works end-to-end, though the actual **payment execution** itself (clicking "Resume auto-pay" and watching a real RazorpayX sandbox payout happen) was not exercised live this session — only the recompute step was.

**Not done / next:** this work is committed and merged (see the branch-state line at the top). Still open: the four pre-existing encrypted-payee test failures (unrelated, documented below), no login/auth on the app, and live-clicking "Resume auto-pay" itself against a real invoice (only "Re-evaluate policy" was live-verified this session, not the actual payout path — see below).

### Same session, continued — auto-pay live-verified end-to-end, three real UI bugs found and fixed

**Auto-pay finally verified live, end-to-end, for real:** with `AUTO_PAY_MODE=on` and the test payee's toggle on, three fresh invoices (`INV-DEMO-2026-05/06/07`) were sent and auto-paid automatically with no manual click — the first time this has actually been observed working, not just unit-tested. Each landed at RazorpayX's `processing` state (a real sandbox API call, not a mock).

**Corrected a wrong assumption, confirmed against RazorpayX's live docs, not memory or the earlier session's notes:** the user asked to have `processing` invoices automatically marked `paid` in the database, on the theory that "processing" in test mode means the payment already went through. Fetched `https://razorpay.com/docs/x/dashboard/test-mode` directly and quoted the exact current text back:

> "From the processing state, you will have to manually move the payout to the next state from the Dashboard... Unlike the Live Mode, this does not happen automatically."

This confirms the earlier session's finding still holds and is not stale. **Refused the request** to mark `processing` payouts as `paid` — that would misrepresent an unconfirmed payment as settled, directly against this app's own FR-27 no-false-positive rule. Explained the correct path instead: manually advance the payout in the RazorpayX Test Mode dashboard; the existing `payment-reconcile.ts` poller then picks up the real status automatically on its next cycle — no code change needed for that part. **The user then did this manually** for the three test invoices, and the reconciliation poller correctly moved all three to `paid` on its own, exactly as designed — this is the first live confirmation that `payment-reconcile.ts`'s poller actually works end-to-end against a real state transition, not just its own unit tests.

**Bug 1 — review drawer offered nonsensical actions on an already-paid/in-flight invoice.** Opening "Review row" on an invoice that had already auto-paid (or was still `processing`) showed the same "Approve for review / Reject / Mark not an invoice / Retry processing" footer as an untouched invoice, with copy claiming "None approves an automatic payment" — false once a payment already happened. Fixed in `app/app/review-drawer.tsx`: added `paymentAttemptNotice()` and reused the existing `reviewRetryBlockReason` gate (`worker/src/review-retry.ts`) client-side to decide when to hide the whole action row and show a plain-language status notice instead (e.g. "A payment was attempted and its outcome is still unconfirmed at the provider. Review actions are unavailable until it's reconciled."). The header subtitle also changes conditionally. New CSS: `.drawer-payment-notice` in `globals.css`.

**Bug 2 — the "needs approval" tag stayed on invoices that had already auto-paid or were mid-payment.** `app/app/queue-view.tsx`'s `isNeedsApproval` (duplicated 3x — KPI counts, tab filter, per-card tag) has a catch-all fallback (`classification !== "ignored" && policyDecision !== "ignore"`) that doesn't check payment-intent state at all, so a row with `policyDecision: "auto_pay"` and an in-flight `PaymentIntent` still showed "needs approval" everywhere. User caught this live via a screenshot. Fixed by adding a shared `hasPaymentAttempt(status)` helper (true for anything past `"pending"`) and `&& !hasPaymentAttempt(...)` at all three call sites — confirmed live: the "Needs approval" count dropped from 14 to 8 immediately, and the two in-flight rows now show only their real `PaymentCell` status pill, no contradictory tag.

**Bug 3 — a paid invoice still displayed its stale pre-payment policy warnings.** A manually-paid invoice (`DEMO-9001`, paid via "Confirm & pay" despite several review-time warnings — an intentional human override, not a bug) kept showing all of those original warning pills (low confidence, unresolved payee, auth misalignment, etc.) forever, reading as active problems on a completed payment. User caught this live too. Fixed in `queue-view.tsx`: `warnings` (and the pause-only special case, `blockedOnlyByPause`) are now forced empty once `intent?.status === "paid"` — the reasons described review-time state, which is moot once money has actually moved. Confirmed live: `DEMO-9001` now renders cleanly with just its "approved"/"Paid" tag, matching the other two paid rows.

**Verification:** `pnpm typecheck` clean after each fix. `pnpm test`: still 279/283, same 4 pre-existing unrelated failures. All three bugs reproduced and re-verified live in the browser (screenshots, not just code review) before and after each fix.

## Read this first (new chat window / new AI session)

Before touching this repo, read in this order:

1. This file (`hands-off.md`) in full — it is the authoritative "what actually happened and why," not just a task list. **Read "Session summary — 2026-08-31, third session" first** — it's the most recent work and sits above the older session summaries below it.
2. `README.md` and `tests/README.md` — current commands, test count, and the parallel-test-key-collision note (see "Known flakiness" below — don't mistake it for a real regression).
3. `packages/db/prisma/schema.prisma` — the real persistence boundaries; trust this over any prose description of a model shape.
4. `worker/src/payment-executor.ts` and `worker/src/payment-reconcile.ts` — the provider-neutral payment interface and the reconciliation poller; read the former's file-header comment on the RBI/PPI/escrow boundary before proposing anything involving holding funds.
5. `worker/src/policy-engine.ts`, `worker/src/level1-pipeline.ts`, and `worker/src/auto-pay-gate.ts`/`auto-pay-runner.ts` — the new auto-pay path (this session). Read before touching anything payment-related; this is the highest-blast-radius code in the repo.
6. **Do not trust any of the above blindly** — this handoff was itself corrected mid-session after a "confirmed bug" turned out to be stale/corrupted local Postgres state, not a real code defect (see "A verification lesson from this session" below). Re-run `pnpm test` and the demo reseed commands yourself before accepting any claim here as still true.
7. **There is currently no login/auth of any kind on the Next.js app.** Anyone with the deployed URL can view every invoice and click "Confirm & pay," which makes a real (sandbox) RazorpayX API call. If this gets deployed publicly (Railway, etc.), password-protect it at the host level before sharing the link — this is not yet fixed in code.

## Current working state — 2026-08-31, documentation addendum

This addendum supersedes older test counts and older statements that describe auto-pay as only a policy label. Auto-pay execution is now wired, but it is still deliberately disabled in the local environment and has not been live-tested end-to-end.

### Objective and intended flow

The demo is intended to show an explainable email-to-payment pipeline for a job assignment:

```text
email → MIME/PDF parse → classify → extract amount/currency/payee
      → resolve approved encrypted rail → verify/authenticate
      → duplicate check → policy/grant checks → review queue
      → manual payment, or automatic payment only when every gate passes
```

The important outcome is safe routing to the exact registered payee rail. A sender may provide invoice details in the demo, but the payment destination and amount used for execution must come from the persisted resolution/extraction records, not from editable browser form values.

### Explicit safety state

The safe state is:

```text
AUTO_PAY_MODE=       # OFF: no invoice can execute automatically
DEMO_MODE=true       # local demo only: allows a different test sender to match a registered rail
payee.autoPayEnabled=false
```

`DEMO_MODE` does not turn on payment and must not be used in production. Production sender/domain verification remains enabled when `DEMO_MODE` is unset or false. Auto-pay requires both `AUTO_PAY_MODE=on` and the selected payee's toggle, followed by all confidence, authentication, duplicate, currency, exact-rail, grant-limit, expiry, and owner-ceiling checks. The UI warning **Global pause is enabled** is the visible result of `AUTO_PAY_MODE` being off; it is not a separate third switch. The UI's `Pause syncing` control is different: it stops new Gmail ingestion, while `AUTO_PAY_MODE` prevents automatic money movement. Reconciliation of an already-started payment can still run while syncing is paused.

### Why the latest code changes exist

- `app/app/actions.ts` now derives payment preparation and retry values from the database's resolved payee and extraction summary. This fixes the observed `demo-test-auto` routing failure, where a UI nickname did not match the registered encrypted rail, and prevents stale form values from selecting a different recipient or amount.
- `worker/src/payee-resolver.ts` and `worker/src/level1-pipeline.ts` support a local-only demo sender relaxation. This lets a second mailbox test the full flow against a registered demo payee without weakening production verification.
- `worker/src/auto-pay-runner.ts` and `worker/src/ingest.ts` carry the extracted currency into the shared payment executor. `worker/src/level1-pipeline.ts` holds non-INR auto-pay for review because the current grant/RazorpayX path is INR-only.
- `worker/src/sync.ts` overlaps the Gmail checkpoint by ten minutes. Gmail/indexing lag can otherwise cause a message arriving near a checkpoint to be skipped permanently; email IDs make the overlap idempotent.
- Source-backed invoice reference confidence, retry processing, real Sync now/Pause syncing, reconciliation, and per-payee auto-pay gates were kept explicit so each decision is reviewable and the manual fallback remains available.

### Latest verification and known limits

- `pnpm typecheck` and `pnpm build` pass.
- Focused resolver/pipeline/policy tests pass 23/23.
- The latest full run was 271 passed and 4 failed out of 275 with `--no-file-parallelism`; the four failures are stale encrypted-payee fixture/database-state failures in the local Postgres instance. Re-run after a clean database/fixture reset before treating them as a regression.
- Browser/email testing found `INV-DEMO-2026-04`, resolved it to the registered demo payee, and correctly held it at `needs_approval` because auto-pay was off. No automatic payment was intentionally triggered.
- There is still no app authentication. Perflo KYC is still pending. RazorpayX test-mode payouts can remain processing until manually advanced in the RazorpayX test dashboard.

### Controlled sandbox demonstration only

If an explicit end-to-end auto-pay demonstration is required, use one registered test payee and a fresh matching INR invoice: enable that payee, set `AUTO_PAY_MODE=on`, restart the worker, verify the queue record and exact rail, observe the RazorpayX test-mode result, then set the global switch back to blank/off and disable the payee. Never make all payees auto-pay by default, never remove production sender verification, and never use live provider credentials for this demonstration.

## Session summary — 2026-08-31, second session (design implementation, Sync now/Pause, auto-pay)

Three commits, pushed to `origin/codex/level1-edge-case-review`, no PR opened yet:

**Commit 1 — `25c8de3` Fix hydration crash on queue dates and broken payee-confirm checkbox.** Found live-testing the (separately-built, see below) redesigned UI in a real browser, not by reading code:
- `app/app/queue-view.tsx`: `toLocaleDateString(undefined, ...)` used whatever locale the server/browser happened to have, so SSR and client output could disagree — React threw a hydration error and silently regenerated the whole tree client-side, which was eating the first click on any button on the page. Fixed by pinning `"en-US"` explicitly.
- `app/app/globals.css`: the payee-approval confirm checkbox rendered broken (first stacked above its label, then stretched full-width with a text-input background/padding). Root cause: `.payee-form label`/`.payee-form input` (two-class-plus-element specificity) beat `.confirm-row`'s own styling (one class) regardless of source order in the CSS. Fixed by scoping the checkbox out of those generic rules with `.payee-form label.confirm-row` / `.payee-form .confirm-row input`.

**Commit 2 — `c24ed37` Make Sync now / Pause syncing real, fold reconciliation into Sync now.**
- "Sync now" and "Paused" were hardcoded `disabled` buttons — pure decoration, matching the design mockup literally but not functionally. `worker/src/sync.ts` (new) extracts the ingest-once logic already in `worker/src/index.ts`'s poll loop into a reusable `syncOnce()`. `worker/src/sync-once-cli.ts` (new) is a standalone entrypoint that runs `syncOnce()` **and** `reconcileStuckPayments()` — run as a separate `tsx` process via `execFile` from `app/app/actions.ts`'s new `syncNowAction`, not imported in-process. **Why a separate process, not a direct import:** `sync.ts` needs `gmail.ts`, which imports the Composio SDK (`@composio/core`) — bundling that into the Next.js app's server-action bundle broke Turbopack's module resolution (`Module not found: Can't resolve './gmail.js'`, even though the file plainly exists). Spawning a subprocess keeps that dependency entirely out of the app build. This cost real debugging time — see "Turbopack import-extension gotcha" below, it will bite again if not read.
- `worker/src/sync-state.ts` (new) holds just the `paused` boolean read/write, split out from `sync.ts` specifically because it has **no** Gmail/Composio dependency and so *can* be imported directly into the app (`app/app/page.tsx`, `app/app/actions.ts`) without the bundling problem above.
- `packages/db/prisma/schema.prisma` + migration `20260831060216_add_sync_paused`: `IngestCheckpoint` gains a `paused Boolean @default(false)` column — the worker's poll loop (`worker/src/index.ts`) checks it before every Gmail fetch; reconciliation still runs regardless (resolving payments already in flight is a different concern from starting new ingestion).
- Folded `reconcileStuckPayments()` into `sync-once-cli.ts` too, so "Sync now" is a genuine one-click refresh of everything — previously it would only have fetched mail, not re-checked stuck payments, even though the button implied "refresh."
- `app/app/payment-cell.tsx` / `globals.css`: softened the `unknown_outcome` pill's copy. When RazorpayX's own last-known status is `processing`/`queued` (checked via a regex on `lastError`), shows a calm sage "Still processing at RazorpayX — no action needed yet" instead of the alarming terracotta "Uncertain — check before retrying." **This never changes what status is stored or displayed as fact** — it's still `unknown_outcome` in the DB, never silently promoted to `paid`; only the wording changes for the specific case that's expected/benign (see next paragraph) rather than a real problem.
- **Root cause of "why does RazorpayX just say processing forever," confirmed against RazorpayX's own docs (`razorpay.com` → Test Mode page, fetched live in-browser this session):** test-mode payouts do not auto-resolve. Quoting their docs: *"From the processing state, you will have to manually move the payout to the next state from the Dashboard... Unlike Live Mode, this does not happen automatically."* This is not a bug anywhere in this codebase — it requires a manual click on the RazorpayX dashboard (Payouts → open the payout → advance its state) to ever see a test payout resolve. Not yet walked through live with the user; flagged as a next step below.
- `worker/src/payment-execution.ts` and `worker/src/payment-executor-select.ts` (both new): extracted the claim/execute/classify-outcome logic and the RazorpayX-vs-Perflo executor-selection logic out of `app/app/actions.ts`'s `confirmPayment`/`payViaConfiguredExecutor` into shared worker modules. Pure refactor, no behavior change — done specifically so the new auto-pay path (commit 3) could reuse the *exact* same execution logic as the manual "Confirm & pay" button, rather than risking the two paths drifting apart on what counts as paid/failed/unknown (FR-27).

**Commit 3 — `efa1b5e` Add per-payee auto-pay opt-in, gated by every existing guardrail.** The user explicitly asked for this — "when a mail comes, execute automatically if the payee is under guardrail limit and amount matches invoice, like Perflo's own auto-pay." Implemented as **two independent off-by-default switches**, not one:
1. A **per-payee toggle** (`Payee.autoPayEnabled`, new column, migration `20260831063322_add_payee_auto_pay_enabled`) — UI toggle on the Payees page (`app/app/payees/page.tsx`, `app/app/payee-actions.ts`'s `toggleAutoPayAction`).
2. A **deployment-wide kill switch** (`AUTO_PAY_MODE=on` env var, unset/anything else = off) — checked in `worker/src/level1-pipeline.ts` and passed through to `worker/src/auto-pay-gate.ts` (an already-built-and-tested-but-never-wired-in gate from an earlier session — found by grepping for `AUTO_PAY_MODE`, which a code comment in `policy-engine.ts` already referenced).

Both must be true for a given payee, **and** the existing policy engine (`worker/src/policy-engine.ts`) must return its `auto_pay` decision, which itself requires **every** existing check to already pass cleanly: ≥90% confidence on every extracted field (payee name, amount, payment method, reference number, currency), the payee resolver's exact `resolved` status (sender + rail both exactly match a known payee, not just close), aligned sender auth (DMARC or SPF+DKIM), a verifier score ≥80, no duplicate, and now — newly wired this session — a real, non-expired grant with room under both the per-payment cap and the running total-cap/max-payments usage (previously these were hardcoded to always-false specifically to force `needs_approval`, per a comment removed this session: *"Grant management and automatic execution are deliberately not wired during KYC pending/dry-run mode"*). One weak signal anywhere and it falls back to the existing manual review queue exactly as before — nothing about the manual path changed.

Key files, what each does and why it's shaped that way:
- `worker/src/auto-pay-eligibility.ts` (new) — pure functions: `computeGrantStatus()` (active/not-expired/per-payment-cap/remaining-amount/remaining-count from a payee's static grant terms + usage-so-far) and `amountWithinOwnerCeiling()` (a second, optional, deployment-wide ceiling via `AUTO_PAY_MAX_AMOUNT_INR` env var, on top of — not instead of — each payee's own cap; unset means no extra ceiling). Kept pure/DB-free on purpose, same reasoning as the rest of Level 1.
- `worker/src/payment-usage.ts` (new) — the one DB read: sums `amount` and counts rows from `PaymentIntent` where `status = "paid"` for a given `recipientNickname`, so total-cap/max-payments checks reflect what's actually been paid, not just prepared.
- `worker/src/level1-pipeline.ts` — now looks up the resolved payee's static grant terms (already available in `approvedPayees`, extended below) plus live usage (via an injected `loadPayeeUsage` dependency, defaulting to "nothing used yet" for existing tests that don't care about this axis — same pattern as the existing injected `extract` dependency, so this file stays testable without Postgres).
- `worker/src/payee-resolver.ts` / `worker/src/payee-store.ts` — `ApprovedPayee` gained a `grant` object (`autoPayEnabled`, `payeeStatus`, `perPaymentCapInr`, `totalCapInr`, `maxPayments`, `expiresAt`) so this data is available where the resolver already runs, without a second query. `payeeStatus` matters because `loadApprovedPayees` only ever filtered on `grantApproved: true`, not `status` — a payee could theoretically be `grantApproved: true` but `status: "revoked"` (seen in `demo-payees.ts`'s `revoked` spec) and would still resolve for *manual* review today (a pre-existing gap, not introduced this session, not fixed — only newly relevant because auto-pay's `grant.active` check now explicitly requires `payeeStatus === "approved"`).
- `worker/src/policy-engine.ts` — added an **optional** `payeeAutoPayEnabled?: boolean` field to `PolicyInput` (defaults to `true` if omitted, so none of the ~60 existing test call sites needed updating) and one new reason string ("Auto-pay is not enabled for this payee.") when it's explicitly `false`.
- `worker/src/auto-pay-runner.ts` (new) — the one place that turns an `auto_pay` decision into an actual payment. Deliberately mirrors the existing manual flow rather than inventing a new path: creates the same `PaymentIntent` shape a human's "Prepare payment" click would (using the resolved payee's nickname and the extractor's amount — **never** anything from the email's free text directly, preserving the existing "locked" money-safety design documented elsewhere in this file), then claims and pays through `executePreparedPayment` (the same function "Confirm & pay" now calls, from commit 2's refactor). Wrapped in its own try/catch — a failed or uncertain auto-pay attempt is not a crash-the-ingest-batch event, it's exactly the case the existing Failed/Uncertain pills already handle, and gets logged, not thrown.
- `worker/src/ingest.ts` — after Level 1 writes `policyDecision` to the email row, if it's `"auto_pay"` and the payee resolved and an amount was extracted, calls `runAutoPayIfEligible()`.

**Not yet done for auto-pay:** `AUTO_PAY_MODE` is not set anywhere (so the global switch is off by default in every environment right now — verify this stays true before any public deploy); no payee currently has `autoPayEnabled: true` in the local DB; no end-to-end live test of an email actually triggering an automatic payment has been run yet (only the toggle UI and the DB flag were verified working). **This is the single highest-blast-radius change in the repo — read the full gating chain above before touching any of these files, and do not weaken any of the checks without the user's explicit, specific sign-off on that exact check.**

### The UI redesign itself (built by a separate session, not this one)

Between the last documented session and this one, a **separate AI session** implemented a full visual redesign (the "Organic" design system: cream ground, terracotta/sage accents, Caprasimo+Figtree fonts, pill buttons, 16px+ radii) from a design handoff bundle (`design_handoff_ap_agent_ui/`), committed as `c6783f0`. This session's job was to **verify** that work (not redo it), which is how the hydration and checkbox bugs above were found — by actually driving the redesigned UI in a real browser and comparing against the design's reference screenshots, not by reading the diff.

### Turbopack import-extension gotcha — read before adding any new worker/src file that the app imports

Two related but distinct rules, both confirmed by hitting real build errors this session:
1. **A `.js`-extensioned *value* import breaks Turbopack** when the importing file is pulled into the Next.js app's server bundle, even though the target file plainly exists and the identical import works fine under `tsx`/Node ESM (which requires the `.js` suffix per `worker/tsconfig.json`'s `moduleResolution: "bundler"` — actually lenient, but `tsx` itself wants it). This bit `worker/src/gmail.ts` (imported into `sync.ts`, imported into `payment-execution.ts`, imported into `app/app/actions.ts` — see commit 2 above for why that specific chain is avoided now) and was fixed generally in this session's new files (`payment-execution.ts`, `payment-executor-select.ts`) by using **extensionless** relative imports (`"./manual-pay"`, not `"./manual-pay.js"`) for every file reachable from the app. This matches the convention already established in `payee-store.ts` et al. (see the note on this same gotcha lower in this file, under "Payees management").
2. **`import type` is exempt** — fully erased before bundling, so a `.js`-extensioned type-only import never triggers this.
3. **The actual fix for the Gmail/Composio SDK problem specifically was not "drop the extension"** — `gmail.ts` itself is fine either way; the real fix was to never let anything that transitively imports `gmail.ts` (i.e. `sync.ts`, `ingest.ts`) be imported *in-process* by the app at all. `sync-once-cli.ts` runs as a separate spawned process specifically to route around this, not just to work around the extension issue.

**Rule of thumb for the next session:** any new `worker/src/*.ts` file gets extensionless relative imports **unless** it's only ever run via `tsx`/`pnpm worker`/a CLI script (never imported by anything under `app/app/`) — those keep the `.js` suffix. If unsure, grep whether the file (or anything that imports it) is reachable from `app/app/actions.ts` or `app/app/page.tsx`.

### Verification this session

- `pnpm typecheck`: clean throughout.
- `pnpm vitest run`: 266/267 (same single pre-existing failure as last session — see "Current outcome" below, unrelated to anything built this session). **One new, real source of flakiness found and confirmed not a regression:** running the full suite with default parallelism can produce up to 4 additional failures from multiple integration test files racing on the same hardcoded `"riya@okaxis"` VPA fixture (a shared Postgres unique-constraint collision across files run in different workers) — confirmed by re-running with `pnpm vitest run --no-file-parallelism`, which reproduces the exact 266/267 baseline every time. Not caused by this session; pre-existing test-isolation gap between `payee-store.integration.test.ts` and `demo-scenarios.integration.test.ts`/`demo-payees.ts` sharing fixture data. **If a future run shows more than the one known failure, re-run with `--no-file-parallelism` before concluding anything is actually broken.**
- Manually verified in the live browser (not just typecheck/tests): the hydration fix (no more hydration console error across repeated navigations), the checkbox fix (renders inline, not stacked/stretched), Sync now (clicked it, confirmed the DB `ingest_checkpoint.updated_at` timestamp moved and the child process exited cleanly with no lingering PID), Pause syncing (clicked it, confirmed `ingest_checkpoint.paused` flips in Postgres and persists across reload, and that "Sync now" correctly disables itself while paused), the auto-pay toggle UI (added a real payee, clicked "Turn on," confirmed `payees.auto_pay_enabled = true` in Postgres). **Not yet verified live:** an actual email triggering an actual automatic payment end-to-end (would need `AUTO_PAY_MODE=on`, a payee with `autoPayEnabled: true`, and a fresh invoice matching that payee exactly — deliberately not set up this session, since flipping the global switch on is a real decision, not a verification step to do casually).

## Next steps as of this session (read before the older "Next steps" section below — that one is from the prior session and partly stale)

1. **Open a PR for this branch's new commits** (`25c8de3`, `c24ed37`, `efa1b5e`) and resolve the divergence from `main` noted in the header warning above — `main` has 3 newer Level 0 commits this branch doesn't have.
2. **Walk through the RazorpayX dashboard's manual "advance to next state" button live with the user** — discussed and explained (see "Root cause..." above) but not actually done together yet; was offered at the end of this session.
3. **No login/auth on the app** — unchanged from before, still needed before any public deploy link.
4. **Auto-pay is built but not live-tested end-to-end** — see the auto-pay section above for exactly what's missing (turning `AUTO_PAY_MODE=on`, enabling a payee, sending a matching invoice, and watching it actually execute). Do this deliberately, not accidentally, and confirm with the user first.
5. **Independent review of the auto-pay execution path specifically** — this is new, high-stakes, and only self-reviewed + partially live-tested (the toggle, not the execution) so far. Higher priority than the general "independent review" item below, given the blast radius.
6. **`AUTO_PAY_MAX_AMOUNT_INR`** (the optional extra deployment-wide ceiling on top of each payee's own cap) is not documented in `.env.example` yet as of this edit — added below in the same pass as this doc update; verify it's actually there.
7. Everything in the older "Next steps" list below that's still unaddressed: payment-completion notification, `EXTRACTOR_MODE=llm` test-timeout fix, dedicated Gmail test mailbox, Railway deploy, Perflo KYC (still fully external-blocked).

## Session summary — 2026-08-31, PR #5 (merged) + PR #6 (open)

This session picked up right after PR #4 merged, and did five things, in order:

**1. Closed the "payment stuck forever" gap identified at session start.** `getPayoutStatus()` existed on the `PaymentExecutor` interface but nothing ever called it, and the RazorpayX adapter discarded its own payout reference on every outcome except success — so a payment that landed at `unknown_outcome` had no id to ever look up again, and a clean pre-payout error (e.g. a bad IFSC on a payee's saved bank details) was misclassified as `unknown_outcome` (never-auto-retry) instead of `failed` (safe to retry). Three fixes, in `worker/src/payment-executor-razorpay.ts`, `payment-executor.ts`, `payment-executor-adapter.ts`, and `app/app/actions.ts`:
   - Set `reference_id` on payout creation (RazorpayX's own field for finding a payout later by a value we already have) and thread `providerReference` through `PaymentDefiniteFailure`/`PaymentUnknownOutcomeError` so it gets persisted on **every** outcome, not just success.
   - Split the RazorpayX call into a Contact→FundAccount stage and a separate Payout stage: any failure in the first, or a *definite* rejection response in the second, is now `failed` (retriable); only a genuine network failure with no response on the payout call itself stays `unknown_outcome`.
   - Added `worker/src/payment-reconcile.ts` — `reconcileStuckPayments()`, wired into the existing `pollOnce()` loop in `worker/src/index.ts` (runs every `POLL_INTERVAL_SECONDS`, alongside Gmail ingest). Finds any `unknown_outcome` row with a real provider reference, asks RazorpayX what actually happened via `getPayoutStatus()`, and resolves it to `paid`/`failed`. Never creates a new payout — read-only, FR-27-safe. Deliberately does **not** cover a `claimed` row with no reference at all (the process crashed before `createPayout` ever returned) — that needs a lookup-by-`reference_id` capability `getPayoutStatus` doesn't have; documented as a known gap in `payment-reconcile.ts`'s own header comment, not built.
   - All verified against the real local Postgres **and** a live RazorpayX test-mode sandbox, not just mocks: a bad-IFSC payment now lands at `failed` with a working Retry button (previously stuck at `unknown_outcome` forever); a genuinely in-flight payout's real reference is now saved and re-checked automatically by the background worker.

**2. Fixed two real bugs found only by driving the actual browser, not by reading code.**
   - A hydration mismatch on the queue's date column (`toLocaleDateString(undefined, ...)` — server and browser locale differ) that was silently swallowing button clicks (Confirm & pay, Retry) until the page was manually reloaded. Fixed by pinning an explicit locale.
   - `confirmPayment` recorded a failure to the `PaymentIntent` row correctly, then re-threw the same error anyway — and since the payment `<form>` has no client-side error handling, this crashed the whole page with Next.js's raw dev/runtime error overlay instead of showing the queue's own "Failed" pill (reproduced live: a nickname with no approved payee rail). Fixed by only logging server-side the one case that has nothing recorded to show (the row was never actually claimed).

**3. Added a RazorpayX account-balance display** (`worker/src/razorpay-balance.ts`, wired into `app/app/page.tsx`) — a stuck payout's own error is often just "insufficient balance" with no number attached, so the owner had to go check the RazorpayX dashboard separately. Fetches `/v1/banking_balances` (confirmed against RazorpayX's docs — **not** `/v1/balance`) for the configured account, shown above the queue, flagged amber at/below zero. Read-only; degrades to showing nothing on any error.

**4. Removed the "Level 1 — review-only" banner from the UI** at the user's request, and confirmed the LLM classification/extraction path (`CLASSIFIER_MODE=llm`/`EXTRACTOR_MODE=llm`) actually works end-to-end against real OpenAI calls, not just the rule-based fallback — verified live by inserting one fresh dummy invoice through the exact same code path the real worker uses and confirming `extractionBackend: "llm"` with a real, high-confidence result.

**5. The queue UI itself was redesigned by a separate session mid-branch** (KPI-style status counts, filter tabs, two-step Prepare→Confirm cards instead of one flat 50-row table) — `app/app/page.tsx`, `app/app/queue-view.tsx`, `app/app/payment-cell.tsx`, `app/app/globals.css`. This session built on top of it (the balance display and banner removal above) rather than redoing it; see "Files changed this session" below for the exact file list.

**Deployment guidance given, not yet acted on**: Railway (or Render) recommended over Vercel-only (the background worker is a persistent `setInterval` process — Vercel functions can't run that) and over Cloudflare Workers (would need rewriting the worker into stateless scheduled invocations, plus unverified Prisma/OpenAI-SDK compatibility with Cloudflare's runtime — real rework, not a deploy option). Gmail auth for a deployed worker needs no new setup: Composio owns the OAuth session server-side, keyed by `COMPOSIO_API_KEY` — the same key on the deployed worker sees the same already-connected inbox.

## Session summary — 2026-08-30, PR #4

This session did three things, in order:

**1. Verified the prior handoff instead of trusting it.** Re-ran `pnpm test` (227/227 → later 253/253 as new tests were added), `pnpm typecheck`, and `prisma migrate status` against the actual code before acting on anything the previous handoff claimed. Everything it claimed held up.

**2. Ran the full edge-case review pass** (`pnpm demo:payees --reset --reseed`, `pnpm demo:inbox --reset --reseed`) — the task the previous handoff named as next. All 23 demo scenarios (see `pnpm demo:inbox --list`) were checked against the policy engine's actual decision for each, by querying the `emails` table directly (`policy_decision`, `policy_reasons`, `classification`). Every scenario routed exactly as its name promises: `changed-upi`/`changed-bank` → `needs_approval` via `details_changed`; `lookalike-domain`/`remote-links`/`prompt-injection`/`conflicting-sender-rail` → `quarantine`; `missing-amount`/`missing-currency`/`unsupported-currency`/PDF-based scenarios → `needs_approval` with accurate low-confidence reasons (never silently dropped); `exact-duplicate-replay` → `ignore` as a duplicate. **No code changes were needed from this pass** — see "A verification lesson from this session" for why an initial run looked broken and wasn't.

**3. Built a pluggable payment-executor layer** (the user's own idea, refined mid-session): instead of waiting on Perflo KYC, made the payment-execution step swappable so the same reviewed decision can pay out through Perflo *or* RazorpayX (test mode), decided at runtime by which env vars are set. A second AI's review of the initial plan added an important correction (kept in the design): this only ever calls a *regulated provider's* payout API from an account the owner controls — it must never accept, pool, or hold third-party funds itself (that's PPI/escrow territory under RBI rules, explicitly out of scope). The RazorpayX adapter was then verified field-by-field against `razorpay.com/docs/api/x/` in-browser, which caught two real bugs before they'd have hit a live account: a missing required `account_number` (the source account being debited, distinct from the recipient's own bank/UPI details) and a nonexistent `failure_reason` response field (the real field is `status_details.description`). Both are fixed. The adapter also now refuses non-INR requests up front, since RazorpayX's documented payout endpoints only support INR.

### A verification lesson from this session (read this before trusting any local run)

Partway through the edge-case pass, Docker's Postgres container crashed independently of anything in this repo, and a live background `pnpm worker` process (polling a **dedicated Gmail test mailbox**, confirmed intentional and safe — not the owner's real inbox) kept re-touching the same local database while it was flapping. This produced a first read of the demo data that looked exactly like a real classifier bug (several invoice scenarios appearing to silently route to `ignore` instead of `needs_approval`). After Docker was restarted and the demo tables were cleanly reset (`--reset --reseed`, not just `--reseed`), the exact same scenarios routed correctly. **The lesson, not just the anecdote:** when local Postgres and/or a live background worker have both been touching the same demo tables, do a clean `--reset --reseed` (both payees and inbox) before drawing any conclusion from what's in the database — a partial/stale reseed looks identical to a real regression until you rule it out.

## Files changed this session (payment-executor)

- `worker/src/payment-executor.ts` — the interface: `createPayout`/`getPayoutStatus`, integer minor units (never decimal), `processing`/`paid`/`failed`/`unknown` as first-class statuses, one idempotency key reused per logical payout. Also exports `PaymentUnknownOutcomeError`/`PaymentDefiniteFailure`, the provider-neutral counterparts to `perflo-cli.ts`'s existing Perflo-specific error classes.
- `worker/src/payment-executor-razorpay.ts` and `.test.ts` — RazorpayX sandbox adapter (Contact → Fund Account → Payout), doc-verified. Needs a `keyId`, `keySecret`, and `accountNumber` (RazorpayX source account, **not** the recipient's account) to construct.
- `worker/src/payment-executor-perflo.ts` and `.test.ts` — wraps the existing `payViaPerfloCli` as the same interface; no behavior change to the underlying CLI call.
- `worker/src/payment-amount.ts`, `payment-executor-destination.ts`, `payment-executor-adapter.ts` (+ `.test.ts` each) — small pure helpers: decimal-string↔minor-units conversion, `PaymentMethod`→`PayoutDestination` mapping, and bridging a `PayoutResult` back to the older throw-based `payRecipient` contract `manual-pay.ts` still uses.
- `app/app/actions.ts` — `confirmPayment` now calls `payViaConfiguredExecutor`, which picks Razorpay only when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_ACCOUNT_NUMBER` are all set, resolving the payee's rail via `loadApprovedPayees` matched by nickname; unset (the default) is byte-for-byte today's Perflo path.
- `.env.example` — documents the three Razorpay test-mode-only env vars.
- `worker/src/demo-inbox.ts`, `demo-payees.ts`, `demo-scenarios.integration.test.ts`, `classifier.ts`, `ingest.ts`, `level1-pipeline.ts` — pre-existing uncommitted changes from the prior session (the `loadApprovedPayees` wiring fix and `conflicting-sender-rail` scenario), committed together with this session's work since they were sitting in the same working tree.

## Next steps (in order)

1. **Merge PR #6**, or address review feedback on it — it's the only unmerged change on this branch (see header).
2. **No login/auth on the app** (see item 6 above) — needs a fix (host-level password gate is the fastest option) before any public/founder-facing deploy link goes out.
3. **Independent review of the payment-reconciliation work** (item 1 in this session's summary) — everything was self-reviewed and live-tested this session, but per `.claude/skills/payment-review`'s own rule, self-review has a structural blind spot; a separate pass should read the actual diff before this is trusted long-term.
4. **RazorpayX Test Mode balance**: confirmed live this session that the account balance can be healthy while a specific already-queued payout still reports "insufficient balance" from before the top-up — looks like a RazorpayX sandbox quirk (queued payouts may need a manual retry from their dashboard, not just a balance top-up). Not something fixable from this codebase; worth confirming directly with Razorpay if it recurs.
5. **Deploy to Railway** (guidance given this session, not yet executed) — web + worker + Postgres as three services from this repo; set `RAZORPAY_*` (test keys only), `COMPOSIO_API_KEY`, `OPENAI_API_KEY`, `PAYEE_ENCRYPTION_KEY`/`PAYEE_HASH_KEY`, `DATABASE_URL` on the host.
6. **Payment-completion notification** — currently the owner/founder has to reload the page and look; there's no push notification (email/Slack/toast) when a payment clears. Discussed, not built; ask before starting since it's a new feature, not a bug fix.
7. **Fix `demo-inbox.ts`'s seed deps to force deterministic extraction, not just classification** — see "Current outcome" below for the exact failure this causes today (`demo-scenarios.integration.test.ts` times out) whenever `EXTRACTOR_MODE=llm` is set in `.env`. Small, isolated fix; not done yet because it was only just discovered while updating this doc.
8. **Dedicated Gmail test mailbox for real ingestion validation** — still not done as of this handoff; the live `pnpm worker` process observed in an earlier session was already pointed at one (confirmed by the user), but that setup itself isn't documented anywhere in this repo yet. Document it once confirmed stable.
9. **Only after Perflo KYC clears**: connect Perflo for real, verify identity, reconcile one small manual payment — unchanged from before, still fully blocked externally.

## What should be reviewed later

- The `payViaConfiguredExecutor` destination-resolution logic in `app/app/actions.ts` (matches by `recipientNickname` string, not a real FK — inherits the pre-existing `PaymentIntent`↔`Payee` gap documented earlier in this file under "Two relationships are deliberately not real foreign keys"). If that gap ever gets closed, this lookup should be revisited too.
- Whether `PaymentIntent`'s schema should grow a `processing` status to match the new `PaymentExecutor` interface's status vocabulary — currently `processing` collapses to `unknown_outcome` in `payoutResultToLegacyPayResult` (see that file's comment) because the existing schema has no representation for "in flight."
- A Stripe adapter, if USD/international payouts become a real requirement — deliberately not started; RazorpayX's payout model doesn't generalize to it, per the second AI's review captured in this session (see PR #4's description).
- **Webhook-based reconciliation for RazorpayX payouts** — deliberately deferred until this app is deployed with a public URL (RazorpayX needs somewhere to send the webhook). Polling (`payment-reconcile.ts`, see this session's summary above) is the reliability backstop in the meantime and stays useful even once a webhook exists — RazorpayX itself only retries failed webhook delivery for 24h before disabling it, so poll-as-backstop is the standard shape here, not a stopgap to delete later.
- **Reconciling a `claimed` row with no saved reference at all** (the process crashed before `createPayout` ever returned a result) — `payment-reconcile.ts` explicitly does not cover this; would need a lookup-by-`reference_id` capability added to `getPayoutStatus`'s contract. Not built because it hasn't actually been observed, only reasoned about.
- **No login/auth on the Next.js app at all** — see item 6 in "Read this first" above. Whoever deploys this needs to either add real auth or rely on host-level URL protection; do not treat "no one else has the link yet" as a substitute.

## Current outcome

Level 0 is complete and Level 1 is implemented in **review-only/dry-run mode** — the UI no longer displays a "Level 1 — review-only" banner (removed this session per the user's request), but the underlying behavior is unchanged: every payment still requires an explicit Prepare → Confirm & pay click, nothing is automatic. The Payees management screen (server actions, rail lifecycle, masking, demo seed) is implemented. The RazorpayX payment path now has real reconciliation (see this session's summary above) instead of a payment being able to get stuck at `unknown_outcome` forever. The project has been independently checked against the current code, PRD, architecture spec, and Yeshu interview notes as of the 2026-08-30 session; this session's own reconciliation/UI work has been self-reviewed and live-tested but not yet independently reviewed by a separate pass (see "Next steps").

The latest successful verification ran against local Postgres, this session:

- `pnpm test`: **267/267 passing** across 43 test files, with `CLASSIFIER_MODE`/`EXTRACTOR_MODE` unset (up from 227/227 across 36 files last session — new coverage for the RazorpayX error-classification fix, `payment-executor-adapter`'s reference threading, `payment-reconcile.ts`, and `razorpay-balance.ts`). **Real gotcha found while verifying this**: with `EXTRACTOR_MODE=llm` set in `.env` (as it was for parts of this session), `demo-scenarios.integration.test.ts`'s unfiltered `seedDemoInbox()` call makes 23 real OpenAI extraction calls (`demo-inbox.ts`'s seed deps hardcode the classifier to deterministic but never overrode the extractor) and reliably times out against vitest's default 5s limit. Not a regression in anything built this session — a pre-existing gap in the demo harness's isolation from env-configured LLM mode, newly triggered now that LLM mode actually gets used. Worth fixing (make the demo seed's extraction deterministic too, matching its own classification), not yet done.
- `pnpm typecheck`: clean
- Manually verified live against a real RazorpayX test-mode sandbox (not just mocks): a bad-IFSC payout now lands at `failed` with a working Retry button; a genuinely in-flight payout's real reference is saved and the background worker's reconciliation loop re-checks it automatically every poll cycle; a nickname with no approved payee now shows a clean inline "Failed" pill instead of crashing the page
- No automatic payment is enabled; `AUTO_PAY_MODE`/`auto_pay` remain a policy label only
- No successful real payment has fully cleared yet in the RazorpayX sandbox — every attempt this session landed at `processing`/`unknown_outcome` for reasons on RazorpayX's own side (insufficient test balance, or a queued payout not re-checking itself after a later top-up), not a bug in this codebase; confirmed by calling RazorpayX's API directly outside of this app's own code
- Real Perflo payment is still blocked on KYC, unchanged from before

KYC is an external dependency, not a reason to stop development. Continue building and demonstrating the review flow without connecting the Perflo agent screen or moving real money through Perflo (RazorpayX test-mode is not real money and is fine to keep exercising).

## Conversation and project-state summary

The project began with Level 0 complete and Level 1 implemented as a review-only/dry-run pipeline. The handoff identified the Queue row review drawer as the next task; that drawer is now implemented and tested.

Testing discussions established that real Gmail messages are not required for deterministic coverage. A local seeded demo inbox/test harness is preferred for edge cases; a dedicated Gmail test mailbox can later validate real Gmail/Composio ingestion. Sending controlled emails from the owner is acceptable only in a separate test mailbox, never as the first production test.

The payee discussion clarified that a payee is an internal domain entity, not a third-party integration. Perflo is the third-party payment integration. The database already models `Payee`, `PayeeIdentity`, and encrypted `PayeePaymentMethod` records. A public payee API is not required for the first single-owner version; protected server actions behind a Payees UI are sufficient. A public API can be added later for multiple clients or users.

The agreed testing sequence is: local seeded scenarios → Payees/rail management → full edge-case review → dedicated Gmail ingestion → Perflo KYC/account verification → one small manual payment with reconciliation. KYC is currently an external blocker, not a blocker for local review work.

## Architecture decisions

The money boundary is deterministic:

```text
Gmail/Composio
  → MIME body + PDF text extraction
  → cheap deterministic junk filter
  → classifier (rule-based by default; LLM opt-in, no tools)
  → payment-detail extractor (deterministic by default; LLM opt-in, strict JSON)
  → exact approved-payee resolver
  → deterministic verifier
  → duplicate detector
  → deterministic policy engine
  → review queue
  → manual Perflo payment only
```

The classifier and extractor can read untrusted email data but have no tools, no browser, and no payment permission. Their JSON is validated again by backend code. Prompt injection, malformed output, network failure, and extractor timeout fall back safely.

Payment identifiers follow one validation boundary. Ordinary addresses such as `billing@gmail.com` are not accepted as UPI VPAs. Approved payee rails are encrypted with AES-GCM and looked up with a keyed HMAC; the derived email review summary stores only rail type/count, not raw rail details.

Level 1 writes a reviewable result to the email row: extraction summary, backend used, payee resolution, verification result, duplicate result, policy decision, reasons, and processing time. It never calls the automatic-pay executor. Missing, uncertain, new, or changed information becomes `needs_approval`; injection or hard verifier failures become `quarantine`; obvious non-payables become `ignore`.

### Payee management is a separate boundary, upstream of the pipeline above

The pipeline above only ever *reads* approved payees (`loadApprovedPayees`) — it never creates or edits one. Payee setup is a second, independent surface with its own boundary:

```text
Payees UI → server action → validation → encryption → database
```

This was a deliberate decision, not an incidental implementation choice, for three reasons:

1. **Keeps the money boundary provably one-directional.** If payee approval lived inside the email pipeline, an attacker who could influence classification/extraction output would be one bug away from also influencing who counts as an approved payee. Splitting them means the pipeline can only match against *already-owner-approved* rails; it can never mint a new one.
2. **`approvePayee`'s Perflo calls are still local placeholders, not real ones.** `createPerfloRecipient`/`enablePerfloGrant` (now really implemented in `worker/src/payee-approval-deps.ts`, replacing the test-only mocks that were the *only* implementation before) generate a nickname/grant id locally instead of calling Perflo. This lets the whole Payees screen — creation, replace, revoke, masking, grant caps — be built, tested, and demoed **before** KYC clears, without pretending a real Perflo connection exists. Whoever connects Perflo for real must replace these two functions, not add a new deps object; `approvePayee` itself and everything downstream of it already assumes exactly this shape.
3. **Rails are versioned, not overwritten.** `PayeePaymentMethod` now carries `status`/`createdAt`/`replacedAt`/`revokedAt`/`replacedByMethodId` (new columns — see migration below) specifically so a changed or revoked rail is a new row, not a mutated one. `loadApprovedPayees` filters to `status: "active"` — this is *why* a revoked rail stops resolving invoices, and why a "changed rail" naturally produces `details_changed` → `needs_approval` in the existing policy engine rather than requiring a new rule there.

### Table relationships

```mermaid
erDiagram
    Payee ||--o{ PayeeIdentity : "owns"
    Payee ||--o{ PayeePaymentMethod : "owns"
    Payee ||--o| PaymentIntent : "referenced by nickname, not FK"
    Email ||--o| PaymentIntent : "1 email : 1 intent (unique email_id)"
    PayeePaymentMethod ||--o| PayeePaymentMethod : "replacedByMethodId (self, old -> new)"

    Payee {
        string id PK
        string name
        string recipientNickname "local placeholder, no real Perflo id yet"
        boolean grantApproved
        string status "pending | approved | revoked"
        string grantPerPaymentCapInr
        string grantTotalCapInr
        int grantMaxPayments
        datetime grantExpiresAt
        datetime approvedAt
        datetime revokedAt
    }
    PayeeIdentity {
        string id PK
        string payeeId FK
        string senderAddr UK "one address, one payee"
    }
    PayeePaymentMethod {
        string id PK
        string payeeId FK
        string rail "upi | bank_neft"
        bytes encryptedPayload "AES-256-GCM"
        string lookupHash UK "HMAC-SHA256, keyed separately"
        string status "active | replaced | revoked"
        string replacedByMethodId "self-FK, nullable"
    }
    Email {
        string id PK
        string resolvedPayeeId "no real FK - set from resolver result"
        json payeeResolution
        json verificationResult
        string policyDecision
    }
    PaymentIntent {
        string id PK
        string emailId FK "unique - one intent per email"
        string recipientNickname "string copy, not a Payee FK"
        string status "pending|claimed|paid|failed|unknown_outcome"
    }
```

Two relationships are deliberately **not** real foreign keys, and that gap is load-bearing, not an oversight:

- `Email.resolvedPayeeId` and `Email.payeeResolution` are set by copying `resolvePayee`'s pure-function result at Level 1 processing time — they describe what the resolver *concluded that run*, not a live join to `Payee`. If a payee is edited after an email was processed, the old email's stored resolution does not retroactively change; only a fresh run (`retryReviewProcessing` / `retryLevel1Processing`) re-resolves it against the current payee state.
- `PaymentIntent.recipientNickname` is a plain string, not a foreign key to `Payee.recipientNickname`. `PaymentIntent` (Level 0's "locked manual pay") and `Payee` (Level 1's payee registry) were built as two independent, not-yet-merged systems — see the `payment_intents` model comment in `schema.prisma` ("a real payee/grant/idempotency-key system... waits for domain-modeling; this is deliberately the small version"). Today a manual payment's recipient nickname is typed by the owner at prepare time; it happens to often match an approved `Payee.recipientNickname`, but nothing enforces that. Wiring `PaymentIntent` to actually require and reference an approved `Payee` is explicitly unfinished work, not yet started.

### Current flow, with KYC still pending

Testing right now is entirely local: one local Postgres instance, seeded demo data (`demo:inbox` / `demo:payees`), and the deterministic classifier/extractor path (an LLM backend is opt-in via `CLASSIFIER_MODE=llm`/`EXTRACTOR_MODE=llm`, only used for local comparison runs so far — no live Gmail traffic has gone through it). Nothing below reaches Perflo's real API:

```mermaid
flowchart TD
    subgraph today["Live today — no KYC required"]
        DEMO["demo:inbox / demo:payees\n(seeded fixtures)"] --> PIPE["Level 1 pipeline\nclassify -> extract -> resolve -> verify -> duplicate -> policy"]
        PIPE --> QUEUE["Queue + review drawer\n(review-only, all decisions land as needs_approval/quarantine/ignore)"]
        PAYUI["Payees UI (/payees)"] -->|"create / replace / revoke"| PAYACT["payee-actions.ts\nvalidate -> encrypt -> DB"]
        PAYACT --> APPROVE["approvePayee()"]
        APPROVE --> LOCAL["Local placeholder recipient + grant id\n(worker/src/payee-approval-deps.ts)"]
        LOCAL --> PAYEEDB[("payees / payee_identities\n/ payee_payment_methods")]
        PIPE -.reads via loadApprovedPayees.-> PAYEEDB
    end

    subgraph blocked["Blocked until KYC clears"]
        QUEUE -->|"owner clicks Confirm pay\n(Level 0 manual path, separate from Payee registry)"| MANUAL["manual-pay.ts -> perflo-cli.ts"]
        MANUAL -.->|"real network call"| PERFLO["Perflo API\n(NOT reachable - no verified account yet)"]
        LOCAL -.->|"would be replaced with"| REALPERFLO["createPerfloRecipient / enablePerfloGrant\nreal Perflo calls"]
    end

    style blocked fill:#fff0ee,stroke:#a63d32
    style today fill:#eefaf6,stroke:#245e53
```

In plain terms: the Payees screen, the encrypted rail storage, and the whole review pipeline are real and fully testable end-to-end locally — none of it needs Perflo. The only two things actually gated on KYC are (1) `createPerfloRecipient`/`enablePerfloGrant` becoming real calls instead of local placeholders, and (2) the existing manual "Confirm pay" button in the Queue actually reaching Perflo's API instead of failing at connect/login. Everything else — payee creation, rail replace/revoke, resolution, verification, duplicate detection, policy decisions — already runs against real logic and a real (local) database, just never against real money or a real Perflo account. When KYC clears, the work is exactly the two items above, not a rebuild of anything documented here.

## What is complete

- Gmail ingestion, MIME parsing, HTML/plaintext/multipart handling, and restart-safe checkpoint.
- PDF attachment fetch and text extraction with attachment count/size limits.
- Deterministic junk pre-filter for newsletters, calendar messages, and known receipts.
- Six-way classifier: invoice, payment request, reminder, receipt, statement, unrelated.
- Classifier prompt-injection protection, including escaped delimiters, Unicode smuggling, role directives, and exfiltration wording.
- Deterministic extractor for payee, amount/currency, invoice reference, issue/due dates, UPI, and bank details.
- LLM extractor with strict structured output validation and timeout fallback.
- Approved payee model, encrypted payment-method storage, shared rail validation, and real Postgres loader.
- Payee resolver for exact sender/rail matches, new payees, changed details, unknown senders, conflicts, and multiple rails.
- Verifier for authentication alignment, reply-to mismatch, lookalike domains, link mismatch, injection, and rail mismatch.
- Duplicate detector, policy engine, per-payee in-process serialization, and safe auto-pay gate. These are not active payment execution paths yet.
- Queue UI now displays pay amount, invoice reference, field confidence, verifier score, authentication state, rail type, warning, duplicate status, and policy reason.
- Queue row review drawer now displays inert original email text, PDF names/status, all extracted fields and confidence, verifier evidence, duplicate references, all policy reasons, processing/review/payment timeline, and safe owner review actions.
- Review actions persist separately from `PaymentIntent`: approve for review, reject, mark not an invoice, or queue review-only reprocessing. They never execute payment.
- PDF metadata records extraction status where ingestion attempted extraction; unsupported, failed, scanned, or unavailable content remains reviewable.
- Pure rendering tests cover the requested English invoice, multi-line PDF, German text, newsletter price, prompt injection, changed UPI, bank details, and duplicate cases. Payee approval tests cover valid UPI/bank rails and invalid rail rejection.
- Payees management screen: add/list payees with grant caps and expiry, masked rail display, inline form validation mirroring `approvePayee`'s own rules, and explicit-confirmation replace/revoke flows. Replacing or revoking a rail never deletes history — it stamps status/timestamps. A revoked rail can no longer resolve an invoice.
- Real (Postgres-backed) `ApprovePayeeDeps` implementation — the first one; previously only test mocks existed. Perflo recipient/grant creation stays a local placeholder pending KYC.
- Local demo payees (`worker/src/demo-payees.ts`) pairing with the existing demo inbox (`worker/src/demo-inbox.ts`), covering all 9 requested scenarios: normal UPI, bank/NEFT, multiple rails, changed UPI, changed bank account, unknown sender, conflicting sender/rail, revoked rail, and duplicate invoice.
- Small commits cover validation, LLM extraction, encrypted payee loading, pipeline persistence, queue UI, the review drawer, and payee management.
- RazorpayX payout reference capture on every outcome (paid/failed/unknown), not just success — see this session's summary.
- Correct `failed` vs. `unknown_outcome` classification for RazorpayX payouts: a definite pre-payout or provider-rejected error is `failed` (retriable); only a genuine network failure with no response stays `unknown_outcome`.
- Automated reconciliation poller (`payment-reconcile.ts`) running inside the existing worker loop — resolves any `unknown_outcome` payment with a real reference once RazorpayX confirms paid/failed, with no manual action needed.
- RazorpayX account-balance display on the queue dashboard, flagged when at/below zero.
- Redesigned queue dashboard: KPI-style status counts, filter tabs (needs approval / paid / quarantine / all), two-step Prepare→Confirm payment cards replacing the old flat 50-row table.
- `confirmPayment` no longer crashes the page on a recorded payment failure (e.g. an unmatched payee nickname) — shows the same inline "Failed... Retry" pill as any other failure instead.
- Confirmed live that `CLASSIFIER_MODE=llm`/`EXTRACTOR_MODE=llm` genuinely calls OpenAI (not just the rule-based fallback), and that both the classifier and extractor already fall back to the deterministic path automatically on any LLM failure — this was already the design, not something added this session.
- Organic design system implemented (cream/terracotta/sage, Caprasimo+Figtree, pill buttons) across queue, review drawer, and payees screens — built by a separate session, verified/bug-fixed by this one (see this session's summary above).
- Sync now and Pause syncing are real, not decoration — Sync now fetches new mail and re-checks stuck payments in one click; Pause syncing stops the background worker's ingest loop via a real DB flag.
- Per-payee auto-pay opt-in, gated by a deployment-wide `AUTO_PAY_MODE` switch and every existing policy check (confidence, exact resolution, auth alignment, grant caps/expiry) — built and unit-verified this session; not yet live-tested end-to-end (see "Next steps as of this session" above).

## Exact next task

The Payees management screen described below is implemented and tested. **Do not reintroduce it as the next task.** The next task is to move down the agreed testing sequence:

1. Dedicated Gmail test mailbox for real ingestion validation (not the owner's real inbox — see "Do not do" below).
2. Only after KYC clears: connect Perflo, verify identity, and reconcile one small manual payment.

Do not connect the Perflo "Connect an agent" screen or attempt a real payment to continue either of these — both are local-only.

## Files changed and review map (Payees management)

Review these files before extending the payee system further:

- `app/app/payees/page.tsx` — server component; the only place that decrypts a rail, purely to compute a masked display string. Raw plaintext never leaves this function.
- `app/app/payee-form.tsx`, `app/app/payee-rail-row.tsx` — client components; inline validation before submit, explicit confirm-checkbox before replace/revoke (no native `confirm()` dialogs — those aren't reliably testable/automatable).
- `app/app/payee-form-model.ts` and `.test.ts` — pure validation (mirrors `approvePayee`'s own rules per-field) and masking (`maskRailValue`), unit tested with no DB.
- `app/app/payee-actions.ts` and `.test.ts` — the three server actions (`createPayeeAction`, `replaceRailAction`, `revokeRailAction`); structurally asserts it never imports `perflo-cli`/`manual-pay`/`payment-claim`.
- `worker/src/payee-approval-deps.ts` and `.integration.test.ts` — the first real (Postgres-backed) `ApprovePayeeDeps` implementation. `createPerfloRecipient`/`enablePerfloGrant` are **local placeholders** (a slugified nickname, a local grant id) — they deliberately do not call Perflo; KYC is still pending. Replace them for real once Perflo is connected.
- `worker/src/payee-rail-lifecycle.ts` and `.integration.test.ts` — `replacePaymentRail`/`revokePaymentRail`. Replacing creates a new `active` row and marks the old one `replaced` (linked via `replacedByMethodId`); revoking marks `revoked`. Neither ever deletes a row.
- `worker/src/payee-store.ts` — `loadApprovedPayees` now filters `paymentMethods` to `status: "active"` only; a revoked rail can no longer resolve an invoice (see the regression test in `payee-store.integration.test.ts`).
- `worker/src/payee-crypto.ts` — added `toPrismaBytes` (Buffer → Prisma's `Uint8Array<ArrayBuffer>` BYTEA input), shared by every write path instead of each caller reimplementing the conversion.
- `worker/src/demo-payees.ts` — demo payees: normal UPI, bank/NEFT, multiple rails, a payee whose rail collides with another sender's identity (for `identity_method_conflict`), and a payee with a revoked rail. Rail specs are encrypted **inside** `seedDemoPayees()`, not at module load — `PAYEE_ENCRYPTION_KEY` is often overridden by a caller (a test's `beforeEach`) after this module is imported, and import side effects run first.
- `worker/src/demo-inbox.ts` — fixed a real bug: its own `deps` object never wired `loadApprovedPayees`, so "changed-upi"/"unknown-sender"/etc. could never actually resolve against any approved payee. Added a `conflicting-sender-rail` scenario. Run `pnpm demo:inbox --list` for all scenario names.
- `worker/src/demo-scenarios.integration.test.ts` — proves demo payees + demo inbox actually resolve to the status their names promise (this is the regression test for the `loadApprovedPayees` bug above).
- `packages/db/prisma/schema.prisma` + migration `20260830064402_payee_grant_and_rail_lifecycle` — `Payee` gains `status`, `grantPerPaymentCapInr`, `grantTotalCapInr`, `grantMaxPayments`, `grantExpiresAt`, `approvedAt`, `revokedAt`; `PayeePaymentMethod` gains `status`, `createdAt`, `replacedAt`, `revokedAt`, `replacedByMethodId`.
- `package.json` — added `demo:payees` script (`--reset`, `--reseed`).
- `.claude/launch.json` — added so this session's browser tool could preview the app; harmless to keep or delete.

Two Turbopack-specific fixes worth knowing about if this bites again: `import type` is erased and never reaches the bundler, but the value imports (`./payee-crypto.js`, `./payment-method-validation.js`) that several worker files use for real Node/`tsx` ESM resolution fail to resolve under Next's Turbopack bundler. `payee-approval.ts`, `payee-approval-deps.ts`, `payee-rail-lifecycle.ts`, and `payee-store.ts` now use extensionless relative imports for the value imports specifically — safe because none of these four files are ever loaded via raw `tsx`/Node ESM (only via Next/Turbopack or vitest, both of which resolve extensionless fine). Do **not** apply this change to files that worker/index.ts or the demo/CLI scripts load directly (e.g. `ingest.ts`, `level1-pipeline.ts`) — those still need the `.js` suffix for `tsx`'s Node ESM resolution.

## Files changed and review map (Queue row review drawer)

- `app/app/review-drawer.tsx` — interactive drawer, safe text-only email display, owner actions, Escape/focus return.
- `app/app/review-drawer-model.ts` and `app/app/review-drawer-model.test.ts` — pure review projection, confidence fallbacks, evidence/timeline mapping, and eight requested demo cases.
- `app/app/page.tsx` — serializes database rows into the drawer and exposes the row-review trigger; also now links to `/payees`.
- `app/app/actions.ts` — review-state persistence and retry queue; existing manual payment actions remain separate.
- `app/app/globals.css` — drawer layout, responsive states, focus-visible styling, action controls, and the new payee-form/rail-row styles.
- `packages/db/prisma/schema.prisma` and `packages/db/prisma/migrations/20260830114500_review_actions/migration.sql` — `reviewStatus`/`reviewedAt` persistence.
- `packages/db/client.ts` — exports Prisma JSON-null support for safe retry clearing.
- `worker/src/ingest.ts` — currency confidence, explicit PDF extraction metadata, shared Level 1 processing, and pending review reprocessing.
- `worker/src/index.ts` — worker processes rows queued for another review-only pass.
- `worker/src/ingest-pdf.test.ts` — extracted/failed PDF status assertions.
- `worker/src/payee-approval.test.ts` — payee UPI/bank approval contract tests.
- `README.md` and `tests/README.md` — current commands, status, test count, and next work.

## Files changed and review map (Payment reconciliation + dashboard redesign)

- `worker/src/payment-executor-razorpay.ts` and `.test.ts` — split `createPayout` into a Contact→FundAccount stage and a Payout stage with separate error handling (see this session's summary above for why); added `reference_id: request.idempotencyKey` on the payout body; added a `RazorpayHttpError` class to distinguish "RazorpayX answered with a rejection" from "no response at all" (only the latter is genuinely `unknown`).
- `worker/src/payment-executor.ts` — `PaymentDefiniteFailure`/`PaymentUnknownOutcomeError` now carry an optional `providerReference` through their constructor.
- `worker/src/payment-executor-adapter.ts` and `.test.ts` — `payoutResultToLegacyPayResult` now passes `result.providerReference` into both thrown error classes instead of discarding it.
- `app/app/actions.ts` — `confirmPayment`'s catch block now persists `providerReference` on failure/unknown-outcome (previously only on success), and no longer re-throws once the failure has been recorded (see this session's summary, item 2).
- `worker/src/payment-reconcile.ts` and `.test.ts` (new) — `reconcileStuckPayments()`, the polling backstop; see this session's summary above for exactly what it does and does not cover.
- `worker/src/index.ts` — constructs a RazorpayX executor from the same env vars `actions.ts` checks, and calls `reconcileStuckPayments()` once per poll cycle, independently of the Gmail-ingest step.
- `worker/src/razorpay-balance.ts` and `.test.ts` (new) — `fetchRazorpayBalance()`, reads `/v1/banking_balances` (confirmed against RazorpayX's real docs, not assumed) and filters to the configured account.
- `app/app/page.tsx` — fetches the balance (guarded: any error or missing config just shows nothing, never breaks the page) and renders it above the queue; the old "Level 1 — review-only" `<section>` was removed here.
- `app/app/queue-view.tsx` — fixed the hydration bug (`toLocaleDateString(undefined, ...)` → explicit `"en-US"` locale on the queue date column).
- `app/app/globals.css` — added `.notice-warn`, an amber variant of the existing `.notice` style, reused for the low-balance state.
- `app/app/page.tsx`, `app/app/queue-view.tsx`, `app/app/payment-cell.tsx`, `app/app/globals.css` — the dashboard redesign itself (KPI-style status counts, filter tabs defaulting to "needs approval", two-step Prepare→Confirm cards) was built by a **separate session** mid-branch, not this one; this session built on top of it rather than redoing it. `app/app/queue-view.tsx` is the new client component that replaced the old flat table.

More information is in `.env.example` for safe local configuration, `packages/db/prisma/schema.prisma` for persistence boundaries, `worker/src/payee-approval.ts` for owner approval semantics, `worker/src/payment-method-validation.ts` for rail validation, and the test files beside each worker module. The README references `docs/PRD_PERFLO_AP_AGENT_V0.md`, but that path is not present in the current repository file listing; treat this handoff and the executable tests as the current implementation record until the PRD is restored.

## Work that can proceed while KYC is pending

- Run classifier/extractor in review-only mode and compare deterministic versus LLM results.
- Add Sync Now and the global Pause control.
- Add red-team `.eml` fixtures and CI coverage for injection, changed rails, German/multiline PDFs, and duplicate invoices.
- Add OCR/image-only PDF detection that routes to review.
- Add event/audit timeline storage.
- Document the supported-currency boundary: current structured extraction is INR/USD; unsupported currencies require review.
- Repeat the demo edge-case pass when changing classifier, extraction, resolver, verifier, or policy behavior.

## Work blocked or gated by KYC/Perflo access

After KYC clears, connect/login to Perflo, verify the connected account identity, and make one small manual payment. Confirm it in Perflo Activity and test the error/retry path. Do not enable auto-pay immediately.

Before any automatic payment, finish:

- Perflo recipient/grant approval UI and real grant persistence.
- Reconciliation for a crash after Perflo accepts a payment but before the database update.
- Global Pause and Sync Now behavior.
- Shared database/distributed lock if more than one worker will run.
- Persistent duplicate/content-hash checks and Gmail labels.
- x402/browser link verification and rail-level account-name verification.
- T-7 through T-25 real or reproducible acceptance tests, with no payment in the red-team cases.

## Do not do

- Do not connect the Perflo “Connect an agent” screen merely to continue Level 1; it is not required for this review-only work.
- Do not put API keys in chat, prompts, commits, or screenshots.
- Do not treat an LLM confidence score as authorization.
- Do not display or copy raw bank/UPI details into derived review JSON.
- Do not enable `AUTO_PAY_MODE` or make a real payment until the reconciliation and approval controls are proven.

## Handoff commands

```bash
pnpm test
pnpm typecheck
pnpm --dir app build
pnpm --dir packages/db exec prisma migrate status
git log --oneline -8
```

The PRD remains the desired end state. This handoff records what the code actually does today so another AI must verify the repository before extending it.
