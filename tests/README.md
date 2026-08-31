# Tests

The project currently has 267 automated tests across 43 files. Run the full suite with:

```bash
pnpm test
pnpm typecheck
```

**If `.env` has `CLASSIFIER_MODE=llm` and/or `EXTRACTOR_MODE=llm` set**, unset them before running the full suite. `worker/src/demo-inbox.ts`'s seed deps hardcode the classifier to the deterministic path but not the extractor, so `demo-scenarios.integration.test.ts`'s unfiltered `seedDemoInbox()` call (23 scenarios) falls through to `extractWithSelectedBackend` and makes 23 real OpenAI calls — this reliably exceeds vitest's default 5000ms timeout and fails that one test. With both unset (the safe default), the suite is 267/267 clean. This is a real gap worth fixing (the demo seed should be fully deterministic like it already is for classification), not yet done.

The database-backed tests require the local Postgres service:

```bash
docker compose up -d
pnpm --dir packages/db exec prisma migrate deploy
pnpm test
```

Coverage includes Gmail/MIME/PDF ingestion, explicit PDF extraction status, junk filtering, classifier injection cases, deterministic and LLM extraction validation, encrypted payee storage, UPI and bank-rail validation, resolver/verifier/policy behavior, duplicate and payment-claim safety, payee approval contracts, the Level 1 review-only pipeline, pure review-drawer rendering cases, and the Payees management screen: form validation and masking (pure, no DB), the real Postgres-backed `ApprovePayeeDeps`, rail replace/revoke lifecycle, revoked-rail exclusion from the resolver, and structural checks that payee actions never import the payment executor.

A note on test isolation: several payee integration tests set `PAYEE_ENCRYPTION_KEY`/`PAYEE_HASH_KEY` and share the same local Postgres instance. Give new payee fixtures unique sender addresses/rail values — reusing another test file's exact values (even across files) can cause spurious decrypt failures when tests run in parallel. Demo seed modules (`demo-payees.ts`) must also build their encrypted rail data *inside* their seed function, not at module load time, since an env-var override from a caller (e.g. a test's `beforeEach`) happens after the module's own imports run.

**Confirmed 2026-08-31: this isolation gap causes real, intermittent parallel-run failures**, not just a theoretical risk — `payee-store.integration.test.ts` and `demo-payees.ts`/`demo-scenarios.integration.test.ts` both hardcode the same `riya@okaxis` VPA, and running the full suite with default file parallelism can produce up to 4 extra failures (a Postgres unique-constraint collision on the rail's lookup hash, races across workers) on top of the one known `EXTRACTOR_MODE=llm` failure above. **If a run shows more failures than that one, re-run with `pnpm vitest run --no-file-parallelism` before concluding anything is actually broken** — it reproduces the clean 266/267 baseline reliably. Fixing this properly (unique fixture values per file, or serializing just the affected files) is not done yet.

Still to add: fixture-based `.eml` red-team cases under `tests/injections/`, x402/browser verification tests, crash/reconciliation tests, and the full T-7–T-25 acceptance run after Perflo KYC is complete.
