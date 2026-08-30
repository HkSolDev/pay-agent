import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { resetDemoInbox, seedDemoInbox } from "./demo-inbox.js";
import { resetDemoPayees, seedDemoPayees } from "./demo-payees.js";

const encryptionKey = "c".repeat(64);
const hashKey = "d".repeat(64);

async function resolutionFor(gmailMessageId: string) {
  const row = await prisma.email.findUniqueOrThrow({ where: { gmailMessageId }, select: { payeeResolution: true, policyDecision: true, extractionSummary: true, attachments: true, duplicateResult: true } });
  return row as { payeeResolution: { status: string }; policyDecision: string; extractionSummary: { amount: unknown }; attachments: unknown; duplicateResult: { duplicate?: boolean; suspiciousConflict?: string } };
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

    expect((await resolutionFor("demo-changed-upi")).payeeResolution.status).toBe("details_changed");
    expect((await resolutionFor("demo-changed-bank")).payeeResolution.status).toBe("details_changed");
    expect((await resolutionFor("demo-unknown-sender")).payeeResolution.status).toBe("unknown_sender");
    expect((await resolutionFor("demo-multiple-rails")).payeeResolution.status).toBe("multiple_payment_methods");
    expect((await resolutionFor("demo-conflicting-sender-rail")).payeeResolution.status).toBe("identity_method_conflict");
  });

  it("excludes a revoked demo payee's rail from resolution", async () => {
    await seedDemoPayees();
    const revoked = await prisma.payeePaymentMethod.findFirstOrThrow({ where: { payeeId: "demo-payee-revoked" } });
    expect(revoked.status).toBe("revoked");
  });

  it("routes every documented edge case through the review-only policy boundary", async () => {
    await seedDemoPayees();
    await seedDemoInbox();

    expect((await resolutionFor("demo-missing-amount")).policyDecision).toBe("needs_approval");
    expect((await resolutionFor("demo-missing-currency")).policyDecision).toBe("needs_approval");
    expect((await resolutionFor("demo-unsupported-currency")).policyDecision).toBe("needs_approval");
    expect((await resolutionFor("demo-scanned-pdf")).policyDecision).toBe("needs_approval");
    expect((await resolutionFor("demo-corrupt-pdf")).policyDecision).toBe("needs_approval");
    expect((await resolutionFor("demo-lookalike-domain")).policyDecision).toBe("quarantine");
    expect((await resolutionFor("demo-reply-to-mismatch")).policyDecision).toBe("needs_approval");
    expect((await resolutionFor("demo-changed-upi")).policyDecision).toBe("needs_approval");
    expect((await resolutionFor("demo-changed-bank")).policyDecision).toBe("needs_approval");
    expect((await resolutionFor("demo-multiple-rails")).policyDecision).toBe("needs_approval");
    expect((await resolutionFor("demo-conflicting-sender-rail")).policyDecision).toBe("quarantine");
    expect((await resolutionFor("demo-exact-duplicate")).duplicateResult.duplicate).toBe(false);
    expect((await resolutionFor("demo-exact-duplicate-replay")).duplicateResult.duplicate).toBe(true);
    expect((await resolutionFor("demo-exact-duplicate-replay")).policyDecision).toBe("ignore");
    expect((await resolutionFor("demo-conflicting-duplicate")).duplicateResult.suspiciousConflict).toBe("reference_amount_mismatch");
    expect((await resolutionFor("demo-conflicting-duplicate")).policyDecision).toBe("needs_approval");
  });
});
