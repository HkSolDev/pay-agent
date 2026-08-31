# perflo-ap-agent

Accounts-payable review agent: Gmail/Composio intake, MIME/PDF parsing, safe classification and extraction, approved-payee verification, duplicate detection, and a review queue with a manual Perflo payment path.

## What we are trying to achieve

This project demonstrates a controlled accounts-payable workflow: an invoice arrives by email, the app classifies it, extracts the amount/currency/payee details, resolves the recipient to an approved encrypted payment rail, checks authentication, duplicates, confidence, grant limits, and policy, and then places the result in the review queue. If every auto-pay guard passes, the same payment executor used by the manual flow may be used automatically; otherwise the invoice remains available for manual review. The goal is reliable, explainable payment processing—not blind payment of arbitrary email instructions.

The current demo is intentionally a test/sandbox demonstration. It is being used to prove the email-to-payment workflow and browser experience for a job assignment. It is not production-ready: authentication is missing, Perflo KYC is pending, and RazorpayX test-mode payouts may need a manual state change in the RazorpayX dashboard before they settle.

## Safety defaults and disabled features

Auto-pay is **off by default** and must remain off during ordinary development and deployment setup:

```text
AUTO_PAY_MODE=       # deployment-wide auto-pay kill switch: OFF
DEMO_MODE=false      # sender verification ON; true is local-demo-only relaxation
```

The second required switch is the individual payee's **Auto-pay enabled** toggle, which is also off by default. Both switches, plus every policy and grant check, must pass before an automatic payment can execute. The UI warning **Global pause is enabled** means `AUTO_PAY_MODE` is off; it is not a third setting. `Pause syncing` is separate: it stops new Gmail ingestion, while the global auto-pay switch prevents automatic money movement. Existing payments can still be reconciled while ingestion is paused.

**The pause reason on an invoice is a snapshot, not live status.** It's written once when the invoice is first processed and never updates itself — flipping `AUTO_PAY_MODE` later does not retroactively change what an already-queued invoice displays. The queue header shows the live switch state (`Auto-pay: live` / `Auto-pay: globally paused`) independently of any invoice. Two actions close that gap safely:
- **Re-evaluate policy** (per invoice) — recomputes the decision from what's already stored (no re-extraction, no payment) and refreshes the stale reason. Safe to click any time; it never pays.
- **Resume auto-pay for N eligible invoices** (queue-wide) — only touches invoices whose stored reason is *exactly* the global pause (never one also blocked by something else, and never a payee-level auto-pay opt-out), re-checks every guardrail live, and pays only what's still eligible through the same idempotent executor the normal auto-pay path uses.

Do not set all payees to auto-pay or remove the production sender restrictions. For a deliberate RazorpayX sandbox demonstration only, enable one test payee, set `AUTO_PAY_MODE=on`, use a fresh matching invoice, verify the amount/payee/rail in the queue, and turn the switch back off afterward.

## Why the important changes were made

- Source-backed invoice references and confidence evidence make the review decision traceable to the email/PDF rather than trusting UI text.
- Retry processing re-runs a failed review-stage processing attempt without creating a new invoice row.
- Demo sender matching allows a different test mailbox to exercise an already-registered demo payee, while production keeps sender/domain verification.
- Currency is carried from extraction into payment preparation, and non-INR auto-pay is held for review because the current grant and RazorpayX sandbox path are INR-denominated.
- Payment preparation and retry now load the resolved payee and extracted amount from the database, preventing a stale or user-edited nickname/amount from being routed to the wrong rail.
- Gmail checkpoint overlap prevents indexing lag from permanently skipping a new message after the previous checkpoint.
- Sync now runs one ingestion pass and payment reconciliation together; Pause syncing is persisted in the database rather than being a decorative UI state.
- The global-pause reason on an invoice used to be permanent once written, so toggling `AUTO_PAY_MODE` never updated an already-queued invoice's displayed reason. Re-evaluate policy and Resume auto-pay for eligible invoices close that gap without ever bypassing a single guardrail (payee rail, amount, currency, duplicate, authentication, grant) — see `worker/src/reevaluate-policy.ts` and `worker/src/resume-auto-pay.ts`.

