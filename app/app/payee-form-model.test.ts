import { describe, expect, it } from "vitest";
import { maskRailValue, validatePayeeForm, type PayeeFormInput } from "./payee-form-model";

const validUpi: PayeeFormInput = {
  name: "Riya Sharma",
  firstName: "Riya",
  lastName: "Sharma",
  senderAddr: "riya@example.com",
  rail: "upi",
  vpa: "riya@okaxis",
  accountNumber: "",
  ifsc: "",
  perPaymentCapInr: "1000.00",
  totalCapInr: "5000.00",
  maxPayments: "5",
  expiresAt: "2026-12-31",
};

describe("payee form validation — required fields", () => {
  it("accepts a fully valid UPI payee form", () => {
    expect(validatePayeeForm(validUpi)).toEqual({ valid: true, errors: {} });
  });

  it("requires a payee name", () => {
    const result = validatePayeeForm({ ...validUpi, name: "  " });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeTruthy();
  });

  it("requires a sender email identity", () => {
    const result = validatePayeeForm({ ...validUpi, senderAddr: "not-an-email" });
    expect(result.valid).toBe(false);
    expect(result.errors.senderAddr).toBeTruthy();
  });

  // Perflo's beneficiary schema (bank.in.inr) requires firstName/lastName
  // separately from the display `name` — splitting `name` on whitespace was
  // considered and rejected (breaks on real names), so these are explicit
  // required fields instead.
  it("requires a first and last name", () => {
    expect(validatePayeeForm({ ...validUpi, firstName: " " }).errors.firstName).toBeTruthy();
    expect(validatePayeeForm({ ...validUpi, lastName: " " }).errors.lastName).toBeTruthy();
  });

  it("requires positive grant caps and a valid expiry", () => {
    expect(validatePayeeForm({ ...validUpi, perPaymentCapInr: "0" }).errors.perPaymentCapInr).toBeTruthy();
    expect(validatePayeeForm({ ...validUpi, totalCapInr: "abc" }).errors.totalCapInr).toBeTruthy();
    expect(validatePayeeForm({ ...validUpi, maxPayments: "0" }).errors.maxPayments).toBeTruthy();
    expect(validatePayeeForm({ ...validUpi, expiresAt: "not-a-date" }).errors.expiresAt).toBeTruthy();
  });

  it("requires recipientNickname when useExistingBeneficiary is true", () => {
    const missing = validatePayeeForm({ ...validUpi, useExistingBeneficiary: true, recipientNickname: "" });
    expect(missing.valid).toBe(false);
    expect(missing.errors.recipientNickname).toBeTruthy();

    const blank = validatePayeeForm({ ...validUpi, useExistingBeneficiary: true, recipientNickname: "   " });
    expect(blank.valid).toBe(false);
    expect(blank.errors.recipientNickname).toBeTruthy();

    const valid = validatePayeeForm({ ...validUpi, useExistingBeneficiary: true, recipientNickname: "hemant-real" });
    expect(valid.valid).toBe(true);
    expect(valid.errors.recipientNickname).toBeUndefined();
  });
});


describe("payee form validation — inline rail errors", () => {
  it("rejects an ordinary email address as a UPI VPA with an inline error", () => {
    const result = validatePayeeForm({ ...validUpi, vpa: "billing@gmail.com" });
    expect(result.valid).toBe(false);
    expect(result.errors.vpa).toBeTruthy();
  });

  it("rejects a bank rail missing IFSC", () => {
    const result = validatePayeeForm({
      ...validUpi, rail: "bank_neft", vpa: "", accountNumber: "5010023456789", ifsc: "",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.ifsc).toBeTruthy();
  });

  it("rejects a bank rail with a malformed account number", () => {
    const result = validatePayeeForm({
      ...validUpi, rail: "bank_neft", vpa: "", accountNumber: "123", ifsc: "HDFC0001234",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.accountNumber).toBeTruthy();
  });

  it("accepts a fully valid bank rail", () => {
    const result = validatePayeeForm({
      ...validUpi, rail: "bank_neft", vpa: "", accountNumber: "5010023456789", ifsc: "hdfc0001234",
    });
    expect(result).toEqual({ valid: true, errors: {} });
  });
});

describe("masking — raw rail values never render after saving", () => {
  it("masks a UPI VPA, keeping only the domain visible", () => {
    expect(maskRailValue({ kind: "upi", vpa: "riya.sharma@okaxis" })).toBe("••••@okaxis");
  });

  it("masks a bank account number, keeping only the last 4 digits", () => {
    expect(maskRailValue({ kind: "bank_neft", accountNumber: "5010023456789", ifsc: "HDFC0001234" })).toBe("•••••••••6789 · HDFC0001234");
  });
});
