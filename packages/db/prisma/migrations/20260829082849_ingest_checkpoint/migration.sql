-- CreateTable
CREATE TABLE "ingest_checkpoint" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "since_epoch_seconds" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingest_checkpoint_pkey" PRIMARY KEY ("id")
);