## Current status

Level 0 and the Level 1 review-only pipeline are complete. The Queue row review drawer is implemented, including safe email/PDF display, field confidence, verifier evidence, duplicate information, policy reasons, timeline, and owner review actions. A Payees management screen is also implemented: add/replace/revoke payees and rails through protected server actions, with masked display and encrypted storage. The UI runs on the "Organic" design system (cream/terracotta/sage, pill buttons).

Payment execution is pluggable — Perflo (KYC still pending, so not live yet) or RazorpayX test-mode (working today; a real payment payout attempt, sandbox money only). RazorpayX payouts that don't resolve immediately are automatically reconciled: a background poller checks any stuck payment against RazorpayX's own API every poll cycle and resolves it to paid/failed with no manual action needed. **"Sync now" fetches new mail and re-runs this reconciliation check in one click; "Pause syncing" stops the background worker from picking up new mail via a real switch** (both used to be decorative, disabled buttons — now real). The dashboard also shows the RazorpayX test-mode account balance directly, since a stuck payout's own error is often just "insufficient balance" with no number attached.

**Automatic payment execution ("auto-pay") now exists in code, gated by two independent off-by-default switches** — a deployment-wide `AUTO_PAY_MODE=on` env var and a per-payee toggle on the Payees page — plus the full existing policy engine (confidence thresholds, exact payee/rail resolution, sender auth alignment, grant caps/expiry). Both switches are off in every environment as shipped; nothing pays automatically unless explicitly turned on twice (globally and per-payee). See `hands-off.md`'s auto-pay section before touching any of this — it is the highest-blast-radius code in the repo.

**There is no login/authentication of any kind on the app yet.** Before deploying this anywhere with a public URL, either add real auth or protect the URL at the host level (Railway/Render both support this) — anyone with the link can currently view every invoice and trigger a real (sandbox) payout.

Latest verification on 2026-08-31:

- `pnpm vitest run --no-file-parallelism` — last full run: 271 passed, 4 failed across 275 tests. The four failures are stale encrypted-payee fixture/database-state failures in the local Postgres test data, not type or build failures; see `tests/README.md`.
- Focused resolver/pipeline/policy tests — 23/23 passing after the latest payment-routing and demo-mode fixes.
- `pnpm typecheck` — clean
- `pnpm build` — clean
- Live-verified against a real RazorpayX test-mode sandbox (not just mocked tests): a payout with a bad IFSC now correctly lands as `failed` with a working Retry button; a genuinely in-flight payout's reference is saved and automatically re-checked by the background worker. RazorpayX's own docs confirm test-mode payouts require a manual dashboard click to ever resolve — not a bug in this app.
- Live email checks confirmed that a message from a different demo sender can be ingested and resolved to the registered demo payee. With the global switch off, `INV-DEMO-2026-04` correctly remained `needs_approval` and did not pay.
- Perflo KYC is still pending, so no successful real Perflo payment or connected-account verification has been proven, and payee approval still creates only a local placeholder recipient/grant (no real Perflo call yet).
- **Auto-pay is now verified end-to-end live, not just unit-tested**: with `AUTO_PAY_MODE=on` and one payee's toggle on, three fresh invoices auto-paid automatically with no manual click, landed at RazorpayX `processing`, were manually advanced in the RazorpayX Test Mode dashboard, and were then automatically picked up and marked `paid` by the existing reconciliation poller — no code change needed for that last step. See `hands-off.md`.
- Confirmed directly against RazorpayX's current docs (fetched live, not from memory): a Test Mode payout in `processing` does **not** resolve on its own — "you will have to manually move the payout to the next state from the Dashboard... Unlike the Live Mode, this does not happen automatically." Do not treat `processing`/`unknown_outcome` as `paid` anywhere in this codebase without that manual confirmation — it would misrepresent an unconfirmed payment as settled.
- Three real UI bugs found live (via screenshots, not code review) and fixed this session: the review drawer offering "Approve/Reject/Retry" on an invoice that had already been paid or was mid-payment; the "needs approval" tag/count staying on invoices that had already auto-paid; and a paid invoice still showing its stale pre-payment warning pills as if they were active problems. See `hands-off.md`.

