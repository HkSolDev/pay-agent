import { createHash } from "node:crypto";

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
}

export interface ParsedEmailContent {
  bodyText: string | null;
  bodyHtmlHash: string | null;
  links: Array<{ href: string; visibleText: string }>;
  attachments: ParsedAttachment[];
  hasCalendarInvite: boolean;
}

/**
 * Prisma's Json input type rejects an object with an `undefined` property
 * (attachmentId is optional) — it wants plain values only, no `undefined`.
 * Shared here since both ingest.ts and backfill-mime.ts write attachments
 * to the same Json column.
 */
export function toJsonSafeAttachments(
  attachments: ParsedAttachment[],
): Array<Record<string, string | number>> {
  return attachments.map((attachment) => {
    const metadata: Record<string, string | number> = {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    };
    if (attachment.attachmentId) metadata.attachmentId = attachment.attachmentId;
    return metadata;
  });
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function cleanText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToText(html: string): string {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>(?=.)/gi, "\n")
      .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  );
}

interface CollectedParts {
  plain: string[];
  html: string[];
  attachments: ParsedAttachment[];
  hasCalendarInvite: boolean;
}

// A calendar invite is Gmail's own "text/calendar" MIME part, or a .ics
// attachment — either way it's never a payment, and detecting it doesn't
// need to look at any text content (FR-7 lists it alongside newsletters).
function isCalendarPart(mimeType: string, filename: string | undefined): boolean {
  return mimeType === "text/calendar" || mimeType === "application/ics" || !!filename?.toLowerCase().endsWith(".ics");
}

function collectParts(part: GmailPart, output: CollectedParts) {
  const mimeType = (part.mimeType ?? "").toLowerCase();
  const filename = part.filename?.trim();
  const data = part.body?.data;

  if (isCalendarPart(mimeType, filename)) {
    output.hasCalendarInvite = true;
  }

  if (filename || (part.body?.attachmentId && !mimeType.startsWith("text/"))) {
    output.attachments.push({
      filename: filename || "unnamed-attachment",
      mimeType: mimeType || "application/octet-stream",
      size: part.body?.size ?? 0,
      ...(part.body?.attachmentId ? { attachmentId: part.body.attachmentId } : {}),
    });
  } else if (data && mimeType === "text/plain") {
    output.plain.push(decodeBase64Url(data));
  } else if (data && mimeType === "text/html") {
    output.html.push(decodeBase64Url(data));
  }

  for (const child of part.parts ?? []) collectParts(child, output);
}

function extractLinks(html: string, text: string): Array<{ href: string; visibleText: string }> {
  const links: Array<{ href: string; visibleText: string }> = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1].trim();
    if (href) links.push({ href, visibleText: cleanText(htmlToText(match[2])) });
  }

  const seen = new Set(links.map((link) => link.href));
  for (const match of text.match(/https?:\/\/[^\s<>]+/gi) ?? []) {
    const href = match.replace(/[),.;!?]+$/, "");
    if (!seen.has(href)) {
      seen.add(href);
      links.push({ href, visibleText: href });
    }
  }
  return links;
}

export function parseGmailPayload(payload: GmailPart | undefined): ParsedEmailContent {
  if (!payload) {
    return { bodyText: null, bodyHtmlHash: null, links: [], attachments: [], hasCalendarInvite: false };
  }

  const collected: CollectedParts = { plain: [], html: [], attachments: [], hasCalendarInvite: false };
  collectParts(payload, collected);

  const html = collected.html.join("\n\n");
  const plain = cleanText(collected.plain.join("\n\n"));
  const bodyText = plain || htmlToText(html) || null;

  return {
    bodyText,
    bodyHtmlHash: html ? createHash("sha256").update(html, "utf8").digest("hex") : null,
    links: extractLinks(html, bodyText ?? ""),
    attachments: collected.attachments,
    hasCalendarInvite: collected.hasCalendarInvite,
  };
}
