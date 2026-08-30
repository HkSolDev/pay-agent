-- CreateTable
CREATE TABLE "payees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recipient_nickname" TEXT NOT NULL,
    "grant_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payee_identities" (
    "id" TEXT NOT NULL,
    "payee_id" TEXT NOT NULL,
    "sender_addr" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payee_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payee_payment_methods" (
    "id" TEXT NOT NULL,
    "payee_id" TEXT NOT NULL,
    "rail" TEXT NOT NULL,
    "encrypted_payload" BYTEA NOT NULL,
    "lookup_hash" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payee_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payee_identities_sender_addr_key" ON "payee_identities"("sender_addr");

-- CreateIndex
CREATE UNIQUE INDEX "payee_payment_methods_lookup_hash_key" ON "payee_payment_methods"("lookup_hash");

-- AddForeignKey
ALTER TABLE "payee_identities" ADD CONSTRAINT "payee_identities_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_payment_methods" ADD CONSTRAINT "payee_payment_methods_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
