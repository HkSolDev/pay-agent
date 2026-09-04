-- AlterTable
ALTER TABLE "payees" ADD COLUMN     "last_grant_outcome" TEXT,
ADD COLUMN     "pending_grant_approval_url" TEXT,
ADD COLUMN     "pending_grant_expires_at" TIMESTAMP(3),
ADD COLUMN     "pending_grant_started_at" TIMESTAMP(3);

-- One-pending-grant-at-a-time lock (plan §1): a partial unique index on
-- `status` itself, filtered to rows where status = 'pending_grant'. Because
-- every row inside that filter carries the identical indexed value
-- ('pending_grant'), Postgres's own unique-index enforcement — which runs
-- as part of each UPDATE, not as a separate check-then-act step racing
-- another transaction — refuses a second row from ever entering that state
-- concurrently. This is not expressible in schema.prisma (no partial/filtered
-- unique index support there), so it lives only in this migration; do not
-- remove it on a future `prisma migrate dev` schema drift reconciliation.
CREATE UNIQUE INDEX "payees_one_pending_grant_key" ON "payees" ("status") WHERE "status" = 'pending_grant';
