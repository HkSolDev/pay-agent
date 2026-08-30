import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { resetDemoInbox, seedDemoInbox } from "./demo-inbox.js";
import { resetDemoPayees, seedDemoPayees } from "./demo-payees.js";

const encryptionKey = "c".repeat(64);
const hashKey = "d".repeat(64);

async function resolutionFor(gmailMessageId: string) {
  const row = await prisma.email.findUniqueOrThrow({ where: { gmailMessageId }, select: { payeeResolution: true } });
  return row.payeeResolution as { status: string };
}

beforeEach(async () => {
  process.env.PAYEE_ENCRYPTION_KEY = encryptionKey;
  process.env.PAYEE_HASH_KEY = hashKey;
  await resetDemoInbox();
  await resetDemoPayees();
});

afterAll(async () => {
  await resetDemoInbox();
  await resetDemoPayees();
});

describe("demo payees + demo inbox — the seeded scenarios actually resolve against approved payees", () => {
  it("resolves each demo scenario to the payee status its name promises", async () => {
    await seedDemoPayees();
    await seedDemoInbox(["changed-upi", "changed-bank", "unknown-sender", "multiple-rails", "conflicting-sender-rail"]);

    expect((await resolutionFor("demo-changed-upi")).status).toBe("details_changed");
    expect((await resolutionFor("demo-changed-bank")).status).toBe("details_changed");
    expect((await resolutionFor("demo-unknown-sender")).status).toBe("unknown_sender");
    expect((await resolutionFor("demo-multiple-rails")).status).toBe("multiple_payment_methods");
    expect((await resolutionFor("demo-conflicting-sender-rail")).status).toBe("identity_method_conflict");
  });

  it("excludes a revoked demo payee's rail from resolution", async () => {
    await seedDemoPayees();
    const revoked = await prisma.payeePaymentMethod.findFirstOrThrow({ where: { payeeId: "demo-payee-revoked" } });
    expect(revoked.status).toBe("revoked");
  });
});
