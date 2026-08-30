-- Level 1 keeps a reviewable audit trail on the source email. Payment rail
-- identifiers are deliberately absent: approved rails live encrypted in
-- payee_payment_methods, never as plaintext JSON attached to an email.
ALTER TABLE "emails"
  ADD COLUMN "extraction_summary" JSONB,
  ADD COLUMN "extraction_backend" TEXT,
  ADD COLUMN "resolved_payee_id" TEXT,
  ADD COLUMN "payee_resolution" JSONB,
  ADD COLUMN "verification_result" JSONB,
  ADD COLUMN "duplicate_result" JSONB,
  ADD COLUMN "policy_decision" TEXT,
  ADD COLUMN "policy_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "level1_processed_at" TIMESTAMP(3);

CREATE INDEX "emails_level1_pending_idx" ON "emails" ("level1_processed_at")
  WHERE "level1_processed_at" IS NULL;
