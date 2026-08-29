import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { claimPaymentIntent } from "./payment-claim.js";

// Integration test against the real local Postgres — a mock can't prove the
// atomic-UPDATE row lock actually holds, and can't reproduce the exact bug
// this file exists to guard against: a prior version's WHERE clause only
// matched status "pending", so a "failed" row could never be re-claimed and
// the visible "Retry" button was a silent dead end.

async function makeIntent(emailId: string, status: string) {
  await prisma.paymentIntent.create({
    data: {
      emailId,
      recipientNickname: "riya",
      amount: "500",
      currency: "INR",
      idempotencyKey: `idem-${emailId}`,
      status,
    },
  });
}

beforeEach(async () => {
  await prisma.paymentIntent.deleteMany({ where: { emailId: { startsWith: "claim-test-" } } });
});

afterAll(async () => {
  await prisma.paymentIntent.deleteMany({ where: { emailId: { startsWith: "claim-test-" } } });
  await prisma.$disconnect();
});

describe("claimPaymentIntent", () => {
  it("claims a pending intent", async () => {
    await makeIntent("claim-test-1", "pending");
    const claim = await claimPaymentIntent("claim-test-1");
    expect(claim).not.toBeNull();
    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId: "claim-test-1" } });
    expect(row.status).toBe("claimed");
  });

  it("re-claims a failed intent — the exact bug a prior review caught: Retry must actually work", async () => {
    await makeIntent("claim-test-2", "failed");
    const claim = await claimPaymentIntent("claim-test-2");
    expect(claim).not.toBeNull();
    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId: "claim-test-2" } });
    expect(row.status).toBe("claimed");
  });

  it("refuses to claim an intent that's already claimed (in flight)", async () => {
    await makeIntent("claim-test-3", "claimed");
    const claim = await claimPaymentIntent("claim-test-3");
    expect(claim).toBeNull();
  });

  it("refuses to claim an unknown_outcome intent — FR-27: never retried automatically", async () => {
    await makeIntent("claim-test-4", "unknown_outcome");
    const claim = await claimPaymentIntent("claim-test-4");
    expect(claim).toBeNull();
  });

  it("refuses to claim an already-paid intent", async () => {
    await makeIntent("claim-test-5", "paid");
    const claim = await claimPaymentIntent("claim-test-5");
    expect(claim).toBeNull();
  });

  it("only one of two concurrent claims on the same pending row succeeds", async () => {
    await makeIntent("claim-test-6", "pending");
    const [a, b] = await Promise.all([
      claimPaymentIntent("claim-test-6"),
      claimPaymentIntent("claim-test-6"),
    ]);
    const results = [a, b];
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });
});