Review actions only update review state or queue another review-only processing pass. Payee actions only ever create/edit a `Payee`/`PayeePaymentMethod` row — never a `PaymentIntent` — except when auto-pay is explicitly turned on for that payee.

## Run locally

```bash
pnpm install
docker compose up -d
pnpm --dir packages/db exec prisma migrate deploy
pnpm test
pnpm typecheck
pnpm dev
```

The worker uses deterministic classification and extraction by default. LLM calls are opt-in:

```text
CLASSIFIER_MODE=llm
EXTRACTOR_MODE=llm
CLASSIFIER_MODEL=<configured model>
EXTRACTOR_MODEL=<configured model>
LLM_EXTRACTOR_TIMEOUT_MS=10000
```

Run the local seeded review-only inbox without Gmail, Perflo, or money movement:

```bash
pnpm demo:inbox --list
pnpm demo:inbox --reset
pnpm demo:inbox --reseed
pnpm demo:inbox --reset english-invoice prompt-injection changed-upi
```

The runner seeds namespaced `demo-*` rows through the real MIME, PDF-status,
classification, extraction, verification, duplicate, and policy path. `--reset`
only deletes those demo rows; it never deletes real inbox data.

Seed the matching demo payees (normal UPI, bank/NEFT, multiple rails, duplicate
fixtures, a conflicting rail, and a revoked rail) so the demo inbox scenarios
resolve against real approved-payee rows:

```bash
pnpm demo:payees --reseed
pnpm demo:payees --reset
```

`demo:payees` never calls Perflo — `recipientNickname`/grant id are local
placeholders until KYC clears (see `hands-off.md`).

Keep API keys only in the local environment. Never commit `.env` or paste keys into an AI prompt.

## Pipeline

```text
Gmail → ingest → junk filter → classify → extract → resolve payee
      → verify → duplicate check → policy → Queue review
      → manual payment (Perflo or RazorpayX test-mode)
      → automatic reconciliation poll (RazorpayX only, for now)
```

The LLM has no tools or payment permission. Payment decisions are deterministic code. By default a human always clicks Prepare, then Confirm & pay, separately — auto-pay (see above) is an explicit, off-by-default opt-in on top of this, not a replacement for it.

Set `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_ACCOUNT_NUMBER` (test-mode only) to route payments through RazorpayX instead of Perflo; unset, the Perflo path stays the default.

Set `AUTO_PAY_MODE=on` (and turn on the toggle for a specific payee on the Payees page) to let a payment execute automatically once every existing guardrail passes cleanly — see `.env.example` and `hands-off.md` before doing this anywhere but a fully understood test environment.

## Next work

The local seeded demo/test inbox, Payees management UI, full edge-case review pass, RazorpayX payment reconciliation, real Sync now/Pause syncing, and the auto-pay execution path are all built. Immediate next steps: open a PR for the latest commits and reconcile this branch's divergence from `main` (see `hands-off.md`'s header), live-verify auto-pay end-to-end deliberately with the user, get an independent review of the auto-pay execution path specifically (highest blast radius in the repo), add auth or a host-level password gate before any public deploy, and deploy to Railway (the background worker needs a persistent host — Vercel-only or Cloudflare Workers won't run it as-is). Longer-term: a dedicated Gmail test mailbox for real ingestion validation, a payment-completion notification (none exists yet — the owner has to reload the page to see a status change), and a RazorpayX webhook once there's a public URL to point it at (polling reconciliation stays as the reliability backstop even after that). Only after Perflo KYC clears should Perflo actually be connected and one small manual payment reconciled.

See [`hands-off.md`](hands-off.md) for the complete architecture, current-state summary, changed-file review list, and KYC-gated work.

The full product target and acceptance cases remain in [`docs/PRD_PERFLO_AP_AGENT_V0.md`](docs/PRD_PERFLO_AP_AGENT_V0.md).
