-- AlterTable
ALTER TABLE "ingest_checkpoint" ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false;
