import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@perflo-ap-agent/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// executePreparedPayment is worker/src/payment-execution.ts's own concern
// (already fixed, already committed, explicitly off-limits for this task).
// Stubbing it here keeps this suite scoped to actions.ts's own pre-execution
// status guard — the thing this suite exists to prove — without it also
// exercising the real claim/pay chain, which needs a "pending"/"failed" row
// to do anything useful with anyway.
vi.mock("../../worker/src/payment-execution", () => ({ executePreparedPayment: vi.fn(async () => ({ status: "paid" as const })) }));

const { preparePayment, confirmPayment } = await import("./actions");

const emailId = "actions-test-email-1";
const payeeId = "actions-test-payee-1";

function baseEmailData(amountValue: string) {
  return {
    id: emailId,
    gmailMessageId: `${emailId}-msg`,
    gmailThreadId: `${emailId}-thread`,
    fromAddr: "billing@actions-test.example",
    date: new Date(),
    rawHeaders: {},
    resolvedPayeeId: payeeId,
    extractionSummary: { amount: { value: amountValue, currency: "INR" } },
  };
}

function formDataWith(id: string): FormData {
  const fd = new FormData();
  fd.set("emailId", id);
  return fd;
}

async function cleanup() {
  await prisma.paymentIntent.deleteMany({ where: { emailId } });
  await prisma.email.deleteMany({ where: { id: emailId } });
  await prisma.payee.deleteMany({ where: { id: payeeId } });
}

beforeEach(async () => {
  await cleanup();
  await prisma.payee.create({ data: { id: payeeId, name: "Actions Test Payee", recipientNickname: "actions-test-nickname" } });
  await prisma.email.create({ data: baseEmailData("500") });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("preparePayment — status guard on the payable-fields write", () => {
  it("creates a fresh PaymentIntent for a never-before-prepared invoice", async () => {
    await preparePayment(formDataWith(emailId));

    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId } });
    expect(row.status).toBe("pending");
    expect(row.recipientNickname).toBe("actions-test-nickname");
    expect(row.amount).toBe("500");
  });

  it("updates recipient/amount/currency on a re-prepare while still pending", async () => {
    await preparePayment(formDataWith(emailId));
    await prisma.email.update({ where: { id: emailId }, data: { extractionSummary: { amount: { value: "750", currency: "INR" } } } });

    await preparePayment(formDataWith(emailId));

    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId } });
    expect(row.amount).toBe("750");
  });

  it("never rewrites recipient/amount/currency once the row is claimed", async () => {
    await preparePayment(formDataWith(emailId));
    await prisma.paymentIntent.update({ where: { emailId }, data: { status: "claimed", claimedAt: new Date() } });
    // The owner edits/re-extracts the underlying invoice after the payment
    // was already claimed — re-running Prepare must never rewrite the
    // claimed row's payable fields; that would corrupt the record of
    // exactly what was claimed and (possibly already) paid.
    await prisma.email.update({ where: { id: emailId }, data: { extractionSummary: { amount: { value: "999999", currency: "INR" } } } });

    await preparePayment(formDataWith(emailId));

    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId } });
    expect(row.status).toBe("claimed");
    expect(row.amount).toBe("500");
  });

  it("never rewrites recipient/amount/currency once the row is paid", async () => {
    await preparePayment(formDataWith(emailId));
    await prisma.paymentIntent.update({ where: { emailId }, data: { status: "paid", paidAt: new Date() } });
    await prisma.email.update({ where: { id: emailId }, data: { extractionSummary: { amount: { value: "1", currency: "INR" } } } });

    await preparePayment(formDataWith(emailId));

    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId } });
    expect(row.amount).toBe("500");
  });
});

describe("confirmPayment — status guard on the pre-execution repair write", () => {
  it("repairs a stale recipient/amount/currency while the row is still pending", async () => {
    await prisma.paymentIntent.create({
      data: { emailId, recipientNickname: "stale-nickname", amount: "1", currency: "INR", idempotencyKey: "actions-test-idem-1" },
    });

    await confirmPayment(emailId, new FormData());

    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId } });
    expect(row.recipientNickname).toBe("actions-test-nickname");
    expect(row.amount).toBe("500");
  });

  it("never rewrites recipient/amount/currency once the row is already claimed", async () => {
    await prisma.paymentIntent.create({
      data: {
        emailId, recipientNickname: "claimed-nickname", amount: "42", currency: "INR", idempotencyKey: "actions-test-idem-2",
        status: "claimed", claimedAt: new Date(),
      },
    });

    await confirmPayment(emailId, new FormData());

    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId } });
    expect(row.recipientNickname).toBe("claimed-nickname");
    expect(row.amount).toBe("42");
  });

  it("never rewrites recipient/amount/currency once the row is already paid", async () => {
    await prisma.paymentIntent.create({
      data: {
        emailId, recipientNickname: "paid-nickname", amount: "77", currency: "INR", idempotencyKey: "actions-test-idem-3",
        status: "paid", paidAt: new Date(),
      },
    });

    await confirmPayment(emailId, new FormData());

    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId } });
    expect(row.recipientNickname).toBe("paid-nickname");
    expect(row.amount).toBe("77");
  });
});
