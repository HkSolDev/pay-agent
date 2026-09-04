import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { resumeAutoPayForEligibleInvoices, type ResumeAutoPayDeps } from "./resume-auto-pay.js";
import { reevaluatePolicy } from "./reevaluate-policy.js";
import { GLOBAL_PAUSE_REASON } from "./policy-engine.js";
import type { ApprovedPayee } from "./payee-resolver.js";

// Integration test against the real local Postgres. Two things are injected
// rather than real, on purpose:
//  - runAutoPayIfEligible is a recording stub — the real one talks to
//    RazorpayX/Perflo over the network, which a test must never do.
//  - the payee lookup used by reevaluatePolicy is in-memory rather than the
//    real encrypted payee-store, so this test doesn't depend on the shared
//    dev DB's unrelated payee rows (see reevaluate-policy.test.ts).
// The scan itself is scoped to this test's own email ids (resume-auto-pay's
// production entry point has no such restriction — it scans every
// needs_approval row by design) so this test never touches whatever real
// invoices happen to already be sitting in the local queue.
const emailIds = ["test-resume-1", "test-resume-2", "test-resume-3", "test-resume-4"];

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

function baseEmailData(id: string, payeeId: string, policyReasons: string[]) {
  return {
    id,
    gmailMessageId: `${id}-msg`,
    gmailThreadId: `${id}-thread`,
    fromAddr: "billing@vendor.example",
    date: new Date(),
    rawHeaders: {},
    auth: { dmarc: "dmarc=pass (p=reject)", spf: "spf=pass smtp.mailfrom=vendor.example", dkim: "dkim=pass header.d=vendor.example" },
    classification: "invoice",
    classificationConfidence: 0.95,
    injectionDetected: false,
    extractionSummary: {
      payeeNameConfidence: 0.95,
      amountConfidence: 0.95,
      paymentMethodConfidence: 0.95,
      referenceNumberConfidence: 0.95,
      // Above AUTO_PAY_MIN_AMOUNT_INR's default fee-safety floor (₹200) —
      // this fixture is testing pause-scoped resume behavior, not the floor.
      amount: { value: "1000", currency: "INR" },
    },
    payeeResolution: { status: "resolved", payeeId, recipientNickname: `${payeeId}-nickname` },
    verificationResult: { authPassed: true, hardFails: [], score: 80 },
    duplicateResult: { duplicate: false },
    resolvedPayeeId: payeeId,
    policyDecision: "needs_approval",
    policyReasons,
  };
}

// Maps payeeId -> ApprovedPayee, standing in for the whole approved-payee
// table so reevaluatePolicy never has to touch the real encrypted store.
function recordingDeps(payeesById: Record<string, ApprovedPayee>): ResumeAutoPayDeps & { paidCalls: string[] } {
  const paidCalls: string[] = [];
  return {
    paidCalls,
    reevaluatePolicy: (emailId) =>
      reevaluatePolicy(emailId, {
        loadApprovedPayees: async () => Object.values(payeesById),
        loadPayeeUsage: async () => ({ totalPaidInr: 0, paidCount: 0 }),
      }),
    runAutoPayIfEligible: async (input) => {
      paidCalls.push(input.emailId);
    },
  };
}

const originalAutoPayMode = process.env.AUTO_PAY_MODE;

beforeEach(async () => {
  await cleanup();
  process.env.AUTO_PAY_MODE = "on";
});

afterAll(async () => {
  await cleanup();
  process.env.AUTO_PAY_MODE = originalAutoPayMode;
  await prisma.$disconnect();
});

describe("resumeAutoPayForEligibleInvoices — narrowly-scoped, idempotent-executor reuse", () => {
  it("pays only the invoice blocked solely by the global pause, leaving the others untouched", async () => {
    const payeeA = "resume-payee-a";
    const payeeC = "resume-payee-c";

    // A: blocked only by pause — should resolve to auto_pay and be paid.
    await prisma.email.create({ data: baseEmailData(emailIds[0], payeeA, [GLOBAL_PAUSE_REASON]) });
    // B: blocked by pause AND something else — must not even be attempted.
    await prisma.email.create({
      data: baseEmailData(emailIds[1], payeeA, [GLOBAL_PAUSE_REASON, "Amount exceeds the owner's auto-pay ceiling."]),
    });
    // C: blocked only by pause, but the payee's own auto-pay toggle is off —
    // re-evaluation must find that live and keep it blocked.
    await prisma.email.create({ data: baseEmailData(emailIds[2], payeeC, [GLOBAL_PAUSE_REASON]) });
    // D: not needs_approval at all (already quarantined) — excluded by the query itself.
    await prisma.email.create({ data: { ...baseEmailData(emailIds[3], payeeA, []), policyDecision: "quarantine" } });

    const deps = recordingDeps({
      [payeeA]: fakeApprovedPayee(payeeA, { autoPayEnabled: true }),
      [payeeC]: fakeApprovedPayee(payeeC, { autoPayEnabled: false }),
    });
    const summary = await resumeAutoPayForEligibleInvoices(deps, emailIds);

    expect(summary.scanned).toBe(2); // A and C only — B and D excluded before any re-evaluation
    expect(summary.paid).toEqual([emailIds[0]]);
    expect(deps.paidCalls).toEqual([emailIds[0]]);
    expect(summary.stillBlocked.map((s) => s.emailId)).toEqual([emailIds[2]]);
    expect(summary.stillBlocked[0].reasons).toContain("Auto-pay is not enabled for this payee.");

    const rowB = await prisma.email.findUniqueOrThrow({ where: { id: emailIds[1] } });
    expect(rowB.policyReasons).toEqual([GLOBAL_PAUSE_REASON, "Amount exceeds the owner's auto-pay ceiling."]);

    const intentA = await prisma.paymentIntent.findUnique({ where: { emailId: emailIds[0] } });
    expect(intentA).toBeNull(); // the recording stub never creates one — proves resume-auto-pay itself doesn't
  });

  it("is safe to run twice — a second pass finds nothing left to pay for an already-resolved invoice", async () => {
    const payeeA = "resume-payee-a";
    await prisma.email.create({ data: baseEmailData(emailIds[0], payeeA, [GLOBAL_PAUSE_REASON]) });

    const deps = recordingDeps({ [payeeA]: fakeApprovedPayee(payeeA, { autoPayEnabled: true }) });
    await resumeAutoPayForEligibleInvoices(deps, emailIds);
    const second = await resumeAutoPayForEligibleInvoices(deps, emailIds);

    // The first pass already rewrote policyReasons to [] (auto_pay), so the
    // second pass's query for policyDecision:"needs_approval" no longer
    // matches this row at all.
    expect(second.scanned).toBe(0);
    expect(deps.paidCalls).toEqual([emailIds[0]]);
  });
});
