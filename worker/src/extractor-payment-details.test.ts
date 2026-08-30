import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractPaymentDetails, type ExtractionInput } from "./extractor.js";

const invoice = (bodyText: string, overrides: Partial<ExtractionInput> = {}): ExtractionInput => ({
  kind: "invoice",
  fromName: "Riya Sharma",
  subject: "Invoice",
  bodyText,
  ...overrides,
});

describe("Extractor — payment method, dates, and fallback-reference contract", () => {
  it("normalizes a valid UPI VPA and extracts explicit issue/due dates", async () => {
    const result = await extractPaymentDetails(invoice(`Invoice INV-1
Issue date: 2026-08-30
Due date: 2026-09-05
Total due: ₹5,000
Pay via UPI: Riya.Sharma@OKAXIS`));

    expect(result.paymentMethods).toEqual([{ kind: "upi", vpa: "riya.sharma@okaxis" }]);
    expect(result.issueDate).toBe("2026-08-30");
    expect(result.dueDate).toBe("2026-09-05");
    expect(result.paymentMethodConfidence).toBeGreaterThanOrEqual(0.9);
    expect(result.issueDateConfidence).toBeGreaterThanOrEqual(0.9);
    expect(result.dueDateConfidence).toBeGreaterThanOrEqual(0.9);
  });

  it("extracts a bank method only when account number and valid IFSC occur together", async () => {
    const result = await extractPaymentDetails(invoice(`Invoice INV-2
Total payable: INR 12,500
Account number: 5010023456789
IFSC: HDFC0001234`));

    expect(result.paymentMethods).toEqual([{
      kind: "bank_neft",
      accountNumber: "5010023456789",
      ifsc: "HDFC0001234",
    }]);
    expect(result.paymentMethodConfidence).toBeGreaterThanOrEqual(0.9);
  });

  it("does not manufacture a payment method from an invalid UPI, account-only, or IFSC-only value", async () => {
    for (const bodyText of [
      "Invoice INV-3. Total due ₹500. UPI: riya-at-okaxis",
      "Invoice INV-4. Total due ₹500. Account: 5010023456789",
      "Invoice INV-5. Total due ₹500. IFSC: HDFC0001234",
    ]) {
      const result = await extractPaymentDetails(invoice(bodyText));
      expect(result.paymentMethods).toEqual([]);
      expect(result.paymentMethodConfidence).toBe(0);
    }
  });

  it("keeps both valid rails when the source explicitly gives both; later policy must require owner choice", async () => {
    const result = await extractPaymentDetails(invoice(`Invoice INV-6
Total due: ₹900
UPI: riya@okaxis
Account: 5010023456789
IFSC: HDFC0001234`));

    expect(result.paymentMethods).toEqual(expect.arrayContaining([
      { kind: "upi", vpa: "riya@okaxis" },
      { kind: "bank_neft", accountNumber: "5010023456789", ifsc: "HDFC0001234" },
    ]));
    expect(result.paymentMethods).toHaveLength(2);
  });

  it("does not guess an ambiguous numeric date", async () => {
    const result = await extractPaymentDetails(invoice("Invoice INV-7. Total due ₹500. Due date: 05/09/2026."));
    expect(result.dueDate).toBeNull();
    expect(result.dueDateConfidence).toBeLessThan(0.9);
  });

  it("creates a low-confidence stable fallback reference only when payee, amount, and an unambiguous date exist", async () => {
    const result = await extractPaymentDetails(invoice("Consulting services. Total due: ₹500. Due date: 2026-09-05.", {
      subject: "September consulting",
    }));
    const expected = createHash("sha256").update("Riya Sharma|500.00|2026-09-05").digest("hex").slice(0, 16);

    expect(result.referenceNumber).toBe(expected);
    expect(result.referenceNumberConfidence).toBeGreaterThan(0);
    expect(result.referenceNumberConfidence).toBeLessThan(0.9);
  });

  it("never creates a fallback reference with no trustworthy date", async () => {
    const result = await extractPaymentDetails(invoice("Consulting services. Total due: ₹500."));
    expect(result.referenceNumber).toBeNull();
    expect(result.referenceNumberConfidence).toBe(0);
  });
});
