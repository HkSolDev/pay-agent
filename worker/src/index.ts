import "dotenv/config";
import { razorpayExecutorFromEnv, reconcileStuckPayments } from "./payment-reconcile.js";
import { syncOnce } from "./sync.js";
import { isSyncPaused } from "./sync-state.js";

// PRD FR-1 default is 5 minutes; overridable for testing (POLL_INTERVAL_SECONDS=90
// while watching new mail arrive live). Cron syntax can't express "every 90
// seconds" cleanly — its seconds field maxes at 59 — so this is a plain
// interval, not a cron expression. Nothing here needs cron's calendar features.
const POLL_INTERVAL_SECONDS = Number(process.env.POLL_INTERVAL_SECONDS ?? 300);

const razorpayExecutor = razorpayExecutorFromEnv();

async function pollOnce() {
  // The owner's "Paused" toggle only affects picking up new mail — payment
  // reconciliation below still runs regardless, since that's resolving
  // payments already in flight, not starting anything new.
  if (await isSyncPaused()) {
    console.log("[ingest] paused — skipping poll.");
  } else {
    try {
      const result = await syncOnce();
      if (!result.ran) {
        console.log(`[ingest] ${result.reason}`);
      } else {
        console.log(`[ingest] fetched ${result.fetched}, inserted ${result.inserted}, skipped ${result.skipped} (duplicates)`);
      }
    } catch (err) {
      console.error("[ingest] poll failed, will retry next tick:", err);
    }
  }

  // Independent of the ingest step above and of each other — a failure here
  // must never block Gmail ingest, and vice versa. This never creates a new
  // payout, only reads a status RazorpayX already knows (FR-27).
  if (razorpayExecutor) {
    try {
      const { checked, updated } = await reconcileStuckPayments(razorpayExecutor);
      if (checked > 0) {
        console.log(`[reconcile] checked ${checked} stuck payment(s), updated ${updated}`);
      }
    } catch (err) {
      console.error("[reconcile] payment reconciliation failed, will retry next tick:", err);
    }
  }
}

async function main() {
  console.log(`Perflo AP worker starting — polling Gmail every ${POLL_INTERVAL_SECONDS}s.`);

  // Run once immediately (this is the "manual Sync now" behavior at startup),
  // then hand off to the interval.
  await pollOnce();

  setInterval(pollOnce, POLL_INTERVAL_SECONDS * 1000);
}

void main();
