import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { reevaluatePolicy, type ReevaluatePolicyDeps } from "./reevaluate-policy.js";
import { GLOBAL_PAUSE_REASON } from "./policy-engine.js";
import type { ApprovedPayee } from "./payee-resolver.js";

// Integration test against the real local Postgres for the Email row itself
// (same convention as ingest.test.ts — proves the persisted write actually
// lands, not just the in-memory decision), but the payee lookup is injected
// in-memory rather than going through the real encrypted payee-store: the
// shared local dev DB can carry unrelated approved payees with rails
// encrypted under a different key (a known, pre-existing environment issue,
// not something this feature should depend on to pass).
const emailIds = ["test-reeval-1", "test-reeval-2", "test-reeval-3", "test-reeval-4"];

async function cleanup() {
  await prisma.paymentIntent.deleteMany({ where: { emailId: { in: emailIds } } });
  await prisma.email.deleteMany({ where: { id: { in: emailIds } } });
}

function fakeApprovedPayee(payeeId: string, opts: { autoPayEnabled: boolean }): ApprovedPayee {
  return {
    payeeId,
    senderAddr: "billing@vendor.example",
    recipientNickname: `${payeeId}-nickname`,
    paymentMethod: { kind: "upi", vpa: `${payeeId}@okaxis` },
    grant: {
      autoPayEnabled: opts.autoPayEnabled,
      payeeStatus: "approved",
      perPaymentCapInr: null,
      totalCapInr: null,
      maxPayments: null,
      expiresAt: null,
    },
  };
}

function depsFor(payee: ApprovedPayee): ReevaluatePolicyDeps {
  return {
    loadApprovedPayees: async () => [payee],
    loadPayeeUsage: async () => ({ totalPaidInr: 0, paidCount: 0 }),
  };
}

function fullyValidEmailData(id: string, payeeId: string, overrides: { classificationConfidence?: number; policyReasons?: string[] } = {}) {
  return {
    id,
    gmailMessageId: `${id}-msg`,
    gmailThreadId: `${id}-thread`,
    fromAddr: "billing@vendor.example",
    date: new Date(),
    rawHeaders: {},
    auth: { dmarc: "dmarc=pass (p=reject)", spf: "spf=pass smtp.mailfrom=vendor.example", dkim: "dkim=pass header.d=vendor.example" },
    classification: "invoice",
    classificationConfidence: overrides.classificationConfidence ?? 0.95,
    injectionDetected: false,
    extractionSummary: {
      payeeNameConfidence: 0.95,
      amountConfidence: 0.95,
      paymentMethodConfidence: 0.95,
      referenceNumberConfidence: 0.95,
      amount: { value: "100", currency: "INR" },
    },
    payeeResolution: { status: "resolved", payeeId, recipientNickname: `${payeeId}-nickname` },
    verificationResult: { authPassed: true, hardFails: [], score: 80 },
    duplicateResult: { duplicate: false },
    resolvedPayeeId: payeeId,
    policyDecision: "needs_approval",
    policyReasons: overrides.policyReasons ?? [GLOBAL_PAUSE_REASON],
  };
}

const originalAutoPayMode = process.env.AUTO_PAY_MODE;

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  process.env.AUTO_PAY_MODE = originalAutoPayMode;
  await prisma.$disconnect();
});

describe("reevaluatePolicy — cheap recompute, never pays", () => {
  it("clears a stale global-pause reason once AUTO_PAY_MODE is on, without touching PaymentIntent", async () => {
    const payeeId = "reeval-payee-1";
    await prisma.email.create({ data: fullyValidEmailData(emailIds[0], payeeId) });

    process.env.AUTO_PAY_MODE = "on";
    const result = await reevaluatePolicy(emailIds[0], depsFor(fakeApprovedPayee(payeeId, { autoPayEnabled: true })));

    expect(result).toEqual({ decision: "auto_pay", reasons: [] });

    const row = await prisma.email.findUniqueOrThrow({ where: { id: emailIds[0] } });
    expect(row.policyDecision).toBe("auto_pay");
    expect(row.policyReasons).toEqual([]);

    const intent = await prisma.paymentIntent.findUnique({ where: { emailId: emailIds[0] } });
    expect(intent).toBeNull();
  });

  it("leaves an invoice blocked by a real (non-runtime) reason, and drops the stale pause reason", async () => {
    const payeeId = "reeval-payee-1";
    await prisma.email.create({
      data: fullyValidEmailData(emailIds[1], payeeId, {
        classificationConfidence: 0.5,
        policyReasons: ["Classification confidence (0.5) below 0.9.", GLOBAL_PAUSE_REASON],
      }),
    });

    process.env.AUTO_PAY_MODE = "on";
    const result = await reevaluatePolicy(emailIds[1], depsFor(fakeApprovedPayee(payeeId, { autoPayEnabled: true })));

    expect(result.decision).toBe("needs_approval");
    expect(result.reasons).toContain("Classification confidence (0.5) below 0.9.");
    expect(result.reasons).not.toContain(GLOBAL_PAUSE_REASON);
  });

  it("re-applies the pause reason when AUTO_PAY_MODE is off, even for an otherwise-eligible invoice", async () => {
    const payeeId = "reeval-payee-1";
    await prisma.email.create({ data: fullyValidEmailData(emailIds[2], payeeId) });

    process.env.AUTO_PAY_MODE = "";
    const result = await reevaluatePolicy(emailIds[2], depsFor(fakeApprovedPayee(payeeId, { autoPayEnabled: true })));

    expect(result).toEqual({ decision: "needs_approval", reasons: [GLOBAL_PAUSE_REASON] });
  });

  it("does not clear the pause reason when the payee's own auto-pay toggle is off", async () => {
    const payeeId = "reeval-payee-1";
    await prisma.email.create({ data: fullyValidEmailData(emailIds[3], payeeId) });

    process.env.AUTO_PAY_MODE = "on";
    const result = await reevaluatePolicy(emailIds[3], depsFor(fakeApprovedPayee(payeeId, { autoPayEnabled: false })));

    expect(result).toEqual({ decision: "needs_approval", reasons: ["Auto-pay is not enabled for this payee."] });
  });

  it("refuses to reprocess an email whose payment has already been claimed or paid", async () => {
    const payeeId = "reeval-payee-2";
    await prisma.email.create({ data: fullyValidEmailData(emailIds[0], payeeId) });
    await prisma.paymentIntent.create({
      data: { emailId: emailIds[0], recipientNickname: `${payeeId}-nickname`, amount: "100", currency: "INR", idempotencyKey: `${emailIds[0]}-key`, status: "paid" },
    });

    await expect(reevaluatePolicy(emailIds[0])).rejects.toThrow("A paid invoice cannot be reprocessed.");
  });
});
