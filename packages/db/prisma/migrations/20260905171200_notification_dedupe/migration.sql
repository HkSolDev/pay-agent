ALTER TABLE "emails"
  ADD COLUMN "new_payee_approval_email_sent_at" TIMESTAMP(3),
  ADD COLUMN "quarantine_alert_sent_at" TIMESTAMP(3);
