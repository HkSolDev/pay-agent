import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { enableGrantViaPerfloCli } from "../../worker/src/perflo-cli";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// createPerfloRecipient and enableGrantViaPerfloCli both shell out to the
// real Perflo CLI (payee-approval-deps.ts) — stub both so this suite still
// exercises the real, Postgres-backed approvePayee/startPendingGrant path
// end-to-end without hitting the network or blocking on a browser approval
// that can take up to ~11 minutes (GRANT_APPROVAL_TIMEOUT_MS). Resolving
// enableGrantViaPerfloCli immediately means enablePerfloGrant's fire-and-
// forget continuation runs applyGrantOutcome("approved") on the next
// microtask — tests that need to see that land use flushMicrotasks below
// rather than asserting on it synchronously.
vi.mock("../../worker/src/perflo-cli", () => ({
  createPerfloBeneficiary: vi.fn(async () => {}),
  enableGrantViaPerfloCli: vi.fn(async () => {}),
  GRANT_APPROVAL_TIMEOUT_MS: 660_000,
  // Defined inline: vi.mock's factory is hoisted above any top-level
  // `const`/`class` in this file, so a class declared outside it isn't
  // initialized yet when the factory itself runs.
  PerfloDefiniteFailure: class PerfloDefiniteFailure extends Error {},
}));

// enablePerfloGrant is deliberately fire-and-forget (see payee-approval.ts)
// — createPayeeAction returns before its promise chain settles, and that
// continuation ends in a real, unawaited Postgres write. A single
// setTimeout(0) tick only flushes microtasks, not the real network
// round-trip a Postgres write needs — it isn't a reliable way to wait for
// that write to land. Every test that calls createPayeeAction (not just the
// one that asserts on the outcome) must wait for the row to leave
// pending_grant before moving on, or its dangling write can land during a
// later test here or in another file that shares this same lock-checking
// invariant.
async function waitUntilGrantSettled(payeeId: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: payeeId } });
    if (payee.status !== "pending_grant" || Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const { createPayeeAction, replaceRailAction, revokeRailAction } = await import("./payee-actions");

const senderAddr = "billing@payee-actions.example";
const senderAddrTwo = "billing@payee-actions-two.example";
const encryptionKey = "c".repeat(64);
const hashKey = "d".repeat(64);

async function cleanupSender(addr: string) {
  const identity = await prisma.payeeIdentity.findUnique({ where: { senderAddr: addr } });
  if (identity) {
    await prisma.payeePaymentMethod.deleteMany({ where: { payeeId: identity.payeeId } });
    await prisma.payeeIdentity.deleteMany({ where: { payeeId: identity.payeeId } });
    await prisma.payee.deleteMany({ where: { id: identity.payeeId } });
  }
}

// The one-pending-grant-at-a-time lock (payees_one_pending_grant_key) is a
// genuinely global, table-wide invariant, not scoped to this file's own
// senders — and this suite shares one real Postgres database with every
// other test file in the repo. This file in particular exercises the real,
// fire-and-forget enablePerfloGrant path (see the mock comment above), so a
// test that finishes before its own microtask flushes can leave a stray row
// in pending_grant that would otherwise block every "started"/"locked"
// assertion in every other integration test file. Force-clear any such row
// before each test here, matching payee-approval-deps.integration.test.ts
// and reconcile-grant-approvals.test.ts.
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

function baseFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    name: "Payee Actions Vendor",
    firstName: "Payee",
    lastName: "Vendor",
    senderAddr,
    rail: "bank_neft",
    vpa: "",
    // A distinct account number from other integration tests' bank fixtures
    // (e.g. payee-approval-deps.integration.test.ts) — the rail's lookup
    // hash is unique across all payees, so two test files reusing the same
    // account number/IFSC collide on that constraint when run together.
    accountNumber: "6020034567890",
    ifsc: "ICIC0002345",
    perPaymentCapInr: "1000.00",
    totalCapInr: "5000.00",
    maxPayments: "5",
    expiresAt: "2026-12-31",
    ownerConfirmed: "on",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(async () => {
  process.env.PAYEE_ENCRYPTION_KEY = encryptionKey;
  process.env.PAYEE_HASH_KEY = hashKey;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe("payee-actions module — structurally cannot execute a payment", () => {
  it("never imports the payment executor or manual-pay claim path", () => {
    const source = readFileSync(new URL("./payee-actions.ts", import.meta.url), "utf8");
    const importLines = source.split("\n").filter((line) => line.trim().startsWith("import"));
    for (const line of importLines) {
      expect(line).not.toMatch(/perflo-cli|manual-pay|payment-claim/);
    }
  });
});

describe("createPayeeAction — never touches payment execution", () => {
  // createPayeeAction itself only ever synchronously starts the
  // pending_grant row (proven directly, with a real un-mocked
  // enablePerfloGrant, by payee-approval-deps.integration.test.ts) — this
  // mocked-CLI suite is about the rest of the chain: that a mocked, fast
  // enableGrantViaPerfloCli resolution really does land as "approved" once
  // its fire-and-forget continuation runs.
  it("creates the payee, and it eventually resolves to approved once the (mocked) CLI call settles", async () => {
    await createPayeeAction(baseFormData());

    const identity = await prisma.payeeIdentity.findUniqueOrThrow({ where: { senderAddr } });
    await waitUntilGrantSettled(identity.payeeId);
    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: identity.payeeId } });
    expect(payee.status).toBe("approved");
  });

  it("surfaces the one-pending-grant-at-a-time lock as a clear message, not a raw database error", async () => {
    // Keep the first payee's CLI call from settling until this test
    // explicitly releases it below — the partial unique index behind this
    // lock is table-wide and this suite shares a real Postgres database
    // with every other test file in the repo (see hands-off.md's repeated
    // notes on shared-dev-DB test isolation), so a row left in
    // pending_grant beyond this test's own cleanup would hold that global
    // lock hostage for whichever file happens to run next.
    let releaseFirstCall: () => void = () => {};
    const hang = new Promise<void>((resolve) => { releaseFirstCall = resolve; });
    vi.mocked(enableGrantViaPerfloCli).mockImplementationOnce(() => hang);
    await createPayeeAction(baseFormData());

    await expect(createPayeeAction(baseFormData({ senderAddr: senderAddrTwo, accountNumber: "7030045678901", ifsc: "AXIS0003456" })))
      .rejects.toThrow(/already in progress/);

    await expect(prisma.payeeIdentity.findUnique({ where: { senderAddr: senderAddrTwo } })).resolves.toBeNull();

    // Release the lock before the test ends, and wait for the real
    // (unawaited-by-production-code) applyGrantOutcome write to actually
    // land, rather than deleting the row out from under it — otherwise
    // that write can complete during a later test and re-trip the global
    // pending_grant lock this test exists to prove.
    const firstIdentity = await prisma.payeeIdentity.findUniqueOrThrow({ where: { senderAddr } });
    releaseFirstCall();
    await waitUntilGrantSettled(firstIdentity.payeeId);
    await cleanupSender(senderAddr);
  });

  it("rejects submission without owner confirmation, before writing anything", async () => {
    await expect(createPayeeAction(baseFormData({ ownerConfirmed: "" }))).rejects.toThrow();
    await expect(prisma.payeeIdentity.findUnique({ where: { senderAddr } })).resolves.toBeNull();
  });

  it("rejects an invalid rail with a descriptive error, before writing anything", async () => {
    await expect(createPayeeAction(baseFormData({ rail: "upi", vpa: "billing@gmail.com" }))).rejects.toThrow(/UPI/);
    await expect(prisma.payeeIdentity.findUnique({ where: { senderAddr } })).resolves.toBeNull();
  });
});

