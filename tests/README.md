# Tests

The project currently has 177 automated tests across 29 files. Run the full suite with:

```bash
pnpm test
pnpm typecheck
```

The database-backed tests require the local Postgres service:

```bash
docker compose up -d
pnpm --dir packages/db exec prisma migrate deploy
pnpm test
```

Coverage includes Gmail/MIME/PDF ingestion, junk filtering, classifier injection cases, deterministic and LLM extraction validation, encrypted payee storage, resolver/verifier/policy behavior, duplicate and payment-claim safety, and the Level 1 review-only pipeline.

Still to add: fixture-based `.eml` red-team cases under `tests/injections/`, German/scanned/unsupported-currency fixtures, safe row-drawer UI tests, x402/browser verification tests, crash/reconciliation tests, and the full T-7–T-25 acceptance run after Perflo KYC is complete.
