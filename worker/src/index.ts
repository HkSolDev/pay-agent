import "dotenv/config";
import { prisma } from "@perflo-ap-agent/db";
import { fetchNewGmailMessages, isGmailConnected } from "./gmail.js";
import { ingestGmailMessages, processPendingLevel1 } from "./ingest.js";

// PRD FR-1 default is 5 minutes; overridable for testing (POLL_INTERVAL_SECONDS=90
// while watching new mail arrive live). Cron syntax can't express "every 90
// seconds" cleanly — its seconds field maxes at 59 — so this is a plain
// interval, not a cron expression. Nothing here needs cron's calendar features.
const POLL_INTERVAL_SECONDS = Number(process.env.POLL_INTERVAL_SECONDS ?? 300);

const CHECKPOINT_ID = 1;

// Durable across restarts (`ingest_checkpoint`, single row) — a killed and
// restarted worker (which happens constantly in dev) must resume from where
// it left off, not jump to "now" and silently skip whatever arrived in the gap.
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

let sinceEpochSeconds: number;

async function pollOnce() {
  const startedAt = Math.floor(Date.now() / 1000);
  try {
    // Checked explicitly rather than assumed: Composio's own docs don't
    // clearly say what an unconnected tool call does, so we don't rely on
    // implicit behavior — run `pnpm connect-gmail` once, by hand, first.
    if (!(await isGmailConnected())) {
      console.log("[ingest] Gmail not connected yet — run `pnpm connect-gmail`. Skipping poll.");
      return;
    }

    const messages = await fetchNewGmailMessages(sinceEpochSeconds);
    const { inserted, skipped } = await ingestGmailMessages(messages);
    await processPendingLevel1();
    console.log(
      `[ingest] fetched ${messages.length}, inserted ${inserted}, skipped ${skipped} (duplicates)`,
    );
    // Only move the checkpoint forward after a successful ingest — if this
    // poll throws, we want the next one to retry the same window, not skip it.
    sinceEpochSeconds = startedAt;
    await saveCheckpoint(sinceEpochSeconds);
  } catch (err) {
    console.error("[ingest] poll failed, will retry next tick:", err);
  }
}

async function main() {
  sinceEpochSeconds = await loadCheckpoint();
  console.log(
    `Perflo AP worker starting — polling Gmail every ${POLL_INTERVAL_SECONDS}s, ` +
      `resuming from checkpoint ${sinceEpochSeconds} (${new Date(sinceEpochSeconds * 1000).toISOString()}).`,
  );

  // Run once immediately (this is the "manual Sync now" behavior at startup),
  // then hand off to the interval.
  await pollOnce();

  setInterval(pollOnce, POLL_INTERVAL_SECONDS * 1000);
}

void main();
