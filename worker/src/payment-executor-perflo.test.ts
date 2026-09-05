import { describe, expect, it, vi } from "vitest";
import { createPerfloExecutor } from "./payment-executor-perflo.js";
import { PerfloDefiniteFailure, PerfloUnknownOutcomeError } from "./perflo-cli.js";

const request = {
  recipientName: "Riya Sharma",
  currency: "INR" as const,
  rail: "upi" as const,
  destination: { kind: "upi" as const, vpa: "riya@okaxis" },
  amountMinor: 50000n, // ₹500.00
  idempotencyKey: "idem-key-1",
};

describe("Perflo payment executor adapter", () => {
  it("converts minor units back to the decimal rupee string Perflo's CLI expects", async () => {
    const payViaPerfloCli = vi.fn().mockResolvedValue({ paymentReference: "perflo-1" });
    const executor = createPerfloExecutor({ recipientNickname: "riya-sharma", payViaPerfloCli });

    await executor.createPayout(request);

    expect(payViaPerfloCli).toHaveBeenCalledWith({
      nickname: "riya-sharma",
      amount: "500",
      currency: "INR",
      idempotencyKey: "idem-key-1",
    });
  });

  it("reports a successful pay as paid, using Perflo's own reference", async () => {
    const payViaPerfloCli = vi.fn().mockResolvedValue({ paymentReference: "perflo-1" });
    const executor = createPerfloExecutor({ recipientNickname: "riya-sharma", payViaPerfloCli });

    const result = await executor.createPayout(request);
    expect(result).toEqual({ providerReference: "perflo-1", status: "paid" });
  });

  it("maps a definite Perflo failure to a failed PayoutResult, never throwing past this boundary", async () => {
    const payViaPerfloCli = vi.fn().mockRejectedValue(new PerfloDefiniteFailure("outside grant"));
    const executor = createPerfloExecutor({ recipientNickname: "riya-sharma", payViaPerfloCli });

    const result = await executor.createPayout(request);
    expect(result.status).toBe("failed");
    expect(result.failureReason).toMatch(/outside grant/);
  });

  it("maps Perflo's unknown-outcome case to unknown, never failed — matches FR-27's no-blind-retry rule", async () => {
    const payViaPerfloCli = vi.fn().mockRejectedValue(new PerfloUnknownOutcomeError("timed out"));
    const executor = createPerfloExecutor({ recipientNickname: "riya-sharma", payViaPerfloCli });

    const result = await executor.createPayout(request);
    expect(result.status).toBe("unknown");
  });

  it("preserves Perflo's real transaction reference on an unknown outcome instead of replacing it with the idempotency key", async () => {
    const error = Object.assign(new PerfloUnknownOutcomeError("still processing"), {
      paymentReference: "0xabc123",
    });
    const payViaPerfloCli = vi.fn().mockRejectedValue(error);
    const executor = createPerfloExecutor({ recipientNickname: "riya-sharma", payViaPerfloCli });

    const result = await executor.createPayout(request);

    expect(result).toEqual({
      providerReference: "0xabc123",
      status: "unknown",
      failureReason: "still processing",
    });
  });

  it("queries Perflo transaction status using the preserved provider reference", async () => {
    const getPayoutStatusViaPerfloCli = vi.fn().mockResolvedValue({ providerReference: "0xabc123", status: "paid" });
    const config = { recipientNickname: "riya-sharma", payViaPerfloCli: vi.fn(), getPayoutStatusViaPerfloCli };
    const executor = createPerfloExecutor(config);

    await expect(executor.getPayoutStatus("0xabc123")).resolves.toEqual({ providerReference: "0xabc123", status: "paid" });
    expect(getPayoutStatusViaPerfloCli).toHaveBeenCalledWith("0xabc123");
  });
});
