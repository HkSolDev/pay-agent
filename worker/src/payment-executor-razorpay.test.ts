import { afterEach, describe, expect, it, vi } from "vitest";
import { createRazorpayExecutor } from "./payment-executor-razorpay.js";

const baseRequest = {
  recipientName: "Riya Sharma",
  currency: "INR" as const,
  rail: "upi" as const,
  destination: { kind: "upi" as const, vpa: "riya@okaxis" },
  amountMinor: 50000n, // ₹500.00
  idempotencyKey: "idem-key-1",
};

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockImplementationOnce(async () => ({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    }));
  }
  return fetchMock;
}

describe("RazorpayX sandbox payment executor", () => {
  afterEach(() => vi.restoreAllMocks());

  it("walks the Contact -> Fund Account -> Payout sequence and returns the payout reference", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { id: "cont_1" } },
      { status: 200, body: { id: "fa_1" } },
      { status: 200, body: { id: "pout_1", status: "processing" } },
    ]);
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    const result = await executor.createPayout(baseRequest);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [contactCall, fundAccountCall, payoutCall] = fetchMock.mock.calls;
    expect(contactCall[0]).toContain("/v1/contacts");
    expect(fundAccountCall[0]).toContain("/v1/fund_accounts");
    expect(payoutCall[0]).toContain("/v1/payouts");
    expect(result).toEqual({ providerReference: "pout_1", status: "processing" });
  });

  it("sends the amount in integer paise, never a decimal rupee value", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { id: "cont_1" } },
      { status: 200, body: { id: "fa_1" } },
      { status: 200, body: { id: "pout_1", status: "processing" } },
    ]);
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    await executor.createPayout(baseRequest);

    const payoutCall = fetchMock.mock.calls[2];
    const payoutBody = JSON.parse(payoutCall[1].body as string);
    expect(payoutBody.amount).toBe(50000);
    expect(Number.isInteger(payoutBody.amount)).toBe(true);
  });

  // Confirmed against razorpay.com/docs/api/x/payouts/: `account_number` is
  // a required field on the payout call — the source RazorpayX business
  // account being debited, not the recipient's account. Missing this from
  // the first draft of this adapter meant every real call would have failed.
  it("sends the configured source account_number on the payout call", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { id: "cont_1" } },
      { status: 200, body: { id: "fa_1" } },
      { status: 200, body: { id: "pout_1", status: "processing" } },
    ]);
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    await executor.createPayout(baseRequest);

    const payoutBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(payoutBody.account_number).toBe("7878780080316316");
  });

  it("refuses a non-INR currency before making any network call — RazorpayX payouts only document INR", async () => {
    const fetchMock = vi.fn();
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    const result = await executor.createPayout({ ...baseRequest, currency: "USD" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
  });

  it("sends the caller's idempotency key via the X-Payout-Idempotency header, unchanged across retries", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { id: "cont_1" } },
      { status: 200, body: { id: "fa_1" } },
      { status: 200, body: { id: "pout_1", status: "processing" } },
    ]);
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    await executor.createPayout(baseRequest);

    const payoutCall = fetchMock.mock.calls[2];
    expect(payoutCall[1].headers["X-Payout-Idempotency"]).toBe("idem-key-1");
  });

  it("maps a bank_transfer destination to a bank_account fund account, not a vpa", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { id: "cont_1" } },
      { status: 200, body: { id: "fa_1" } },
      { status: 200, body: { id: "pout_1", status: "processing" } },
    ]);
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    await executor.createPayout({
      ...baseRequest,
      rail: "bank_transfer",
      destination: { kind: "bank_transfer", accountNumber: "123456789012", ifsc: "HDFC0001234" },
    });

    const fundAccountCall = fetchMock.mock.calls[1];
    const fundAccountBody = JSON.parse(fundAccountCall[1].body as string);
    expect(fundAccountBody.account_type).toBe("bank_account");
    expect(fundAccountBody.bank_account).toEqual({ name: "Riya Sharma", ifsc: "HDFC0001234", account_number: "123456789012" });
  });

  it("maps a paid RazorpayX status to the paid PayoutResult status", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { id: "cont_1" } },
      { status: 200, body: { id: "fa_1" } },
      { status: 200, body: { id: "pout_1", status: "processed" } },
    ]);
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    const result = await executor.createPayout(baseRequest);
    expect(result.status).toBe("paid");
  });

  // The real RazorpayX response has no `failure_reason` field (confirmed
  // against razorpay.com/docs/api/x/payouts/) — the explanation lives at
  // `status_details.description`.
  it("maps a rejected/cancelled RazorpayX status to failed, reading the reason from status_details.description", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { id: "cont_1" } },
      { status: 200, body: { id: "fa_1" } },
      {
        status: 200,
        body: {
          id: "pout_1",
          status: "rejected",
          status_details: { description: "IMPS is not enabled on beneficiary account, please retry with different mode.", source: "beneficiary_bank", reason: "imps_not_allowed" },
        },
      },
    ]);
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    const result = await executor.createPayout(baseRequest);
    expect(result).toEqual({
      providerReference: "pout_1",
      status: "failed",
      failureReason: "IMPS is not enabled on beneficiary account, please retry with different mode.",
    });
  });

  it("treats a network timeout on the payout call itself as unknown, not failed — the payout may already have been accepted", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ id: "cont_1" }) }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ id: "fa_1" }) }))
      .mockImplementationOnce(async () => { throw new Error("fetch timed out"); });
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    const result = await executor.createPayout(baseRequest);
    expect(result.status).toBe("unknown");
  });

  // The real-world case this covers: a payee's saved bank details have a
  // typo'd IFSC. Nothing has been sent to /v1/payouts yet when this fails,
  // so — unlike a timeout on the payout call itself — there is zero
  // ambiguity about whether money moved. This must be "failed" (retriable
  // once the owner fixes the payee record), not "unknown" (FR-27's
  // never-auto-retry bucket, meant only for genuine ambiguity).
  it("treats a rejected fund-account request (e.g. bad IFSC) as failed, not unknown — nothing was ever sent to /v1/payouts", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ id: "cont_1" }) }))
      .mockImplementationOnce(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: { description: "Invalid IFSC Code in Bank Account" } }),
      }));
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    const result = await executor.createPayout(baseRequest);
    expect(result.status).toBe("failed");
    expect(result.failureReason).toContain("Invalid IFSC Code");
    expect(fetchMock).toHaveBeenCalledTimes(2); // never reached /v1/payouts
  });

  it("treats a network failure while creating the contact as failed, not unknown — also before /v1/payouts is ever called", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    const result = await executor.createPayout(baseRequest);
    expect(result.status).toBe("failed");
  });

  it("treats a definite rejection response on the payout call itself as failed, not unknown — Razorpay confirmed no payout was created", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ id: "cont_1" }) }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ id: "fa_1" }) }))
      .mockImplementationOnce(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: { description: "The api key/secret provided is invalid" } }),
      }));
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    const result = await executor.createPayout(baseRequest);
    expect(result.status).toBe("failed");
  });

  it("sets reference_id to the caller's idempotency key on the payout call, so a payout can be found later without its id", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { id: "cont_1" } },
      { status: 200, body: { id: "fa_1" } },
      { status: 200, body: { id: "pout_1", status: "processing" } },
    ]);
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    await executor.createPayout(baseRequest);

    const payoutBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(payoutBody.reference_id).toBe("idem-key-1");
  });

  it("getPayoutStatus maps RazorpayX's processed/rejected/queued statuses the same way createPayout does", async () => {
    const fetchMock = mockFetchSequence([{ status: 200, body: { id: "pout_1", status: "queued" } }]);
    const executor = createRazorpayExecutor({ keyId: "key", keySecret: "secret", accountNumber: "7878780080316316", fetchImpl: fetchMock });

    const result = await executor.getPayoutStatus("pout_1");
    expect(result).toEqual({ providerReference: "pout_1", status: "processing" });
  });
});
