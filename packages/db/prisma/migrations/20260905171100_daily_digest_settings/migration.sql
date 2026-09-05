ALTER TABLE "ingest_checkpoint"
  ADD COLUMN "digest_hour" INTEGER NOT NULL DEFAULT 9,
  ADD COLUMN "last_digest_sent_at" TIMESTAMP(3);
