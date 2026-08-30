-- AlterTable
ALTER TABLE "payee_payment_methods" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "replaced_at" TIMESTAMP(3),
ADD COLUMN     "replaced_by_method_id" TEXT,
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "payees" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "grant_expires_at" TIMESTAMP(3),
ADD COLUMN     "grant_max_payments" INTEGER,
ADD COLUMN     "grant_per_payment_cap_inr" TEXT,
ADD COLUMN     "grant_total_cap_inr" TEXT,
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';
