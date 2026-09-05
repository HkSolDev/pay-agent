import { describe, expect, it } from "vitest";
import { loadEmlFixture } from "./load-eml.js";

// This loader is test-only glue: it turns a real, portable RFC822 .eml file
// (what the PRD's own red-team folder requires, see Appendix C) into the
// RawGmailMessage shape worker/src/ingest.ts actually consumes — Gmail's
// Composio API hands ingest.ts pre-parsed JSON, never raw RFC822, so this
// loader exists purely so a genuine .eml fixture file can still exercise
// the real ingestGmailMessages pipeline in a test. Deliberately minimal:
// it only supports what these hand-authored fixtures actually use (a
// header block, a single text/plain body, or one level of multipart/mixed
// with a base64 attachment) — not a general MIME parser.

const SIMPLE_EML = `From: Riya Sharma <riya@vendor.example>
To: owner@example.com
Subject: Invoice INV-2001
Message-ID: <simple@vendor.example>
Date: Mon, 1 Sep 2026 10:00:00 +0000
Content-Type: text/plain; charset=utf-8

Invoice INV-2001
Total due: INR 500
UPI: riya@okaxis
`;

describe("loadEmlFixture", () => {
  it("parses headers and a single text/plain body into a RawGmailMessage", () => {
    const { message } = loadEmlFixture(SIMPLE_EML, "test-1");

    expect(message.messageId).toBe("test-1");
    expect(message.headers["From"]).toBe("Riya Sharma <riya@vendor.example>");
    expect(message.subject).toBe("Invoice INV-2001");
    expect(message.payload?.mimeType).toBe("text/plain");
    const decoded = Buffer.from(message.payload!.body!.data!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(decoded).toContain("Total due: INR 500");
    expect(decoded).toContain("UPI: riya@okaxis");
  });

  it("returns no attachment bytes for a single-part message", () => {
    const { attachmentBytes } = loadEmlFixture(SIMPLE_EML, "test-1");
    expect(attachmentBytes.size).toBe(0);
  });

  it("parses a multipart/mixed message into a text part and a base64 attachment part", () => {
    const attachmentBytes64 = Buffer.from("hello pdf bytes", "utf8").toString("base64");
    const raw = `From: Vendor <vendor@vendor.example>
To: owner@example.com
Subject: Invoice with attachment
Content-Type: multipart/mixed; boundary="BOUND1"

--BOUND1
Content-Type: text/plain; charset=utf-8

Please see the attached invoice.
--BOUND1
Content-Type: application/pdf; name="invoice.pdf"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="invoice.pdf"

${attachmentBytes64}
--BOUND1--
`;

    const { message, attachmentBytes } = loadEmlFixture(raw, "test-2");

    expect(message.payload?.mimeType).toBe("multipart/mixed");
    const parts = message.payload!.parts!;
    expect(parts).toHaveLength(2);
    expect(parts[0].mimeType).toBe("text/plain");
    const textDecoded = Buffer.from(parts[0].body!.data!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(textDecoded).toContain("Please see the attached invoice.");

    expect(parts[1].mimeType).toBe("application/pdf");
    expect(parts[1].filename).toBe("invoice.pdf");
    const attachmentId = parts[1].body!.attachmentId!;
    expect(Buffer.from(attachmentBytes.get(attachmentId)!).toString("utf8")).toBe("hello pdf bytes");
  });
});
