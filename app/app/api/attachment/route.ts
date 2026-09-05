import { NextRequest } from "next/server";
import { prisma } from "@perflo-ap-agent/db";
import { fetchAttachmentBytes } from "../../../../worker/src/gmail";
import { verifyAuthToken, COOKIE_NAME } from "../../../lib/auth";

export interface AttachmentHandlerDeps {
  findEmail?: (id: string) => Promise<{
    id: string;
    gmailMessageId: string;
    attachments: unknown;
  } | null>;
  fetchAttachmentBytes?: (
    messageId: string,
    attachmentId: string,
    filename: string,
  ) => Promise<Uint8Array>;
  verifyAuth?: (token: string | undefined | null, password: string) => Promise<boolean>;
  accessPassword?: () => string | undefined;
}

export function createAttachmentHandler(customDeps: AttachmentHandlerDeps = {}) {
  const deps = {
    findEmail: customDeps.findEmail ?? ((id: string) => prisma.email.findUnique({
      where: { id },
      select: { id: true, gmailMessageId: true, attachments: true },
    })),
    fetchAttachmentBytes: customDeps.fetchAttachmentBytes ?? fetchAttachmentBytes,
    verifyAuth: customDeps.verifyAuth ?? verifyAuthToken,
    accessPassword: customDeps.accessPassword ?? (() => process.env.APP_ACCESS_PASSWORD),
  };

  return async function GET(request: NextRequest): Promise<Response> {
    const accessPassword = deps.accessPassword();
    if (accessPassword) {
      const token = request.cookies.get(COOKIE_NAME)?.value;
      const isAuthenticated = await deps.verifyAuth(token, accessPassword);
      if (!isAuthenticated) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const emailId = request.nextUrl.searchParams.get("emailId");
    const attachmentId = request.nextUrl.searchParams.get("attachmentId");

    if (!emailId || !attachmentId) {
      return new Response("Missing emailId or attachmentId", { status: 400 });
    }

    const email = await deps.findEmail(emailId);
    if (!email) {
      return new Response("Email not found", { status: 404 });
    }

    const attachments = Array.isArray(email.attachments) ? email.attachments : [];
    const attachment = attachments.find(
      (att): att is Record<string, unknown> =>
        Boolean(att && typeof att === "object" && (att as Record<string, unknown>).attachmentId === attachmentId),
    );

    if (!attachment) {
      return new Response("Attachment not found", { status: 404 });
    }

    const filename = typeof attachment.filename === "string" ? attachment.filename : "attachment.pdf";
    const mimeType = typeof attachment.mimeType === "string" ? attachment.mimeType : "";
    const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return new Response("Only PDF attachments are supported", { status: 415 });
    }

    let bytes: Uint8Array;
    try {
      bytes = await deps.fetchAttachmentBytes(email.gmailMessageId, attachmentId, filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch attachment";
      return new Response(`Failed to fetch attachment: ${message}`, { status: 502 });
    }

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  };
}

export const GET = createAttachmentHandler();
