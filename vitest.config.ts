import { defineConfig } from "vitest/config";

// These four files are the only ones in the suite that create or mutate a
// `payees` row with status "pending_grant" — a real, table-wide partial
// unique index (payees_one_pending_grant_key, see
// packages/db/prisma/schema.prisma) enforces "at most one such row exists"
// at the database level, not scoped per test file. Vitest's default
// file-level parallelism runs test files concurrently in separate
// workers/forks; when two of these four files' tests raced that one real
// constraint at the same moment, one file's legitimate lock-contention
// assertion (exactly one winner, exactly one "locked" loser) would
// intermittently see a stray row from a completely different file instead,
// flipping the pending_grant/grant_in_progress counts between runs. Each
// file's own beforeEach only clears a stray row left by an earlier run of
// itself — none of them can see or wait on another file's concurrent run.
// Serializing only these four files (not the other ~330 tests) removes
// that cross-file race without slowing down the rest of the suite.
const SHARED_PENDING_GRANT_LOCK_FILES = [
  "worker/src/payee-approval-deps.integration.test.ts",
  "worker/src/payee-approval-deps.enable-grant.test.ts",
  "worker/src/reconcile-grant-approvals.test.ts",
  "app/app/payee-actions.test.ts",
];

// These files stub PAYEE_ENCRYPTION_KEY/PAYEE_HASH_KEY by mutating the
// process-global `process.env` in beforeEach/afterEach. That mutation isn't
// scoped to the file — vitest can schedule multiple files concurrently in
// the same worker, so one file's key can get clobbered mid-test by another
// file's beforeEach (payee-crypto.test.ts even uses a different key value
// and deletes the var entirely in one case), producing an intermittent
// "Unsupported state or unable to authenticate data" GCM auth failure in
// whichever file lost the race. Serializing them removes the race the same
// way SHARED_PENDING_GRANT_LOCK_FILES does for the DB constraint above.
const SHARED_PAYEE_CRYPTO_ENV_FILES = [
  "worker/src/payee-crypto.test.ts",
  "worker/src/payee-rail-lifecycle.integration.test.ts",
  "worker/src/demo-scenarios.integration.test.ts",
  "worker/src/payee-store.integration.test.ts",
];

const SERIALIZED_FILES = [...SHARED_PENDING_GRANT_LOCK_FILES, ...SHARED_PAYEE_CRYPTO_ENV_FILES];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "default",
          exclude: ["**/node_modules/**", ...SERIALIZED_FILES],
        },
      },
      {
        test: {
          name: "shared-pending-grant-lock",
          include: SERIALIZED_FILES,
          fileParallelism: false,
        },
      },
    ],
  },
});
