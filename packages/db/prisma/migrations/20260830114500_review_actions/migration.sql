-- Owner review actions are an audit marker only. They do not grant payment
-- permission and are intentionally separate from PaymentIntent status.
ALTER TABLE "emails"
  ADD COLUMN "review_status" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMP(3);
