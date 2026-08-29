-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "email_id" TEXT NOT NULL,
    "recipient_nickname" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_reference" TEXT,
    "claimed_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_email_id_key" ON "payment_intents"("email_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_idempotency_key_key" ON "payment_intents"("idempotency_key");
