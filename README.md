# perflo-ap-agent

Accounts-payable review agent: Gmail/Composio intake, MIME/PDF parsing, safe classification and extraction, approved-payee verification, duplicate detection, and a review queue with a manual Perflo payment path.

## Current status

Level 0 and the Level 1 review-only pipeline are complete. The Queue row review drawer is implemented, including safe email/PDF display, field confidence, verifier evidence, duplicate information, policy reasons, timeline, and owner review actions. A Payees management screen is also implemented: add/replace/revoke payees and rails through protected server actions, with masked display and encrypted storage.

Payment execution is pluggable — Perflo (KYC still pending, so not live yet) or RazorpayX test-mode (working today; a real payment payout attempt, sandbox money only). RazorpayX payouts that don't resolve immediately are automatically reconciled: a background poller checks any stuck payment against RazorpayX's own API every poll cycle and resolves it to paid/failed with no manual action needed. The dashboard also shows the RazorpayX test-mode account balance directly, since a stuck payout's own error is often just "insufficient balance" with no number attached.

**There is no login/authentication of any kind on the app yet.** Before deploying this anywhere with a public URL, either add real auth or protect the URL at the host level (Railway/Render both support this) — anyone with the link can currently view every invoice and trigger a real (sandbox) payout.

Last successful verification on 2026-08-31:

- `pnpm test` — 267/267 passing across 43 test files (with `CLASSIFIER_MODE`/`EXTRACTOR_MODE` unset — see `tests/README.md` for a real gotcha if you have `EXTRACTOR_MODE=llm` set locally)
- `pnpm typecheck` — clean
- Live-verified against a real RazorpayX test-mode sandbox (not just mocked tests): a payout with a bad IFSC now correctly lands as `failed` with a working Retry button; a genuinely in-flight payout's reference is saved and automatically re-checked by the background worker.
- Perflo KYC is still pending, so no successful real Perflo payment or connected-account verification has been proven, and payee approval still creates only a local placeholder recipient/grant (no real Perflo call yet).

Automatic payment remains disabled. Review actions only update review state or queue another review-only processing pass. Payee actions only ever create/edit a `Payee`/`PayeePaymentMethod` row — never a `PaymentIntent`.

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

The LLM has no tools or payment permission. Payment decisions are deterministic code, and automatic payment remains disabled while the review flow is being demonstrated — a human always clicks Prepare, then Confirm & pay, separately.

Set `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_ACCOUNT_NUMBER` (test-mode only) to route payments through RazorpayX instead of Perflo; unset, the Perflo path stays the default.

## Next work

The local seeded demo/test inbox, Payees management UI, full edge-case review pass, and RazorpayX payment reconciliation are complete. Immediate next steps: add auth or a host-level password gate before any public deploy, get an independent review of the reconciliation work, and deploy to Railway (the background worker needs a persistent host — Vercel-only or Cloudflare Workers won't run it as-is). Longer-term: a dedicated Gmail test mailbox for real ingestion validation, a payment-completion notification (none exists yet — the owner has to reload the page to see a status change), and a RazorpayX webhook once there's a public URL to point it at (polling reconciliation stays as the reliability backstop even after that). Only after Perflo KYC clears should Perflo actually be connected and one small manual payment reconciled.

See [`hands-off.md`](hands-off.md) for the complete architecture, current-state summary, changed-file review list, and KYC-gated work.

The full product target and acceptance cases remain in [`docs/PRD_PERFLO_AP_AGENT_V0.md`](docs/PRD_PERFLO_AP_AGENT_V0.md).
