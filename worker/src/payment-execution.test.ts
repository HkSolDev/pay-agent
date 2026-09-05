import { describe, expect, it, vi } from "vitest";

// Mocks the whole manual-pay module so executePreparedPayment's own
// post-payment classification logic (paid -> the DB write that records it
// -> what happens if that write itself throws) can be exercised without a
// real Postgres row or the real Perflo CLI, same reasoning and style as
// payee-approval-deps.enable-grant.test.ts's vi.mock of "./perflo-cli".
// Defined inline in the factory, not as top-level consts, since vi.mock is
// hoisted above any top-level declaration.
vi.mock("./manual-pay", () => ({
  requestManualPayment: vi.fn(),
}));

vi.mock("@perflo-ap-agent/db", () => ({
  prisma: {
    paymentIntent: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

const { requestManualPayment } = await import("./manual-pay");
const { prisma } = await import("@perflo-ap-agent/db");
const { executePreparedPayment } = await import("./payment-execution.js");

describe("executePreparedPayment — classifying what happens after the payment itself lands", () => {
  it("classifies a successful payment whose own status write then fails as unknown_outcome, never failed", async () => {
    vi.mocked(requestManualPayment).mockResolvedValueOnce({ intentId: "intent-1", paymentReference: "prov-ref-1" });
    // A generic, transient DB error — not a PaymentUnknownOutcomeError — is
    // exactly the case a naive catch-all would misclassify as "failed".
    vi.mocked(prisma.paymentIntent.update).mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));
    vi.mocked(prisma.paymentIntent.updateMany).mockResolvedValueOnce({ count: 1 });

    const result = await executePreparedPayment("email-1");

    // "failed" implies safe to retry; retrying here would be a genuine
    // second real payment (Perflo's CLI has no idempotency-key flag, see
    // perflo-cli.ts:150-159) against money that already moved once.
    expect(result.status).toBe("unknown_outcome");
    expect(prisma.paymentIntent.updateMany).toHaveBeenCalledWith({
      where: { emailId: "email-1", status: "claimed" },
      data: expect.objectContaining({ status: "unknown_outcome" }),
    });
  });
});
