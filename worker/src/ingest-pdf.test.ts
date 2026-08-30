import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { ingestGmailMessages, type IngestDeps } from "./ingest.js";
import type { RawGmailMessage } from "./gmail.js";
import { classifyEmail } from "./classifier.js";

// New coverage for the PDF-extraction wiring — the existing ingest.test.ts
// fixtures predate this feature, so none of them exercise it. Real network
// calls are never made here: `deps` is always a fake, injected the same way
// `manual-pay.ts` and `llm-classifier.ts` are tested elsewhere in this repo.

function makeMessage(overrides: Partial<RawGmailMessage> & { messageId: string }): RawGmailMessage {
  return {
    threadId: `thread-${overrides.messageId}`,
    subject: "Invoice attached",
    messageTimestamp: new Date().toISOString(),
    labelIds: [],
    headers: { From: "Vendor <vendor@example.com>" },
    payload: { headers: [], parts: [] },
    ...overrides,
  };
}

async function cleanup() {
  await prisma.email.deleteMany({ where: { gmailMessageId: { startsWith: "pdf-test-" } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("ingestGmailMessages — PDF attachment text extraction", () => {
  it("appends extracted PDF text to bodyText and lets the classifier see it", async () => {
    const message = makeMessage({
      messageId: "pdf-test-1",
      payload: {
        headers: [],
        parts: [
          { mimeType: "text/plain", body: { data: Buffer.from("Hi, invoice attached, thanks.").toString("base64url") } },
          { mimeType: "application/pdf", filename: "invoice.pdf", body: { attachmentId: "att-1", size: 1234 } },
        ],
      },
    });

    const deps: IngestDeps = {
      fetchAttachmentBytes: async (messageId, attachmentId, filename) => {
        expect(messageId).toBe("pdf-test-1");
        expect(attachmentId).toBe("att-1");
        expect(filename).toBe("invoice.pdf");
        return new Uint8Array([1, 2, 3]);
      },
      extractPdfText: async () => "TOTAL AMOUNT DUE: ₹15,000",
      classifyEmail: async (input) => classifyEmail(input),
    };

    await ingestGmailMessages([message], deps);

    const row = await prisma.email.findUniqueOrThrow({ where: { gmailMessageId: "pdf-test-1" } });
    expect(row.bodyText).toContain("Hi, invoice attached, thanks.");
    expect(row.bodyText).toContain("TOTAL AMOUNT DUE: ₹15,000");
    expect(row.attachments).toEqual(expect.arrayContaining([expect.objectContaining({ filename: "invoice.pdf", extractionStatus: "extracted" })]));
    expect(row.classification).toBe("invoice");
  });

  it("still ingests the email when PDF extraction fails, just without that text", async () => {
    const message = makeMessage({
      messageId: "pdf-test-2",
      payload: {
        headers: [],
        parts: [
          { mimeType: "text/plain", body: { data: Buffer.from("See attached.").toString("base64url") } },
          { mimeType: "application/pdf", filename: "corrupt.pdf", body: { attachmentId: "att-2", size: 10 } },
        ],
      },
    });

    const deps: IngestDeps = {
      fetchAttachmentBytes: async () => {
        throw new Error("download link expired");
      },
      extractPdfText: async () => null,
      classifyEmail: async (input) => classifyEmail(input),
    };

    await ingestGmailMessages([message], deps);

    const row = await prisma.email.findUniqueOrThrow({ where: { gmailMessageId: "pdf-test-2" } });
    expect(row.bodyText).toBe("See attached.");
    expect(row.attachments).toEqual(expect.arrayContaining([expect.objectContaining({ filename: "corrupt.pdf", extractionStatus: "failed" })]));
  });

  it("never fetches attachments for a message the junk filter already ignored", async () => {
    // Calendar invites are unconditionally junk (FR-7) regardless of what
    // else is attached — a cleaner way to force isJunk than the
    // List-Unsubscribe path, which is deliberately NOT junk once an
    // attachment is present (an attachment makes it look more like a real
    // invoice, so that rule only fires on attachment-free newsletters).
    const message = makeMessage({
      messageId: "pdf-test-3",
      payload: {
        headers: [],
        parts: [
          { mimeType: "text/calendar", body: { data: Buffer.from("BEGIN:VCALENDAR").toString("base64url") } },
          { mimeType: "application/pdf", filename: "brochure.pdf", body: { attachmentId: "att-3", size: 10 } },
        ],
      },
    });

    let called = false;
    const deps: IngestDeps = {
      fetchAttachmentBytes: async () => {
        called = true;
        return new Uint8Array();
      },
      extractPdfText: async () => "should never be reached",
      classifyEmail: async (input) => classifyEmail(input),
    };

    await ingestGmailMessages([message], deps);

    expect(called).toBe(false);
    const row = await prisma.email.findUniqueOrThrow({ where: { gmailMessageId: "pdf-test-3" } });
    expect(row.classification).toBe("ignored");
  });

  it("skips an oversized PDF before downloading it", async () => {
    const message = makeMessage({
      messageId: "pdf-test-4",
      payload: {
        headers: [],
        parts: [
          { mimeType: "application/pdf", filename: "too-large.pdf", body: { attachmentId: "att-4", size: 10 * 1024 * 1024 + 1 } },
        ],
      },
    });
    let downloaded = false;
    const deps: IngestDeps = {
      fetchAttachmentBytes: async () => {
        downloaded = true;
        return new Uint8Array();
      },
      extractPdfText: async () => "should never be reached",
      classifyEmail: async (input) => classifyEmail(input),
    };

    await ingestGmailMessages([message], deps);

    expect(downloaded).toBe(false);
  });
});
