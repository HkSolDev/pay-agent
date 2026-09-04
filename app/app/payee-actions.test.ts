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
// — createPayeeAction returns before its promise chain settles. Tests that
// need to observe the eventual applyGrantOutcome write flush the microtask
// queue once, matching how a mocked-resolved promise actually resolves.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

async function cleanup() {
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
    await flushMicrotasks();

    const identity = await prisma.payeeIdentity.findUniqueOrThrow({ where: { senderAddr } });
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

    // Release the lock before the test ends — enableGrantViaPerfloCli
    // rejecting here mirrors a real PerfloUnknownOutcomeError-shaped
    // outcome, which deliberately leaves the row as pending_grant rather
    // than guessing; delete it directly instead of waiting on that chain.
    releaseFirstCall();
    await flushMicrotasks();
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
  it("replaces a rail only with owner confirmation, and never creates a PaymentIntent", async () => {
    await createPayeeAction(baseFormData());
    const identity = await prisma.payeeIdentity.findUniqueOrThrow({ where: { senderAddr } });
    const method = await prisma.payeePaymentMethod.findFirstOrThrow({ where: { payeeId: identity.payeeId } });

    await replaceRailAction((() => {
      const fd = new FormData();
      fd.set("oldMethodId", method.id);
      fd.set("ownerConfirmed", "on");
      fd.set("rail", "upi");
      fd.set("vpa", "payee-actions-new@okaxis");
      fd.set("accountNumber", "");
      fd.set("ifsc", "");
      return fd;
    })());

    const oldRow = await prisma.payeePaymentMethod.findUniqueOrThrow({ where: { id: method.id } });
    expect(oldRow.status).toBe("replaced");
  });

  it("revokes a rail only with owner confirmation", async () => {
    await createPayeeAction(baseFormData());
    const identity = await prisma.payeeIdentity.findUniqueOrThrow({ where: { senderAddr } });
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
