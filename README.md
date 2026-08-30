# perflo-ap-agent

Accounts-payable review agent: Gmail/Composio intake, MIME/PDF parsing, safe classification and extraction, approved-payee verification, duplicate detection, and a review queue with a manual Perflo payment path.

## Current status

Level 0 and the Level 1 review-only pipeline are complete. The Queue row review drawer is implemented, including safe email/PDF display, field confidence, verifier evidence, duplicate information, policy reasons, timeline, and owner review actions. A Payees management screen is also implemented: add/replace/revoke payees and rails through protected server actions, with masked display and encrypted storage. Perflo KYC is still pending, so no successful real payment or connected-account verification has been proven, and payee approval creates only a local placeholder recipient/grant (no real Perflo call yet).

Last successful verification on 2026-08-30:

- `pnpm test` — 226/226 passing across 36 test files (re-run 3x to confirm no flakiness)
- `pnpm typecheck` — clean
- `pnpm --dir app build` — successful, `/payees` route registered
- Prisma — 10 migrations applied and up to date

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

Seed the matching demo payees (normal UPI, bank/NEFT, multiple rails, a
conflicting rail, and a revoked rail) so the demo inbox's "changed-upi",
"unknown-sender", "multiple-rails", and "conflicting-sender-rail" scenarios
actually resolve against something:

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
      → manual Perflo payment
```

The LLM has no tools or payment permission. Payment decisions are deterministic code, and automatic payment remains disabled while the review flow is being demonstrated.

## Next work

The local seeded demo/test inbox and the Payees management UI (identities, encrypted rails, grant caps, replace/revoke) are both complete. The next milestone is a full edge-case review pass over the demo scenarios against the demo payees, then a dedicated Gmail test mailbox for real ingestion validation. Only after Perflo KYC clears should Perflo actually be connected and one small manual payment reconciled.

See [`hands-off.md`](hands-off.md) for the complete architecture, current-state summary, changed-file review list, and KYC-gated work.

The full product target and acceptance cases remain in [`docs/PRD_PERFLO_AP_AGENT_V0.md`](docs/PRD_PERFLO_AP_AGENT_V0.md).
