import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { approvePayee } from "./payee-approval.js";
import { realApprovePayeeDeps } from "./payee-approval-deps.js";

const encryptionKey = "c".repeat(64);
const hashKey = "d".repeat(64);
const senderAddr = "billing@rail-deps.example";

async function cleanup() {
  const identity = await prisma.payeeIdentity.findUnique({ where: { senderAddr } });
  if (identity) {
    await prisma.payeePaymentMethod.deleteMany({ where: { payeeId: identity.payeeId } });
    await prisma.payeeIdentity.deleteMany({ where: { payeeId: identity.payeeId } });
    await prisma.payee.deleteMany({ where: { id: identity.payeeId } });
  }
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
// findExistingApproval/saveApprovedPayee wired to the real, Postgres-backed
// implementation. Keeps this file's "no Perflo call" premise true.
const deps = {
  ...realApprovePayeeDeps,
  createPerfloRecipient: async () => ({ recipientNickname: "rail-deps-vendor-test" }),
};

beforeEach(async () => {
  process.env.PAYEE_ENCRYPTION_KEY = encryptionKey;
  process.env.PAYEE_HASH_KEY = hashKey;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
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
  it("persists a payee with grant fields and an encrypted rail", async () => {
    const result = await approvePayee(request, deps);
    expect(result.status).toBe("approved");
    if (result.status !== "approved") throw new Error("unreachable");

    const payee = await prisma.payee.findUniqueOrThrow({ where: { id: result.payeeId } });
    expect(payee.status).toBe("approved");
    expect(payee.grantApproved).toBe(true);
    expect(payee.grantPerPaymentCapInr).toBe("1000.00");
    expect(payee.grantTotalCapInr).toBe("5000.00");
    expect(payee.grantMaxPayments).toBe(5);
    expect(payee.grantExpiresAt?.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(payee.approvedAt).not.toBeNull();

    const method = await prisma.payeePaymentMethod.findFirstOrThrow({ where: { payeeId: result.payeeId } });
    expect(method.status).toBe("active");
    expect(Buffer.from(method.encryptedPayload).toString("utf8")).not.toContain("5010023456789");
  });

  it("is idempotent against the real database: repeating the same senderAddr never creates a second payee", async () => {
    const first = await approvePayee(request, deps);
    expect(first.status).toBe("approved");

    const second = await approvePayee(request, deps);
    expect(second.status).toBe("already_approved");
    if (second.status !== "already_approved" || first.status !== "approved") throw new Error("unreachable");
    expect(second.payeeId).toBe(first.payeeId);

    const count = await prisma.payee.count({ where: { id: first.payeeId } });
    expect(count).toBe(1);
  });
});
