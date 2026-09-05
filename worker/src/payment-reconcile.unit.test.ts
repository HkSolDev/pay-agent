import { afterEach, describe, expect, it } from "vitest";
import { isReconcilableProviderReference, razorpayExecutorFromEnv } from "./payment-reconcile.js";

const savedRazorpay = {
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  accountNumber: process.env.RAZORPAY_ACCOUNT_NUMBER,
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    RAZORPAY_KEY_ID: savedRazorpay.keyId,
    RAZORPAY_KEY_SECRET: savedRazorpay.keySecret,
    RAZORPAY_ACCOUNT_NUMBER: savedRazorpay.accountNumber,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("payment reconciliation executor selection", () => {
  it("builds a Perflo status executor when Razorpay credentials are absent", () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_ACCOUNT_NUMBER;

    expect(razorpayExecutorFromEnv()).not.toBeNull();
  });
});

describe("reconcilable provider references", () => {
  it("accepts a real Perflo transaction hash and rejects only the local idempotency placeholder", () => {
    expect(isReconcilableProviderReference("0xabc123", "idem-key-1")).toBe(true);
    expect(isReconcilableProviderReference("idem-key-1", "idem-key-1")).toBe(false);
  });
});
