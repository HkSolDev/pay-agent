import "dotenv/config";
import { syncOnce } from "./sync.js";
import { razorpayExecutorFromEnv, reconcileStuckPayments } from "./payment-reconcile.js";

// Entrypoint for the app's "Sync now" button (app/app/actions.ts). Run as a
// separate `tsx` process rather than imported into the Next.js app: sync.ts
// pulls in the Composio Gmail SDK via gmail.ts, and bundling that into the
// app's server-action bundle breaks Turbopack's module resolution. Spawning
// this script keeps that dependency entirely out of the app build.
//
// Also runs payment reconciliation (same check the background worker does
// on its own interval) so "Sync now" is a genuine one-click refresh of
// everything, not just new mail — it never creates a new payout, only reads
// a status RazorpayX already knows (FR-27).
async function main() {
  // Independent of each other, same as the background worker's loop — a
  // failure fetching mail must never block reconciling payments already in
  // flight, and vice versa.
  try {
    const ingestResult = await syncOnce();
    console.log(JSON.stringify({ step: "ingest", ...ingestResult }));
  } catch (err) {
    console.error("[sync-now] ingest failed:", err instanceof Error ? err.message : err);
  }

  const executor = razorpayExecutorFromEnv();
  if (executor) {
    try {
      const reconcileResult = await reconcileStuckPayments(executor);
      console.log(JSON.stringify({ step: "reconcile", ...reconcileResult }));
    } catch (err) {
      console.error("[sync-now] reconcile failed:", err instanceof Error ? err.message : err);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
