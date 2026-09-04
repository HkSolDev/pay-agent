import { prisma } from "@perflo-ap-agent/db";

export interface ReconcileGrantApprovalsSummary {
  checked: number;
  expired: number;
}

/**
 * Expiry as a safety net, not an event (plan §3): nothing pushes a state
 * change when `pendingGrantExpiresAt` passes, so something has to check.
 * A conditional `updateMany` — same shape as `claimPaymentIntent` and
 * `reconcileStuckPayments` — so it's safe to call from multiple places
 * without double-counting or racing itself: only rows still `pending_grant`
 * and already past their own expiry are touched, and a row that resolved
 * (approved/denied) in between is simply not matched by the WHERE clause
 * any more.
 *
 * Shared by three callers that must never disagree about what counts as
 * stale: the lock check in `payee-approval-deps.ts` (run inline, right
 * before trusting an existing `pending_grant` row as still blocking), the
 * worker's periodic poll loop, and worker startup (crash recovery, plan
 * §4 — a restart loses the in-memory handle to any still-running `policy
 * enable` child process, and there is no operation id to re-attach to or
 * poll, so a row whose expiry has already passed is simply resolved to
 * expired here; a row not yet expired is left for the next sweep).
 */
export async function expireStalePendingGrants(now: Date = new Date()): Promise<number> {
  const result = await prisma.payee.updateMany({
    where: { status: "pending_grant", pendingGrantExpiresAt: { lt: now } },
    data: { status: "not_approved", lastGrantOutcome: "expired", pendingGrantApprovalUrl: null },
  });
  return result.count;
}

/**
 * The periodic sweep itself — mirrors `reconcileStuckPayments`'s shape
 * (`{ checked, updated }`-style summary, read-then-resolve, safe to run on
 * an interval unconditionally). `checked` counts every row still
 * `pending_grant` at read time, whether or not this particular call ends
 * up expiring it, so a healthy in-flight approval still shows up in the
 * log line without being touched.
 */
export async function reconcileStuckGrantApprovals(): Promise<ReconcileGrantApprovalsSummary> {
  const checked = await prisma.payee.count({ where: { status: "pending_grant" } });
  const expired = await expireStalePendingGrants();
  return { checked, expired };
}
