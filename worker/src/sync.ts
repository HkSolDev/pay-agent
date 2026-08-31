import { prisma } from "@perflo-ap-agent/db";
import { fetchNewGmailMessages, isGmailConnected } from "./gmail.js";
import { ingestGmailMessages, processPendingLevel1 } from "./ingest.js";

const CHECKPOINT_ID = 1;

export interface SyncSummary {
  ran: boolean;
  reason?: string;
  fetched?: number;
  inserted?: number;
  skipped?: number;
}

async function loadCheckpoint(): Promise<number> {
  const row = await prisma.ingestCheckpoint.findUnique({ where: { id: CHECKPOINT_ID } });
  return row?.sinceEpochSeconds ?? Math.floor(Date.now() / 1000);
}

async function saveCheckpoint(sinceEpochSeconds: number): Promise<void> {
  await prisma.ingestCheckpoint.upsert({
    where: { id: CHECKPOINT_ID },
    create: { id: CHECKPOINT_ID, sinceEpochSeconds },
    update: { sinceEpochSeconds },
  });
}

/**
 * One ingest pass: fetch new Gmail messages since the last checkpoint, store
 * them, and run Level 1 processing. Shared by the background worker's
 * interval loop and the app's "Sync now" button so both go through the exact
 * same checkpoint bookkeeping — a manual sync and a scheduled poll are the
 * same operation, not two different code paths that could drift apart.
 */
export async function syncOnce(): Promise<SyncSummary> {
  if (!(await isGmailConnected())) {
    return { ran: false, reason: "Gmail not connected — run `pnpm connect-gmail` first." };
  }

  const startedAt = Math.floor(Date.now() / 1000);
  const sinceEpochSeconds = await loadCheckpoint();
  const messages = await fetchNewGmailMessages(sinceEpochSeconds);
  const { inserted, skipped } = await ingestGmailMessages(messages);
  await processPendingLevel1();
  // Only move the checkpoint forward after a successful ingest — if this
  // throws, the next attempt should retry the same window, not skip it.
  await saveCheckpoint(startedAt);

  return { ran: true, fetched: messages.length, inserted, skipped };
}
