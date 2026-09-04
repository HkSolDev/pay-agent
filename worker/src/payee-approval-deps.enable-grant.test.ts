import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@perflo-ap-agent/db";

// Mocks the whole CLI module so realApprovePayeeDeps.enablePerfloGrant's own
// dispatching logic (success -> approved, PerfloDefiniteFailure -> denied,
// anything else -> leave it alone) can be exercised directly against a real
// Postgres row, without spawning the actual Perflo CLI. Defined inline in
// the factory, not as top-level consts, since vi.mock is hoisted above any
// top-level declaration in this file (see payee-actions.test.ts's note on
// the same gotcha).
vi.mock("./perflo-cli", () => ({
  enableGrantViaPerfloCli: vi.fn(),
  createPerfloBeneficiary: vi.fn(async () => {}),
  GRANT_APPROVAL_TIMEOUT_MS: 660_000,
  PerfloDefiniteFailure: class PerfloDefiniteFailure extends Error {},
  PerfloUnknownOutcomeError: class PerfloUnknownOutcomeError extends Error {},
}));

const { enableGrantViaPerfloCli, PerfloDefiniteFailure, PerfloUnknownOutcomeError } = await import("./perflo-cli");
const { realApprovePayeeDeps } = await import("./payee-approval-deps.js");

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// onApproveUrl fires `void persistApproveUrl(...)` in production code — a
// real, unawaited Postgres write (deliberately: onApproveUrl is a sync
// callback deep in a streaming CLI parser with nothing to await it). A
// single flushMicrotasks() tick is not guaranteed to be enough time for
// that real network round-trip to land, especially with the rest of the
// suite sharing the same DB connection pool — so poll for the write
// instead of trusting a fixed number of ticks.
async function waitForApprovalUrl(payeeId: string, timeoutMs = 2000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: payeeId } });
    if (payee.pendingGrantApprovalUrl !== null || Date.now() >= deadline) return payee.pendingGrantApprovalUrl;
    await flushMicrotasks();
  }
}

// Same reasoning as waitForApprovalUrl: applyGrantOutcome is also a real,
// unawaited Postgres write reached after enablePerfloGrant's own promise
// chain settles, so poll for the terminal status rather than trusting a
// fixed number of ticks.
async function waitForStatus(payeeId: string, timeoutMs = 2000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: payeeId } });
    if (payee.status !== "pending_grant" || Date.now() >= deadline) return payee.status;
    await flushMicrotasks();
  }
}

async function makePendingPayee(id: string) {
  await prisma.payee.create({
    data: {
      id,
      name: `Enable Grant Test ${id}`,
      recipientNickname: `enable-grant-test-${id}`,
      status: "pending_grant",
      pendingGrantStartedAt: new Date(),
      pendingGrantExpiresAt: new Date(Date.now() + 600_000),
    },
  });
}

// The one-pending-grant-at-a-time lock is table-wide, not scoped to this
// file's own id prefix — and one of the tests below deliberately leaves a
// row in pending_grant (that's the whole point of the "ambiguous outcome"
// case). Force-clear any stray lock before each test, same reasoning as
// reconcile-grant-approvals.test.ts and payee-approval-deps.integration.test.ts.
async function clearAnyStrayLock() {
  await prisma.payee.updateMany({
    where: { status: "pending_grant" },
    data: { status: "not_approved", lastGrantOutcome: "expired", pendingGrantApprovalUrl: null },
  });
}

async function cleanup() {
  await clearAnyStrayLock();
  await prisma.payee.deleteMany({ where: { id: { startsWith: "enable-grant-test-" } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const grant = { perPaymentCapInr: "1000.00", totalCapInr: "5000.00", maxPayments: 5, expiresAt: "2026-12-31" };

describe("realApprovePayeeDeps.enablePerfloGrant — the async continuation that resolves a pending_grant row", () => {
  it("resolves the row to approved when the CLI call succeeds", async () => {
    vi.mocked(enableGrantViaPerfloCli).mockResolvedValueOnce(undefined);
    await makePendingPayee("enable-grant-test-1");

    realApprovePayeeDeps.enablePerfloGrant({ payeeId: "enable-grant-test-1", recipientNickname: "x", grant });
    const status = await waitForStatus("enable-grant-test-1");

    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: "enable-grant-test-1" } });
    expect(status).toBe("approved");
    expect(payee.grantApproved).toBe(true);
  });

  it("resolves the row to not_approved/denied on a definite CLI refusal", async () => {
    vi.mocked(enableGrantViaPerfloCli).mockRejectedValueOnce(new PerfloDefiniteFailure("denied by owner"));
    await makePendingPayee("enable-grant-test-2");

    realApprovePayeeDeps.enablePerfloGrant({ payeeId: "enable-grant-test-2", recipientNickname: "x", grant });
    const status = await waitForStatus("enable-grant-test-2");

    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: "enable-grant-test-2" } });
    expect(status).toBe("not_approved");
    expect(payee.lastGrantOutcome).toBe("denied");
  });

  // The money-safety-critical case (payment-review checklist item 2:
  // "timeout/unknown outcome must never auto-retry" — same FR-27 principle
  // this codebase already applies to payments). An ambiguous outcome
  // (our own kill timer fired, or the CLI's exit was unparseable) must
  // never be guessed as approved or denied — the row is left exactly as
  // pending_grant for the expiry sweep (reconcile-grant-approvals.ts) to
  // resolve later, once its own expiry genuinely passes.
  it("leaves the row untouched, still pending_grant, on an ambiguous/unknown CLI outcome", async () => {
    vi.mocked(enableGrantViaPerfloCli).mockRejectedValueOnce(new PerfloUnknownOutcomeError("killed after timeout"));
    await makePendingPayee("enable-grant-test-3");

    realApprovePayeeDeps.enablePerfloGrant({ payeeId: "enable-grant-test-3", recipientNickname: "x", grant });
    await flushMicrotasks();

    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: "enable-grant-test-3" } });
    expect(payee.status).toBe("pending_grant");
    expect(payee.lastGrantOutcome).toBeNull();
  });

  it("persists the approval URL the moment onApproveUrl fires, independent of the eventual outcome", async () => {
    // Never settling on its own here is deliberate (this test only checks
    // the URL write, not the final outcome) — but the mocked lock's row
    // still holds the real, table-wide pending_grant index in this shared
    // dev database, so it's released explicitly below rather than left for
    // the next beforeEach. See reconcile-grant-approvals.test.ts's note on
    // the same cross-file hazard.
    let release: () => void = () => {};
    const hang = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(enableGrantViaPerfloCli).mockImplementationOnce(async (args) => {
      args.onApproveUrl("https://app.perflo.ai/approve?sid=enable-grant-test-4");
      return hang;
    });
    await makePendingPayee("enable-grant-test-4");

    realApprovePayeeDeps.enablePerfloGrant({ payeeId: "enable-grant-test-4", recipientNickname: "x", grant });

    const url = await waitForApprovalUrl("enable-grant-test-4");
    expect(url).toBe("https://app.perflo.ai/approve?sid=enable-grant-test-4");

    release();
    await flushMicrotasks();
  });
});
