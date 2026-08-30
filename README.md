# perflo-ap-agent

Accounts-payable review agent: Gmail/Composio intake, MIME/PDF parsing, safe classification and extraction, approved-payee verification, duplicate detection, and a review queue with a manual Perflo payment path.

## Current status

Level 0 is complete. Level 1 is implemented in review-only mode. The worker persists extracted fields and policy reasons but does not automatically pay. Perflo KYC is still pending, so a successful real payment has not yet been verified.

Verified on 2026-08-30:

- `pnpm test` — 177/177 passing
- `pnpm typecheck` — clean
- Prisma — 8 migrations applied and up to date

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

Keep API keys only in the local environment. Never commit `.env` or paste keys into an AI prompt.

## Pipeline

```text
Gmail → ingest → junk filter → classify → extract → resolve payee
      → verify → duplicate check → policy → Queue review
      → manual Perflo payment
```

The LLM has no tools or payment permission. Payment decisions are deterministic code, and automatic payment remains disabled while the review flow is being demonstrated.

## Next task

Build the Queue row drawer showing the original email safely, extracted amount/reference/payee and confidence, verifier evidence, duplicate details, full policy reasons, and timeline. Use the handoff in [`hands-off.md`](hands-off.md) for the exact scope and remaining work.

The full product target and acceptance cases remain in [`docs/PRD_PERFLO_AP_AGENT_V0.md`](docs/PRD_PERFLO_AP_AGENT_V0.md).
