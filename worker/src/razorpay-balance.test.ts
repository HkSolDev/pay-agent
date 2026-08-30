import { describe, expect, it, vi } from "vitest";
import { fetchRazorpayBalance } from "./razorpay-balance.js";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockImplementation(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

const config = { keyId: "key", keySecret: "secret", accountNumber: "7878780080316316" };

describe("fetchRazorpayBalance", () => {
  it("returns the balance for the configured account, ignoring other accounts on the response", async () => {
    const fetchImpl = mockFetch(200, {
      entity: "collection",
      count: 2,
      items: [
        { account_number: "999999999999", currency: "INR", available_amount: 500000, refreshed_at: 111 },
        { account_number: "7878780080316316", currency: "INR", available_amount: 0, refreshed_at: 1729847660 },
      ],
    });

    const result = await fetchRazorpayBalance({ ...config, fetchImpl });

    expect(result).toEqual({
      accountNumber: "7878780080316316",
      availableAmountMinor: 0,
      currency: "INR",
      refreshedAt: 1729847660,
    });
  });

  it("returns null when the configured account isn't in the response", async () => {
    const fetchImpl = mockFetch(200, { items: [{ account_number: "some-other-account", available_amount: 100 }] });

    const result = await fetchRazorpayBalance({ ...config, fetchImpl });

    expect(result).toBeNull();
  });

  it("throws on a non-2xx response rather than returning a fake balance", async () => {
    const fetchImpl = mockFetch(401, { error: { description: "Authentication failed" } });

    await expect(fetchRazorpayBalance({ ...config, fetchImpl })).rejects.toThrow("Authentication failed");
  });
});
