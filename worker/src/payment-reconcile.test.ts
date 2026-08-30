import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { reconcileStuckPayments } from "./payment-reconcile.js";
import type { PaymentExecutor, PayoutResult } from "./payment-executor.js";

// Integration test against the real local Postgres, same reasoning as
// payment-claim.test.ts: the guarded `updateMany` here needs to actually run
// against a real row, not a mock, to prove it only touches what it should.
// The provider itself is faked — this test is about our own state machine,
// not RazorpayX's API.

function fakeExecutor(responses: Record<string, PayoutResult>): PaymentExecutor {
  return {
    async createPayout() {
      throw new Error("not used by reconcileStuckPayments");
    },
    async getPayoutStatus(providerReference: string) {
      const result = responses[providerReference];
      if (!result) throw new Error(`no fake response configured for reference "${providerReference}"`);
      return result;
    },
  };
}

async function makeIntent(
  emailId: string,
  overrides: { status: "pending" | "claimed" | "paid" | "failed" | "unknown_outcome"; paymentReference?: string | null },
) {
  await prisma.paymentIntent.create({
    data: {
      emailId,
      recipientNickname: "riya",
      amount: "500",
      currency: "INR",
      idempotencyKey: `idem-${emailId}`,
      status: overrides.status,
      paymentReference: overrides.paymentReference ?? null,
    },
  });
}

beforeEach(async () => {
  await prisma.paymentIntent.deleteMany({ where: { emailId: { startsWith: "reconcile-test-" } } });
});

afterAll(async () => {
  await prisma.paymentIntent.deleteMany({ where: { emailId: { startsWith: "reconcile-test-" } } });
  await prisma.$disconnect();
});

describe("reconcileStuckPayments", () => {
  it("marks a stuck payment paid once the provider confirms it processed", async () => {
    await makeIntent("reconcile-test-1", { status: "unknown_outcome", paymentReference: "pout_1" });
    const executor = fakeExecutor({ pout_1: { providerReference: "pout_1", status: "paid" } });

    const summary = await reconcileStuckPayments(executor);

    expect(summary).toEqual({ checked: 1, updated: 1 });
    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId: "reconcile-test-1" } });
    expect(row.status).toBe("paid");
    expect(row.paidAt).not.toBeNull();
    expect(row.lastError).toBeNull();
  });

  it("marks a stuck payment failed once the provider confirms a definite rejection", async () => {
    await makeIntent("reconcile-test-2", { status: "unknown_outcome", paymentReference: "pout_2" });
    const executor = fakeExecutor({
      pout_2: { providerReference: "pout_2", status: "failed", failureReason: "beneficiary bank rejected" },
    });

    const summary = await reconcileStuckPayments(executor);

    expect(summary).toEqual({ checked: 1, updated: 1 });
    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId: "reconcile-test-2" } });
    expect(row.status).toBe("failed");
    expect(row.lastError).toBe("beneficiary bank rejected");
  });

  it("leaves a still-processing payment untouched, checked again next poll", async () => {
    await makeIntent("reconcile-test-3", { status: "unknown_outcome", paymentReference: "pout_3" });
    const executor = fakeExecutor({ pout_3: { providerReference: "pout_3", status: "processing" } });

    const summary = await reconcileStuckPayments(executor);

    expect(summary).toEqual({ checked: 1, updated: 0 });
    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId: "reconcile-test-3" } });
    expect(row.status).toBe("unknown_outcome");
  });

  it("skips a row whose only saved reference is our own idempotency-key placeholder, not a real provider id", async () => {
    await makeIntent("reconcile-test-4", { status: "unknown_outcome", paymentReference: "idem-reconcile-test-4" });
    const executor = fakeExecutor({});

    const summary = await reconcileStuckPayments(executor);

    expect(summary).toEqual({ checked: 1, updated: 0 });
    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId: "reconcile-test-4" } });
    expect(row.status).toBe("unknown_outcome");
  });

  it("never touches a claimed, pending, paid, or already-failed row", async () => {
    await makeIntent("reconcile-test-5", { status: "claimed", paymentReference: null });
    await makeIntent("reconcile-test-6", { status: "pending" });
    await makeIntent("reconcile-test-7", { status: "paid", paymentReference: "pout_7" });
    await makeIntent("reconcile-test-8", { status: "failed", paymentReference: "pout_8" });
    const executor = fakeExecutor({
      pout_7: { providerReference: "pout_7", status: "paid" },
      pout_8: { providerReference: "pout_8", status: "failed" },
    });

    const summary = await reconcileStuckPayments(executor);

    expect(summary).toEqual({ checked: 0, updated: 0 });
  });
});
