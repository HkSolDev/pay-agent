import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createAttachmentHandler } from "./route";

function makeRequest(params?: Record<string, string>, cookies?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/attachment");
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      url.searchParams.set(key, val);
    }
  }
  const req = new NextRequest(url.toString());
  if (cookies) {
    for (const [key, val] of Object.entries(cookies)) {
      req.cookies.set(key, val);
    }
  }
  return req;
}

describe("attachment route handler", () => {
  const mockEmail = {
    id: "email-1",
    gmailMessageId: "gmail-msg-123",
    attachments: [
      {
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        size: 1024,
        attachmentId: "att-pdf-1",
      },
      {
        filename: "notes.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 2048,
        attachmentId: "att-doc-2",
      },
    ],
  };

  const defaultDeps = {
    findEmail: async (id: string) => (id === "email-1" ? mockEmail : null),
    fetchAttachmentBytes: async (_messageId: string, _attachmentId: string, _filename: string) => {
      return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    },
    verifyAuth: async () => true,
    accessPassword: () => undefined,
  };

  it("returns 400 when emailId or attachmentId is missing", async () => {
    const handler = createAttachmentHandler(defaultDeps);

    const res1 = await handler(makeRequest());
    expect(res1.status).toBe(400);

    const res2 = await handler(makeRequest({ emailId: "email-1" }));
    expect(res2.status).toBe(400);

    const res3 = await handler(makeRequest({ attachmentId: "att-pdf-1" }));
    expect(res3.status).toBe(400);
  });

  it("returns 401 when auth verification fails under APP_ACCESS_PASSWORD", async () => {
    const handler = createAttachmentHandler({
      ...defaultDeps,
      accessPassword: () => "secret-pass",
      verifyAuth: async () => false,
    });

    const res = await handler(makeRequest({ emailId: "email-1", attachmentId: "att-pdf-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when email does not exist", async () => {
    const handler = createAttachmentHandler({
      ...defaultDeps,
      findEmail: async () => null,
    });

    const res = await handler(makeRequest({ emailId: "missing-email", attachmentId: "att-pdf-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when attachmentId is not found on the email", async () => {
    const handler = createAttachmentHandler(defaultDeps);

    const res = await handler(makeRequest({ emailId: "email-1", attachmentId: "unknown-att" }));
    expect(res.status).toBe(404);
  });

  it("returns 415 when attachment is not a PDF", async () => {
    const handler = createAttachmentHandler(defaultDeps);

    const res = await handler(makeRequest({ emailId: "email-1", attachmentId: "att-doc-2" }));
    expect(res.status).toBe(415);
  });

  it("returns 502 when fetchAttachmentBytes throws an upstream error", async () => {
    const handler = createAttachmentHandler({
      ...defaultDeps,
      fetchAttachmentBytes: async () => {
        throw new Error("Composio network error");
      },
    });

    const res = await handler(makeRequest({ emailId: "email-1", attachmentId: "att-pdf-1" }));
    expect(res.status).toBe(502);
  });

  it("streams PDF bytes with correct headers on valid request", async () => {
    const handler = createAttachmentHandler(defaultDeps);

    const res = await handler(makeRequest({ emailId: "email-1", attachmentId: "att-pdf-1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("inline");
    expect(res.headers.get("content-disposition")).toContain("invoice.pdf");
    expect(res.headers.get("content-length")).toBe("5");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
  });
});
