import { describe, expect, it } from "vitest";
import { findDuplicate, type PayableFingerprint } from "./duplicate-detector.js";

const current: PayableFingerprint = {
  emailId: "new-email",
  payeeId: "riya-1",
  referenceNumber: "INV-42",
  referenceIsFallback: false,
  amount: { currency: "INR", value: "500.00" },
};

describe("Duplicate detector — never pay a replayed invoice", () => {
  it("marks the same approved payee and explicit invoice reference as a duplicate even from a new Gmail message", () => {
    expect(findDuplicate(current, [{ ...current, emailId: "old-email" }]))
      .toEqual({ duplicate: true, originalEmailId: "old-email", reason: "matching_explicit_reference" });
  });

  it("does not confuse the same invoice number from different approved payees", () => {
    expect(findDuplicate(current, [{ ...current, emailId: "old-email", payeeId: "aman-1" }]))
      .toEqual({ duplicate: false });
  });

  it("does not treat a different amount with the same reference as safe: it requires approval", () => {
    expect(findDuplicate(current, [{ ...current, emailId: "old-email", amount: { currency: "INR", value: "5000.00" } }]))
      .toEqual({ duplicate: false, suspiciousConflict: "reference_amount_mismatch", originalEmailId: "old-email" });
  });

  it("never uses a fallback reference alone as an automatic duplicate decision", () => {
    expect(findDuplicate({ ...current, referenceNumber: "a1b2c3d4", referenceIsFallback: true }, [
      { ...current, emailId: "old-email", referenceNumber: "a1b2c3d4", referenceIsFallback: true },
    ])).toEqual({ duplicate: false, suspiciousConflict: "fallback_reference_match", originalEmailId: "old-email" });
  });
});
