import { afterEach, describe, expect, it } from "vitest";
import { amountAboveMinimum } from "./auto-pay-eligibility.js";

const ENV_KEY = "AUTO_PAY_MIN_AMOUNT_INR";

afterEach(() => {
  delete process.env[ENV_KEY];
});

// Perflo charges a flat payout fee — confirmed live: a ₹200 payment only
// delivered ₹99.20 net. Auto-pay firing on a small invoice can eat most or
// all of it in fees with no owner in the loop to notice. A floor, not a
// ceiling: the mirror image of amountWithinOwnerCeiling below.
describe("amountAboveMinimum — fee-safety floor for auto-pay", () => {
  it("blocks a ₹50 invoice under the default floor", () => {
    expect(amountAboveMinimum(50)).toBe(false);
  });

  it("allows an amount clearly above the default floor", () => {
    expect(amountAboveMinimum(5000)).toBe(true);
  });

  // The exact live-reproduced case that motivated this guard: ₹200 in,
  // ₹99.20 delivered. The default floor is set so this amount is blocked,
  // not just amounts far below it.
  it("blocks the exact ₹200 case that motivated this guard, under the default floor", () => {
    expect(amountAboveMinimum(200)).toBe(false);
  });

  it("respects an explicit AUTO_PAY_MIN_AMOUNT_INR override", () => {
    process.env[ENV_KEY] = "500";
    expect(amountAboveMinimum(300)).toBe(false);
    expect(amountAboveMinimum(600)).toBe(true);
  });

  it("ignores an invalid override and falls back to the default floor", () => {
    process.env[ENV_KEY] = "not-a-number";
    expect(amountAboveMinimum(50)).toBe(false);
    expect(amountAboveMinimum(5000)).toBe(true);
  });
});
