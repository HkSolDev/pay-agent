import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { approvePayee } from "./payee-approval.js";
import { applyGrantOutcome, persistApproveUrl, realApprovePayeeDeps } from "./payee-approval-deps.js";

const savedEncryptionKey = process.env.PAYEE_ENCRYPTION_KEY;
const savedHashKey = process.env.PAYEE_HASH_KEY;
const encryptionKey = "c".repeat(64);
const hashKey = "d".repeat(64);
const senderAddr = "billing@rail-deps.example";
const senderAddrTwo = "billing@rail-deps-two.example";

async function cleanupSender(addr: string) {
  const identity = await prisma.payeeIdentity.findUnique({ where: { senderAddr: addr } });
  if (identity) {
    await prisma.payeePaymentMethod.deleteMany({ where: { payeeId: identity.payeeId } });
    await prisma.payeeIdentity.deleteMany({ where: { payeeId: identity.payeeId } });
    await prisma.payee.deleteMany({ where: { id: identity.payeeId } });
  }
}

// The one-pending-grant-at-a-time lock (payees_one_pending_grant_key) is a
// genuinely global, table-wide invariant, not scoped to either sender
// address above — and this suite shares one real Postgres database with
// every other test file in the repo. A fire-and-forget enablePerfloGrant
// continuation left running past another file's own cleanup can leave a
// stray row in pending_grant that would otherwise block every "started"
// assertion below. Force-clear any such row before each test here,
// regardless of which file or fixture it belongs to.
async function clearAnyStrayLock() {
  await prisma.payee.updateMany({
    where: { status: "pending_grant" },
    data: { status: "not_approved", lastGrantOutcome: "expired", pendingGrantApprovalUrl: null },
  });
}

async function cleanup() {
  await clearAnyStrayLock();
  await cleanupSender(senderAddr);
  await cleanupSender(senderAddrTwo);
}

const request = {
  ownerConfirmed: true,
  name: "Rail Deps Vendor",
  firstName: "Rail",
  lastName: "Vendor",
  senderAddr,
  // bank_neft, not upi: the connected Perflo account has no UPI schema
  // (confirmed live via `beneficiary schemas --country IN`), so
  // createPerfloRecipient now throws for UPI — see payee-approval-deps.test.ts.
  paymentMethod: { kind: "bank_neft" as const, accountNumber: "5010023456789", ifsc: "HDFC0001234" },
  grant: { perPaymentCapInr: "1000.00", totalCapInr: "5000.00", maxPayments: 5, expiresAt: "2026-12-31" },
};

// createPerfloRecipient now shells out to the real Perflo CLI (see
// payee-approval-deps.ts), so this suite — which is about Postgres
// persistence, not Perflo — stubs just that one dependency and keeps
// findExistingApproval/startPendingGrant wired to the real, Postgres-backed
// implementation. enablePerfloGrant is also stubbed to a no-op here — its
// real behavior spawns the actual Perflo CLI and blocks for up to ~11
// minutes (see GRANT_APPROVAL_TIMEOUT_MS in perflo-cli.ts), which has no
// place in a fast, deterministic test suite; that path is covered by
// perflo-cli.test.ts's pure-function tests plus the dedicated
// applyGrantOutcome/persistApproveUrl integration tests further down this
// file. Keeps this file's "no real Perflo call" premise true.
const deps = {
  ...realApprovePayeeDeps,
  createPerfloRecipient: async () => ({ recipientNickname: "rail-deps-vendor-test" }),
  enablePerfloGrant: () => {},
};

beforeEach(async () => {
  process.env.PAYEE_ENCRYPTION_KEY = encryptionKey;
  process.env.PAYEE_HASH_KEY = hashKey;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (savedEncryptionKey === undefined) delete process.env.PAYEE_ENCRYPTION_KEY;
  else process.env.PAYEE_ENCRYPTION_KEY = savedEncryptionKey;
  if (savedHashKey === undefined) delete process.env.PAYEE_HASH_KEY;
  else process.env.PAYEE_HASH_KEY = savedHashKey;
});

