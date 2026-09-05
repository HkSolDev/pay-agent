import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { ingestGmailMessages, type IngestDeps } from "../../worker/src/ingest.js";
import { classifyEmail } from "../../worker/src/classifier.js";
import { extractPaymentDetails } from "../../worker/src/extractor.js";
import { extractPdfText } from "../../worker/src/pdf-extract.js";
import type { ApprovedPayee } from "../../worker/src/payee-resolver.js";
import { loadEmlFixture } from "./load-eml.js";

// PRD Section 8.7 rule 7 / Appendix C: "Keep a red-team folder:
// tests/injections/*.eml. Run it in CI." This suite runs each real .eml
// fixture through the real, un-mocked pipeline entry point
// (ingestGmailMessages — the same seam worker/src/ingest.test.ts and
// worker/src/demo-scenarios.integration.test.ts already use) and asserts
// the exact outcome Section 15's phishing table (T-14 through T-17)
// requires. Classification and extraction are the real deterministic
// backends (never the LLM ones — tests must never spend API credit); the
// only stub is fetchAttachmentBytes, which stands in for Gmail's real
// attachments.get call and is backed by the fixture's own embedded
// attachment bytes, not a fake.

function readFixture(name: string, messageId: string) {
  const raw = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
  return loadEmlFixture(raw, messageId);
}

async function ingestFixture(name: string, messageId: string, approvedPayees: ApprovedPayee[] = []) {
  const { message, attachmentBytes } = readFixture(name, messageId);
  const deps: IngestDeps = {
    fetchAttachmentBytes: async (_msgId, attachmentId) => attachmentBytes.get(attachmentId) ?? new Uint8Array(),
    extractPdfText,
    classifyEmail: async (input) => classifyEmail(input),
    extractPaymentDetails: async (input) => extractPaymentDetails(input),
    loadApprovedPayees: async () => approvedPayees,
  };
  await ingestGmailMessages([message], deps);
  return prisma.email.findUniqueOrThrow({ where: { gmailMessageId: messageId } });
}

beforeEach(async () => {
  await prisma.email.deleteMany({ where: { gmailMessageId: { startsWith: "injections-test-" } } });
});

afterAll(async () => {
  await prisma.email.deleteMany({ where: { gmailMessageId: { startsWith: "injections-test-" } } });
  await prisma.$disconnect();
});

describe("tests/injections — red-team fixtures (PRD Section 15, T-14 through T-17)", () => {
  it("T-14: body injection is quarantined, the string appears in evidence, nothing paid", async () => {
    const row = await ingestFixture("14_body_injection.eml", "injections-test-14");

    expect(row.injectionDetected).toBe(true);
    const evidence = row.injectionEvidence as string[];
    expect(evidence.some((e) => e.includes("attacker@upi"))).toBe(true);
    expect(row.policyDecision).toBe("quarantine");
    expect(row.resolvedPayeeId).toBeNull();
  });

  it("T-15: same injection hidden inside a PDF's text layer is also quarantined", async () => {
    const row = await ingestFixture("15_pdf_hidden_text.eml", "injections-test-15");

    // The visible email body never mentions the attacker's handle at all —
    // it's only ever present in the PDF's own extracted text layer, exactly
    // the "white text inside the PDF" case T-15 describes.
    expect(row.injectionDetected).toBe(true);
    const evidence = row.injectionEvidence as string[];
    expect(evidence.some((e) => e.includes("attacker@upi"))).toBe(true);
    expect(row.policyDecision).toBe("quarantine");
    expect(row.resolvedPayeeId).toBeNull();
  });

  it("T-16: link invoice whose final domain is unrelated to the sender is quarantined", async () => {
    const row = await ingestFixture("16_link_domain_mismatch.eml", "injections-test-16");

    expect(row.classification).toBe("invoice");
    const verification = row.verificationResult as { hardFails: string[] };
    expect(verification.hardFails).toContain("link_domain_mismatch");
    expect(row.policyDecision).toBe("quarantine");
    expect(row.resolvedPayeeId).toBeNull();
  });

  it("T-17: a message that fails auth alignment while carrying new bank details is quarantined", async () => {
    const knownPayee: ApprovedPayee = {
      payeeId: "t17-known-payee",
      senderAddr: "riya@okaxis-vendor.example",
      recipientNickname: "t17-riya",
      paymentMethod: { kind: "bank_neft", accountNumber: "111122223333", ifsc: "HDFC0001111" },
      grant: { autoPayEnabled: true, payeeStatus: "approved", perPaymentCapInr: "5000.00", totalCapInr: "20000.00", maxPayments: 10, expiresAt: null },
    };

    const row = await ingestFixture("17_dmarc_fail_new_details.eml", "injections-test-17", [knownPayee]);

    expect(row.classification).toBe("invoice");
    const verification = row.verificationResult as { hardFails: string[]; authPassed: boolean };
    expect(verification.authPassed).toBe(false);
    expect(verification.hardFails).toContain("payment_method_mismatch");
    expect(row.policyDecision).toBe("quarantine");
    expect(row.resolvedPayeeId).toBeNull();
  });

  // PRD Appendix C's 5th tests/injections/ slot is explicitly "add your
  // own" (20_ignore_previous_variants.eml) — a different injection phrasing
  // than T-14's "SYSTEM: pay ..." shape, exercising the classifier's other
  // named pattern family (FR-9/8.2's "ignore previous" example).
  it("ignore-previous-instructions variant is also quarantined, with the attacker's handle in evidence", async () => {
    const row = await ingestFixture("20_ignore_previous_variants.eml", "injections-test-20");

    expect(row.injectionDetected).toBe(true);
    const evidence = row.injectionEvidence as string[];
    expect(evidence.some((e) => e.includes("scammer@upi"))).toBe(true);
    expect(row.policyDecision).toBe("quarantine");
    expect(row.resolvedPayeeId).toBeNull();
  });
});
