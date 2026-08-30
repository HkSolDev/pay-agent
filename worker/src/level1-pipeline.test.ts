import { describe, expect, it } from "vitest";
import type { ClassificationResult } from "./classifier.js";
import { extractPaymentDetails, type ExtractionInput } from "./extractor.js";
import { processLevel1 } from "./level1-pipeline.js";

const extractionInput: ExtractionInput = {
  kind: "invoice", fromName: "Riya", fromAddr: "billing@riya.example", subject: "Invoice INV-1",
  bodyText: "Invoice INV-1\nTotal due: ₹500\nUPI: riya@okaxis\nDue date: 2026-09-05",
};
const classification: ClassificationResult = { kind: "invoice", confidence: 0.98, rationale: "Formal invoice", injectionDetected: false, injectionEvidence: [] };

describe("Level 1 dry-run pipeline", () => {
  it("stores a first-time invoice as needs_approval and never auto-pays", async () => {
    const result = await processLevel1({
      emailId: "email-1", extractionInput, classification,
      auth: { dmarc: "dmarc=pass header.from=riya.example", spf: null, dkim: null }, replyTo: null, links: [], approvedPayees: [], duplicateHistory: [],
    }, extractPaymentDetails);
    expect(result.resolution).toEqual({ status: "new_payee" });
    expect(result.decision).toBe("needs_approval");
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/Grant is not active/)]));
  });

  it("quarantines injected content before any payment decision", async () => {
    const result = await processLevel1({
      emailId: "email-2", extractionInput: { ...extractionInput, injectionDetected: true },
      classification: { ...classification, kind: "unrelated", injectionDetected: true, injectionEvidence: ["SYSTEM override"] },
      auth: { dmarc: null, spf: null, dkim: null }, replyTo: null, links: [], approvedPayees: [], duplicateHistory: [],
    }, extractPaymentDetails);
    expect(result.decision).toBe("quarantine");
  });

  it("requires owner choice when an invoice supplies more than one rail", async () => {
    const result = await processLevel1({
      emailId: "email-3", extractionInput: { ...extractionInput, bodyText: `${extractionInput.bodyText}\nAccount: 5010023456789\nIFSC: HDFC0001234` }, classification,
      auth: { dmarc: null, spf: null, dkim: null }, replyTo: null, links: [], approvedPayees: [], duplicateHistory: [],
    }, extractPaymentDetails);
    expect(result.resolution).toEqual({ status: "multiple_payment_methods" });
    expect(result.decision).toBe("needs_approval");
  });
});