describe("replaceRailAction / revokeRailAction — same execution boundary", () => {
  it("blocks rail replacement until the real Perflo beneficiary is re-registered and re-approved", async () => {
    await createPayeeAction(baseFormData());
    const identity = await prisma.payeeIdentity.findUniqueOrThrow({ where: { senderAddr } });
    await waitUntilGrantSettled(identity.payeeId);
    const method = await prisma.payeePaymentMethod.findFirstOrThrow({ where: { payeeId: identity.payeeId } });

    await expect(replaceRailAction((() => {
      const fd = new FormData();
      fd.set("oldMethodId", method.id);
      fd.set("ownerConfirmed", "on");
      fd.set("rail", "upi");
      fd.set("vpa", "payee-actions-new@okaxis");
      fd.set("accountNumber", "");
      fd.set("ifsc", "");
      return fd;
    })())).rejects.toThrow(/new Perflo beneficiary and obtain a new approval/);

    const oldRow = await prisma.payeePaymentMethod.findUniqueOrThrow({ where: { id: method.id } });
    expect(oldRow.status).toBe("active");
    expect(await prisma.payeePaymentMethod.count({ where: { payeeId: identity.payeeId } })).toBe(1);
  });

  it("revokes a rail only with owner confirmation", async () => {
    await createPayeeAction(baseFormData());
    const identity = await prisma.payeeIdentity.findUniqueOrThrow({ where: { senderAddr } });
    await waitUntilGrantSettled(identity.payeeId);
    const method = await prisma.payeePaymentMethod.findFirstOrThrow({ where: { payeeId: identity.payeeId } });

    await expect(revokeRailAction((() => {
      const fd = new FormData();
      fd.set("methodId", method.id);
      fd.set("ownerConfirmed", "");
      return fd;
    })())).rejects.toThrow();

    await revokeRailAction((() => {
      const fd = new FormData();
      fd.set("methodId", method.id);
      fd.set("ownerConfirmed", "on");
      return fd;
    })());

    const row = await prisma.payeePaymentMethod.findUniqueOrThrow({ where: { id: method.id } });
    expect(row.status).toBe("revoked");
  });
});
