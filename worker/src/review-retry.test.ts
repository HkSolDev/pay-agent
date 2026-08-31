import { describe, expect, it } from "vitest";
import { reviewRetryBlockReason } from "./review-retry.js";

describe("review retry payment boundary", () => {
  it("permits review-only re-extraction before a payout starts", () => {
    expect(reviewRetryBlockReason(null)).toBeNull();
    expect(reviewRetryBlockReason("pending")).toBeNull();
  });

  it.each(["claimed", "paid", "failed", "unknown_outcome"] as const)("blocks re-extraction for a %s payment", (status) => {
    expect(reviewRetryBlockReason(status)).toMatch(/cannot|must/i);
  });
});
