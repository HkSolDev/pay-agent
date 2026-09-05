ALTER TABLE "emails"
  ADD COLUMN "x402_budget_minor" INTEGER,
  ADD COLUMN "x402_spent_minor" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "x402_spend" (
  "id" TEXT NOT NULL,
  "email_id" TEXT NOT NULL,
  "tool" TEXT NOT NULL,
  "cost_minor" INTEGER NOT NULL,
  "settlement_status" TEXT NOT NULL,
  "tx_hash" TEXT,
  "result_hash" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "x402_spend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "x402_spend_email_id_created_at_idx" ON "x402_spend"("email_id", "created_at");
ALTER TABLE "x402_spend" ADD CONSTRAINT "x402_spend_email_id_fkey"
  FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
