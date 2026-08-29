import "dotenv/config";
import cron from "node-cron";
import { fetchNewGmailMessages, isGmailConnected } from "./gmail.js";
import { ingestGmailMessages } from "./ingest.js";

// PRD FR-1: poll every 5 minutes, and triggers get missed so polling has to
// exist regardless. We track "since" in memory for Phase 0 — good enough for
// a single long-running process; move to a DB-backed checkpoint once this
// worker needs to survive restarts without re-scanning.
let sinceEpochSeconds = Math.floor(Date.now() / 1000);

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
    console.log(
      `[ingest] fetched ${messages.length}, inserted ${inserted}, skipped ${skipped} (duplicates)`,
    );
    // Only move the checkpoint forward after a successful ingest — if this
    // poll throws, we want the next one to retry the same window, not skip it.
    sinceEpochSeconds = startedAt;
  } catch (err) {
    console.error("[ingest] poll failed, will retry next tick:", err);
  }
}

async function main() {
  console.log("Perflo AP worker starting — polling Gmail every 5 minutes.");

  // Run once immediately (this is the "manual Sync now" behavior at startup),
  // then hand off to the schedule.
  await pollOnce();

  cron.schedule("*/5 * * * *", pollOnce);
}

void main();
