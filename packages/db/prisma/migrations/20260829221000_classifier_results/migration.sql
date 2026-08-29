-- AlterTable
ALTER TABLE "emails"
  ADD COLUMN "classification_rationale" TEXT,
  ADD COLUMN "injection_detected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "injection_evidence" JSONB;
