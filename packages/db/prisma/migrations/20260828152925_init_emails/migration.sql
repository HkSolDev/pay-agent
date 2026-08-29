-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "gmail_thread_id" TEXT NOT NULL,
    "from_addr" TEXT NOT NULL,
    "from_name" TEXT,
    "reply_to" TEXT,
    "return_path" TEXT,
    "to_addrs" TEXT[],
    "date" TIMESTAMP(3) NOT NULL,
    "subject" TEXT,
    "snippet" TEXT,
    "raw_headers" JSONB NOT NULL,
    "body_text" TEXT,
    "body_html_hash" TEXT,
    "attachments" JSONB,
    "links" JSONB,
    "auth" JSONB,
    "sender_prior_count" INTEGER NOT NULL DEFAULT 0,
    "sender_first_seen" TIMESTAMP(3),
    "in_owner_thread" BOOLEAN NOT NULL DEFAULT false,
    "classification" TEXT,
    "classification_confidence" DOUBLE PRECISION,
    "gmail_labels" TEXT[],
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emails_gmail_message_id_key" ON "emails"("gmail_message_id");
