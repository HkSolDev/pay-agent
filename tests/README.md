# Tests

The project currently has 227 automated tests across 36 files. Run the full suite with:

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

Coverage includes Gmail/MIME/PDF ingestion, explicit PDF extraction status, junk filtering, classifier injection cases, deterministic and LLM extraction validation, encrypted payee storage, UPI and bank-rail validation, resolver/verifier/policy behavior, duplicate and payment-claim safety, payee approval contracts, the Level 1 review-only pipeline, pure review-drawer rendering cases, and the Payees management screen: form validation and masking (pure, no DB), the real Postgres-backed `ApprovePayeeDeps`, rail replace/revoke lifecycle, revoked-rail exclusion from the resolver, and structural checks that payee actions never import the payment executor.

A note on test isolation: several payee integration tests set `PAYEE_ENCRYPTION_KEY`/`PAYEE_HASH_KEY` and share the same local Postgres instance. Give new payee fixtures unique sender addresses/rail values — reusing another test file's exact values (even across files) can cause spurious decrypt failures when tests run in parallel. Demo seed modules (`demo-payees.ts`) must also build their encrypted rail data *inside* their seed function, not at module load time, since an env-var override from a caller (e.g. a test's `beforeEach`) happens after the module's own imports run.

Still to add: fixture-based `.eml` red-team cases under `tests/injections/`, x402/browser verification tests, crash/reconciliation tests, and the full T-7–T-25 acceptance run after Perflo KYC is complete.
