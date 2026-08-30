import { describe, expect, it } from "vitest";
import { decimalStringToMinorUnits } from "./payment-amount.js";

describe("decimalStringToMinorUnits", () => {
  it("converts a whole-rupee amount to paise", () => {
    expect(decimalStringToMinorUnits("500")).toBe(50000n);
  });

  it("converts a two-decimal amount to paise", () => {
    expect(decimalStringToMinorUnits("500.50")).toBe(50050n);
  });

  it("converts a one-decimal amount to paise", () => {
    expect(decimalStringToMinorUnits("500.5")).toBe(50050n);
  });

  it("rejects more than two decimal places rather than silently truncating", () => {
    expect(() => decimalStringToMinorUnits("500.505")).toThrow(/decimal/i);
  });

  it("rejects a non-numeric amount", () => {
    expect(() => decimalStringToMinorUnits("abc")).toThrow();
  });
});
