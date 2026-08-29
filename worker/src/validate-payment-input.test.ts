import { describe, expect, it } from "vitest";
import { validatePaymentInput } from "./validate-payment-input.js";

describe("validatePaymentInput", () => {
  it("accepts a plain positive integer amount", () => {
    expect(validatePaymentInput("riya", "500")).toEqual({ ok: true });
  });

  it("accepts a decimal amount with up to 2 places", () => {
    expect(validatePaymentInput("riya", "499.50")).toEqual({ ok: true });
  });

  it("rejects a non-numeric amount", () => {
    expect(validatePaymentInput("riya", "abc").ok).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(validatePaymentInput("riya", "-5").ok).toBe(false);
  });

  it("rejects zero", () => {
    expect(validatePaymentInput("riya", "0").ok).toBe(false);
  });

  it("rejects a currency symbol in the input — that's added later, not typed", () => {
    expect(validatePaymentInput("riya", "₹500").ok).toBe(false);
  });

  it("rejects an empty recipient nickname", () => {
    expect(validatePaymentInput("", "500").ok).toBe(false);
  });
});
