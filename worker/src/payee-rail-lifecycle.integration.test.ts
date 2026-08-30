import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { encryptPaymentMethod, hashPaymentMethod, normalizePaymentMethod } from "./payee-crypto.js";
import { replacePaymentRail, revokePaymentRail } from "./payee-rail-lifecycle.js";

const encryptionKey = "c".repeat(64);
const hashKey = "d".repeat(64);
const payeeId = "test-rail-lifecycle-1";

const prismaBytes = (value: Buffer): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(new ArrayBuffer(value.length));
  copy.set(value);
  return copy;
};

async function cleanup() {
  await prisma.payeeIdentity.deleteMany({ where: { payeeId } });
  await prisma.payeePaymentMethod.deleteMany({ where: { payeeId } });
  await prisma.payee.deleteMany({ where: { id: payeeId } });
}

async function seedPayeeWithUpiRail(): Promise<string> {
  const normalized = normalizePaymentMethod({ kind: "upi", vpa: "rail-lifecycle-owner@okaxis" });
  await prisma.payee.create({
    data: {
      id: payeeId, name: "Rail Lifecycle Owner", recipientNickname: "rail-lifecycle-perflo", grantApproved: true,
      identities: { create: { senderAddr: "billing@rail-lifecycle.example" } },
      paymentMethods: { create: { rail: "upi", encryptedPayload: prismaBytes(encryptPaymentMethod(normalized)), lookupHash: hashPaymentMethod(normalized) } },
    },
  });
  return prisma.payeePaymentMethod.findFirstOrThrow({ where: { payeeId } }).then((m) => m.id);
}

beforeEach(async () => {
  process.env.PAYEE_ENCRYPTION_KEY = encryptionKey;
  process.env.PAYEE_HASH_KEY = hashKey;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe("Payee rail lifecycle — replace and revoke, real Postgres", () => {
  it("does not revoke anything without explicit owner confirmation", async () => {
    const methodId = await seedPayeeWithUpiRail();
    await expect(revokePaymentRail({ methodId, ownerConfirmed: false })).resolves.toEqual({ status: "confirmation_required" });
    const stored = await prisma.payeePaymentMethod.findUniqueOrThrow({ where: { id: methodId } });
    expect(stored.status).toBe("active");
  });

  it("revokes an active rail, stamping revokedAt, instead of deleting the row", async () => {
    const methodId = await seedPayeeWithUpiRail();
    await expect(revokePaymentRail({ methodId, ownerConfirmed: true })).resolves.toEqual({ status: "revoked" });
    const stored = await prisma.payeePaymentMethod.findUniqueOrThrow({ where: { id: methodId } });
    expect(stored.status).toBe("revoked");
    expect(stored.revokedAt).not.toBeNull();
  });

  it("does not replace anything without explicit owner confirmation", async () => {
    const methodId = await seedPayeeWithUpiRail();
    await expect(replacePaymentRail({
      oldMethodId: methodId, ownerConfirmed: false, newMethod: { kind: "upi", vpa: "rail-lifecycle-owner-new@okaxis" },
    })).resolves.toEqual({ status: "confirmation_required" });
    const count = await prisma.payeePaymentMethod.count({ where: { payeeId } });
    expect(count).toBe(1);
  });

  it("rejects an invalid replacement rail before touching the old row", async () => {
    const methodId = await seedPayeeWithUpiRail();
    await expect(replacePaymentRail({
      oldMethodId: methodId, ownerConfirmed: true, newMethod: { kind: "upi", vpa: "billing@gmail.com" },
    })).resolves.toEqual({ status: "invalid_method" });
    const stored = await prisma.payeePaymentMethod.findUniqueOrThrow({ where: { id: methodId } });
    expect(stored.status).toBe("active");
  });

  it("replaces a rail: old row marked replaced and linked, new row active", async () => {
    const oldMethodId = await seedPayeeWithUpiRail();
    const result = await replacePaymentRail({
      oldMethodId, ownerConfirmed: true, newMethod: { kind: "upi", vpa: "rail-lifecycle-owner-new@okaxis" },
    });
    expect(result.status).toBe("replaced");
    if (result.status !== "replaced") throw new Error("unreachable");

    const oldRow = await prisma.payeePaymentMethod.findUniqueOrThrow({ where: { id: oldMethodId } });
    expect(oldRow.status).toBe("replaced");
    expect(oldRow.replacedAt).not.toBeNull();
    expect(oldRow.replacedByMethodId).toBe(result.newMethodId);

    const newRow = await prisma.payeePaymentMethod.findUniqueOrThrow({ where: { id: result.newMethodId } });
    expect(newRow.status).toBe("active");
    expect(newRow.payeeId).toBe(payeeId);
    expect(Buffer.from(newRow.encryptedPayload).toString("utf8")).not.toContain("rail-lifecycle-owner-new@okaxis");
  });
});
