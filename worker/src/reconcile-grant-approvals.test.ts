import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { expireStalePendingGrants, reconcileStuckGrantApprovals } from "./reconcile-grant-approvals.js";

// Integration test against the real local Postgres, same reasoning as
// payment-claim.test.ts / payment-reconcile.test.ts: this is a guarded
// updateMany whose whole job is "only touch what's actually stale," which a
// mock can't prove.

async function makePayee(id: string, overrides: {
  status: string;
  pendingGrantExpiresAt?: Date | null;
  pendingGrantApprovalUrl?: string | null;
}) {
  await prisma.payee.create({
    data: {
      id,
      name: `Reconcile Test ${id}`,
      recipientNickname: `reconcile-test-${id}`,
      status: overrides.status,
      pendingGrantStartedAt: overrides.status === "pending_grant" ? new Date() : null,
      pendingGrantExpiresAt: overrides.pendingGrantExpiresAt ?? null,
      pendingGrantApprovalUrl: overrides.pendingGrantApprovalUrl ?? null,
    },
  });
}

// The one-pending-grant-at-a-time lock (payees_one_pending_grant_key) is a
// genuinely global, table-wide invariant, not scoped to this file's own
// "reconcile-grant-test-" id prefix — and this suite shares one real
// Postgres database with every other test file in the repo. A fire-and-
// forget enablePerfloGrant continuation left running past another file's
// own cleanup (see payee-actions.test.ts's note on the same issue) can
// leave a stray row in pending_grant that would otherwise block every
// test below that tries to create its own. Force-clear any such row before
// each test here, regardless of which file or fixture it belongs to.
async function clearAnyStrayLock() {
  await prisma.payee.updateMany({
    where: { status: "pending_grant" },
    data: { status: "not_approved", lastGrantOutcome: "expired", pendingGrantApprovalUrl: null },
  });
}

async function cleanup() {
  await clearAnyStrayLock();
  await prisma.payee.deleteMany({ where: { id: { startsWith: "reconcile-grant-test-" } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("expireStalePendingGrants", () => {
  it("resolves a pending_grant row past its own expiry to not_approved/expired", async () => {
    const past = new Date(Date.now() - 60_000);
    await makePayee("reconcile-grant-test-1", { status: "pending_grant", pendingGrantExpiresAt: past, pendingGrantApprovalUrl: "https://app.perflo.ai/approve?sid=stale" });

    const count = await expireStalePendingGrants();

    expect(count).toBeGreaterThanOrEqual(1);
    const row = await prisma.payee.findUniqueOrThrow({ where: { id: "reconcile-grant-test-1" } });
    expect(row.status).toBe("not_approved");
    expect(row.lastGrantOutcome).toBe("expired");
    expect(row.pendingGrantApprovalUrl).toBeNull();
  });

  it("leaves a pending_grant row that has not expired yet untouched", async () => {
    const future = new Date(Date.now() + 600_000);
    await makePayee("reconcile-grant-test-2", { status: "pending_grant", pendingGrantExpiresAt: future });

    await expireStalePendingGrants();

    const row = await prisma.payee.findUniqueOrThrow({ where: { id: "reconcile-grant-test-2" } });
    expect(row.status).toBe("pending_grant");
    expect(row.lastGrantOutcome).toBeNull();
  });

  it("never touches an already-resolved payee (approved, not_approved, revoked)", async () => {
    const past = new Date(Date.now() - 60_000);
    await makePayee("reconcile-grant-test-3", { status: "approved" });
    await makePayee("reconcile-grant-test-4", { status: "not_approved" });
    await makePayee("reconcile-grant-test-5", { status: "revoked" });
    void past;

    await expireStalePendingGrants();

    const rows = await prisma.payee.findMany({
      where: { id: { in: ["reconcile-grant-test-3", "reconcile-grant-test-4", "reconcile-grant-test-5"] } },
      orderBy: { id: "asc" },
    });
    expect(rows.map((r) => r.status)).toEqual(["approved", "not_approved", "revoked"]);
  });

  it("is safe to call twice in a row — the second call finds nothing left to expire", async () => {
    const past = new Date(Date.now() - 60_000);
    await makePayee("reconcile-grant-test-6", { status: "pending_grant", pendingGrantExpiresAt: past });

    const first = await expireStalePendingGrants();
    const second = await expireStalePendingGrants();

    expect(first).toBeGreaterThanOrEqual(1);
    expect(second).toBe(0);
  });
});

describe("reconcileStuckGrantApprovals", () => {
  // Only one row at a time can ever actually hold "pending_grant" — the
  // partial unique index (payees_one_pending_grant_key) itself refuses a
  // second one, confirmed directly by trying to create two here and
  // watching Postgres reject it. So this test proves the summary shape
  // (checked vs. expired) against the one row that's allowed to exist,
  // not against two simultaneous ones.
  it("reports the pending_grant row it found and that it expired it", async () => {
    const past = new Date(Date.now() - 60_000);
    await makePayee("reconcile-grant-test-7", { status: "pending_grant", pendingGrantExpiresAt: past });

    const summary = await reconcileStuckGrantApprovals();

    expect(summary.checked).toBeGreaterThanOrEqual(1);
    expect(summary.expired).toBeGreaterThanOrEqual(1);

    const row = await prisma.payee.findUniqueOrThrow({ where: { id: "reconcile-grant-test-7" } });
    expect(row.status).toBe("not_approved");
  });

  it("confirms the lock itself: a second pending_grant row cannot be created while one already exists", async () => {
    const future = new Date(Date.now() + 600_000);
    await makePayee("reconcile-grant-test-8", { status: "pending_grant", pendingGrantExpiresAt: future });

    await expect(makePayee("reconcile-grant-test-9", { status: "pending_grant", pendingGrantExpiresAt: future }))
      .rejects.toThrow(/payees_one_pending_grant_key/);

    const stillPending = await prisma.payee.findUniqueOrThrow({ where: { id: "reconcile-grant-test-8" } });
    expect(stillPending.status).toBe("pending_grant");
  });
});