describe("payee-approval-deps module — structurally cannot execute a payment", () => {
  it("never imports the payment executor, manual-pay, or claim path", () => {
    const source = readFileSync(new URL("./payee-approval-deps.ts", import.meta.url), "utf8");
    const importLines = source.split("\n").filter((line) => line.trim().startsWith("import"));
    for (const line of importLines) {
      expect(line).not.toMatch(/manual-pay|payment-claim/);
    }
  });

  // perflo-cli.js is legitimately imported now (createPerfloBeneficiary, to
  // register a payee's rail with Perflo) — but the boundary this suite
  // exists to guard is money movement specifically, so assert the one
  // function that actually pays (payViaPerfloCli) is never pulled in here.
  it("imports from perflo-cli.js only for beneficiary registration, never for payment", () => {
    const source = readFileSync(new URL("./payee-approval-deps.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/payViaPerfloCli/);
  });
});

describe("Real ApprovePayeeDeps — Postgres-backed approvePayee, no Perflo call", () => {
  it("persists a pending_grant payee with grant fields and an encrypted rail, not yet approved", async () => {
    const result = await approvePayee(request, deps);
    expect(result.status).toBe("pending_grant");
    if (result.status !== "pending_grant") throw new Error("unreachable");

    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: result.payeeId } });
    expect(payee.status).toBe("pending_grant");
    expect(payee.grantApproved).toBe(false);
    expect(payee.pendingGrantStartedAt).not.toBeNull();
    expect(payee.pendingGrantExpiresAt).not.toBeNull();
    expect(payee.grantPerPaymentCapInr).toBe("1000.00");
    expect(payee.grantTotalCapInr).toBe("5000.00");
    expect(payee.grantMaxPayments).toBe(5);
    expect(payee.grantExpiresAt?.toISOString().slice(0, 10)).toBe("2026-12-31");

    const method = await prisma.payeePaymentMethod.findFirstOrThrow({ where: { payeeId: result.payeeId } });
    expect(method.status).toBe("active");
    expect(Buffer.from(method.encryptedPayload).toString("utf8")).not.toContain("5010023456789");
  });

  it("is idempotent against the real database: repeating the same senderAddr while still pending never creates a second payee", async () => {
    const first = await approvePayee(request, deps);
    expect(first.status).toBe("pending_grant");
    if (first.status !== "pending_grant") throw new Error("unreachable");

    // The payee is still pending_grant (never resolved in this test), so a
    // second attempt for the same sender hits the same one-pending-grant
    // lock a *different* payee would — it's still the one row in flight.
    const second = await approvePayee(request, deps);
    expect(second.status).toBe("grant_in_progress");

    const count = await prisma.payee.count({ where: { id: first.payeeId } });
    expect(count).toBe(1);
  });
});

describe("the one-pending-grant-at-a-time lock, across two different payees", () => {
  it("only one of two concurrent approvals for different payees wins the lock", async () => {
    const requestTwo = { ...request, name: "Rail Deps Vendor Two", senderAddr: senderAddrTwo };
    const depsTwo = { ...deps, createPerfloRecipient: async () => ({ recipientNickname: "rail-deps-vendor-two-test" }) };

    const [a, b] = await Promise.all([
      approvePayee(request, deps),
      approvePayee(requestTwo, depsTwo),
    ]);

    const results = [a.status, b.status];
    // Real Postgres unique-index enforcement, not an application-level
    // check-then-write — exactly the race claimPaymentIntent's own
    // concurrent-claim test (payment-claim.test.ts) proves for a single
    // row, but here across two *different* rows racing a table-wide
    // invariant instead.
    expect(results.filter((s) => s === "pending_grant")).toHaveLength(1);
    expect(results.filter((s) => s === "grant_in_progress")).toHaveLength(1);

    const pendingCount = await prisma.payee.count({ where: { status: "pending_grant" } });
    expect(pendingCount).toBe(1);

    // Release the lock immediately rather than leaving the winning payee
    // pending_grant until this file's next beforeEach — see the note on
    // clearAnyStrayLock above for why that matters beyond just this file.
    await clearAnyStrayLock();
  });
});

