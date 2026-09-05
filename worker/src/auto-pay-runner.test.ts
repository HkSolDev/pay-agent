import { beforeEach, describe, expect, it, vi } from "vitest";

const runPaidVerifierForEmail = vi.fn();
const executePreparedPayment = vi.fn();

vi.mock("./paid-verification", () => ({ runPaidVerifierForEmail }));
vi.mock("./payment-execution", () => ({ executePreparedPayment }));
vi.mock("@perflo-ap-agent/db", () => ({ prisma: { paymentIntent: { upsert: vi.fn() } } }));

const { runAutoPayIfEligible } = await import("./auto-pay-runner.js");

describe("runAutoPayIfEligible — paid verifier gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runPaidVerifierForEmail.mockResolvedValue({
      paid: { status: "unverified", checks: [], unverifiedReason: "setup unavailable" },
      verification: { authPassed: true, hardFails: [], softFlags: [], score: 100, unverified: true },
    });
  });

  it("does not create or execute a payment when paid checks are unverified", async () => {
    await runAutoPayIfEligible({
      emailId: "email-1",
      policyDecision: "auto_pay",
      recipientNickname: "vendor",
      amount: "500",
      currency: "INR",
    });

    expect(runPaidVerifierForEmail).toHaveBeenCalledWith("email-1");
    expect(executePreparedPayment).not.toHaveBeenCalled();
  });
});
