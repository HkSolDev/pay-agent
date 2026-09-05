import "dotenv/config";
import { razorpayExecutorFromEnv, reconcileStuckPayments } from "./payment-reconcile.js";
import { reconcileStuckGrantApprovals } from "./reconcile-grant-approvals.js";
import { warnAboutExpiringGrants } from "./grant-expiry-warning.js";
import { sendDailyDigest } from "./daily-digest.js";
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

  // Expiry as a safety net for grant approvals (plan §3), independent of
  // everything else above — a payee stuck in pending_grant past its own
  // expiry (nobody clicked the browser link, or the worker restarted mid-
  // approval — see the startup call in main() below) is resolved here even
  // if nobody happens to click Approve on another payee to trigger the
  // inline check in payee-approval-deps.ts's startPendingGrant.
  try {
    const { checked, expired } = await reconcileStuckGrantApprovals();
    const warned = await warnAboutExpiringGrants();
    if (expired > 0) {
      console.log(`[reconcile] checked ${checked} pending grant approval(s), expired ${expired}`);
    }
    if (warned > 0) console.log(`[notify] sent ${warned} grant expiry warning(s)`);
  } catch (err) {
    console.error("[reconcile] grant approval reconciliation failed, will retry next tick:", err);
  }

  try {
    if (await sendDailyDigest()) console.log("[notify] sent daily digest");
  } catch (err) {
    console.error("[notify] daily digest failed, will retry next tick:", err);
  }
}

async function main() {
  console.log(`Perflo AP worker starting — polling Gmail every ${POLL_INTERVAL_SECONDS}s.`);

  // Crash recovery (plan §4), before anything else: if this process
  // restarted while a `policy enable` child process was running detached,
  // the in-memory handle to it is gone — there is no operation id to
  // re-attach to or ask Perflo "is this still open," so a pending_grant
  // row is only ever recoverable by checking its own expiry. A row already
  // past pendingGrantExpiresAt is resolved to expired right here, before
  // Gmail sync or anything else runs; a row not yet expired is left alone
  // for the next sweep (pollOnce below already covers that on its own
  // interval, so this startup call is deliberately about the "already
  // expired while nobody was looking" case specifically).
  try {
    const { checked, expired } = await reconcileStuckGrantApprovals();
    const warned = await warnAboutExpiringGrants();
    console.log(`[reconcile] startup: checked ${checked} pending grant approval(s), expired ${expired}`);
    if (warned > 0) console.log(`[notify] startup sent ${warned} grant expiry warning(s)`);
  } catch (err) {
    console.error("[reconcile] startup grant approval reconciliation failed:", err);
  }

  // Run once immediately (this is the "manual Sync now" behavior at startup),
  // then hand off to the interval.
  await pollOnce();

  setInterval(pollOnce, POLL_INTERVAL_SECONDS * 1000);
}

void main();