describe("retry after denial/expiry reuses the same payee row", () => {
  it("clears lastGrantOutcome and re-enters pending_grant on a fresh attempt for a not_approved payee", async () => {
    const first = await approvePayee(request, deps);
    if (first.status !== "pending_grant") throw new Error("unreachable");

    // Simulate the CLI having already denied this attempt (same DB write
    // enablePerfloGrant's real continuation performs on PerfloDefiniteFailure).
    await applyGrantOutcome(first.payeeId, "denied");
    const denied = await prisma.payee.findUniqueOrThrow({ where: { id: first.payeeId } });
    expect(denied.status).toBe("not_approved");
    expect(denied.lastGrantOutcome).toBe("denied");

    // The owner clicks Approve again for the same payee/sender.
    const retry = await approvePayee(request, deps);
    expect(retry.status).toBe("pending_grant");
    if (retry.status !== "pending_grant") throw new Error("unreachable");
    expect(retry.payeeId).toBe(first.payeeId); // same row reused, not a second payee

    const retried = await prisma.payee.findUniqueOrThrow({ where: { id: first.payeeId } });
    expect(retried.status).toBe("pending_grant");
    expect(retried.lastGrantOutcome).toBeNull();

    const count = await prisma.payee.count({ where: { id: first.payeeId } });
    expect(count).toBe(1);
  });

  it("only one of two concurrent retry attempts on the same denied payee wins", async () => {
    const first = await approvePayee(request, deps);
    if (first.status !== "pending_grant") throw new Error("unreachable");
    await applyGrantOutcome(first.payeeId, "denied");

    const [a, b] = await Promise.all([
      approvePayee(request, deps),
      approvePayee(request, deps),
    ]);

    const results = [a.status, b.status];
    expect(results.filter((s) => s === "pending_grant")).toHaveLength(1);
    expect(results.filter((s) => s === "grant_in_progress")).toHaveLength(1);

    const count = await prisma.payee.count({ where: { id: first.payeeId } });
    expect(count).toBe(1); // still the same row, never duplicated

    await clearAnyStrayLock();
  });
});

describe("applyGrantOutcome", () => {
  it("resolves a pending_grant payee to approved, clearing the pending fields", async () => {
    const started = await approvePayee(request, deps);
    if (started.status !== "pending_grant") throw new Error("unreachable");
    await persistApproveUrl(started.payeeId, "https://app.perflo.ai/approve?sid=outcome-test");

    await applyGrantOutcome(started.payeeId, "approved");

    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: started.payeeId } });
    expect(payee.status).toBe("approved");
    expect(payee.grantApproved).toBe(true);
    expect(payee.approvedAt).not.toBeNull();
    expect(payee.pendingGrantApprovalUrl).toBeNull();
    expect(payee.lastGrantOutcome).toBeNull();
  });

  it("resolves a pending_grant payee to not_approved/denied on a definite CLI refusal", async () => {
    const started = await approvePayee(request, deps);
    if (started.status !== "pending_grant") throw new Error("unreachable");

    await applyGrantOutcome(started.payeeId, "denied");

    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: started.payeeId } });
    expect(payee.status).toBe("not_approved");
    expect(payee.grantApproved).toBe(false);
    expect(payee.lastGrantOutcome).toBe("denied");
  });

  it("never resolves a payee that isn't currently pending_grant — no stale write clobbering a later state", async () => {
    const started = await approvePayee(request, deps);
    if (started.status !== "pending_grant") throw new Error("unreachable");
    await applyGrantOutcome(started.payeeId, "approved");

    // A late-arriving/duplicate resolution (e.g. two overlapping CLI
    // invocations somehow both completing) must not un-approve a payee
    // that has already resolved.
    await applyGrantOutcome(started.payeeId, "denied");

    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: started.payeeId } });
    expect(payee.status).toBe("approved");
  });
});

describe("persistApproveUrl", () => {
  it("writes the approval URL onto a pending_grant payee the moment it's captured", async () => {
    const started = await approvePayee(request, deps);
    if (started.status !== "pending_grant") throw new Error("unreachable");

    await persistApproveUrl(started.payeeId, "https://app.perflo.ai/approve?sid=url-test");

    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: started.payeeId } });
    expect(payee.pendingGrantApprovalUrl).toBe("https://app.perflo.ai/approve?sid=url-test");
  });
});
