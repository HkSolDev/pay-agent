import { describe, expect, it } from "vitest";
import { parseGmailPayload } from "./mime.js";

function encoded(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

describe("parseGmailPayload", () => {
  it("decodes a plaintext email", () => {
    const result = parseGmailPayload({ mimeType: "text/plain", body: { data: encoded("Pay ₹500 to riya@okaxis") } });
    expect(result.bodyText).toBe("Pay ₹500 to riya@okaxis");
    expect(result.bodyHtmlHash).toBeNull();
    expect(result.links).toEqual([]);
  });

  it("turns HTML into readable text and extracts links", () => {
    const result = parseGmailPayload({
      mimeType: "text/html",
      body: { data: encoded('<p>Invoice <a href="https://example.com/invoice">open invoice</a></p>') },
    });
    expect(result.bodyText).toBe("Invoice open invoice");
    expect(result.bodyHtmlHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.links).toEqual([{ href: "https://example.com/invoice", visibleText: "open invoice" }]);
  });

  it("prefers the plaintext part in a multipart email and records attachments", () => {
    const result = parseGmailPayload({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: encoded("Invoice INV-1: ₹500") } },
        { mimeType: "text/html", body: { data: encoded("<p>Invoice INV-1: ₹500</p>") } },
        { mimeType: "application/pdf", filename: "invoice.pdf", body: { size: 1234, attachmentId: "att-1" } },
      ],
    });
    expect(result.bodyText).toBe("Invoice INV-1: ₹500");
    expect(result.attachments).toEqual([
      { filename: "invoice.pdf", mimeType: "application/pdf", size: 1234, attachmentId: "att-1" },
    ]);
  });

  it("flags a calendar invite by its MIME part, not by filename guessing", () => {
    const result = parseGmailPayload({
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: encoded("You're invited") } },
        { mimeType: "text/calendar", body: { data: encoded("BEGIN:VCALENDAR\nEND:VCALENDAR") } },
      ],
    });
    expect(result.hasCalendarInvite).toBe(true);
  });

  it("does not flag an ordinary email as a calendar invite", () => {
    const result = parseGmailPayload({ mimeType: "text/plain", body: { data: encoded("Hello") } });
    expect(result.hasCalendarInvite).toBe(false);
  });
});
