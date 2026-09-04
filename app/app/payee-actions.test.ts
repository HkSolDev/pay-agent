import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@perflo-ap-agent/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// createPerfloRecipient now shells out to the real Perflo CLI
// (payee-approval-deps.ts) — stub just the CLI call so this suite still
// exercises the real, Postgres-backed approvePayee path end-to-end without
// hitting the network.
vi.mock("../../worker/src/perflo-cli", () => ({ createPerfloBeneficiary: vi.fn(async () => {}) }));

const { createPayeeAction, replaceRailAction, revokeRailAction } = await import("./payee-actions");

const senderAddr = "billing@payee-actions.example";
const encryptionKey = "c".repeat(64);
const hashKey = "d".repeat(64);

async function cleanup() {
  const identity = await prisma.payeeIdentity.findUnique({ where: { senderAddr } });
  if (identity) {
    await prisma.payeePaymentMethod.deleteMany({ where: { payeeId: identity.payeeId } });
    await prisma.payeeIdentity.deleteMany({ where: { payeeId: identity.payeeId } });
    await prisma.payee.deleteMany({ where: { id: identity.payeeId } });
  }
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
  it("creates the payee", async () => {
    await createPayeeAction(baseFormData());

    const identity = await prisma.payeeIdentity.findUniqueOrThrow({ where: { senderAddr } });
    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: identity.payeeId } });
    expect(payee.status).toBe("approved");
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
