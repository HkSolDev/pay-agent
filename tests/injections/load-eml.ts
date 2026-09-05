import type { RawGmailMessage } from "../../worker/src/gmail.js";
import type { GmailPart } from "../../worker/src/mime.js";

// Minimal, scoped RFC822 -> RawGmailMessage adapter. Not a general MIME
// parser: it only supports what this red-team folder's hand-authored .eml
// fixtures actually use — a header block followed by either a single
// text/plain body, or one level of multipart/mixed containing a text/plain
// part and/or one base64-encoded attachment part. See load-eml.test.ts for
// what's covered.

export interface LoadedEmlFixture {
  message: RawGmailMessage;
  // Gmail's real API never inlines a non-text attachment's bytes in the
  // payload itself (see worker/src/gmail.ts's RawGmailMessage.payload
  // comment) — a separate attachments.get call fetches those by
  // attachmentId, which is exactly the shape worker/src/ingest.ts's
  // IngestDeps.fetchAttachmentBytes expects. This map is what a test's
  // fetchAttachmentBytes stub should read from.
  attachmentBytes: Map<string, Uint8Array>;
}

function encodeBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

interface RawPart {
  headers: Record<string, string>;
  body: string;
}

function parseHeaderBlock(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return headers;
}

function splitHeadersAndBody(raw: string): RawPart {
  const normalized = raw.replace(/\r\n/g, "\n");
  const boundary = normalized.indexOf("\n\n");
  if (boundary === -1) return { headers: parseHeaderBlock(normalized), body: "" };
  return { headers: parseHeaderBlock(normalized.slice(0, boundary)), body: normalized.slice(boundary + 2) };
}

function contentTypeOf(headers: Record<string, string>): { type: string; boundary?: string } {
  const raw = headers["Content-Type"] ?? "text/plain";
  const type = raw.split(";")[0].trim().toLowerCase();
  const boundaryMatch = raw.match(/boundary="?([^";]+)"?/i);
  return { type, boundary: boundaryMatch?.[1] };
}

function splitMultipart(body: string, boundary: string): string[] {
  const marker = `--${boundary}`;
  return body
    .split(marker)
    .slice(1, -1) // drop preamble before the first boundary and the epilogue after the closing "--boundary--"
    .map((section) => section.replace(/^\n/, "").replace(/\n$/, ""));
}

let attachmentCounter = 0;

function buildGmailPart(part: RawPart, attachmentBytes: Map<string, Uint8Array>): GmailPart {
  const { type } = contentTypeOf(part.headers);
  const dispositionFilename = part.headers["Content-Disposition"]?.match(/filename="?([^";]+)"?/i)?.[1];
  const isBase64 = /base64/i.test(part.headers["Content-Transfer-Encoding"] ?? "");
  const isTextPart = type.startsWith("text/");

  if (isTextPart && !dispositionFilename) {
    return { mimeType: type, body: { data: encodeBase64Url(part.body) } };
  }

  // A non-text (or explicitly attached) part: real Gmail never inlines these
  // bytes in the payload — record them under a synthetic attachmentId and
  // let the caller's fetchAttachmentBytes stub serve them, same contract
  // ingest.ts already expects.
  attachmentCounter += 1;
  const attachmentId = `fixture-attachment-${attachmentCounter}`;
  const bytes = isBase64
    ? new Uint8Array(Buffer.from(part.body.replace(/\n/g, ""), "base64"))
    : new Uint8Array(Buffer.from(part.body, "utf8"));
  attachmentBytes.set(attachmentId, bytes);
  return {
    mimeType: type,
    filename: dispositionFilename ?? "attachment",
    body: { size: bytes.byteLength, attachmentId },
  };
}

export function loadEmlFixture(raw: string, messageId: string): LoadedEmlFixture {
  const attachmentBytes = new Map<string, Uint8Array>();
  const top = splitHeadersAndBody(raw);
  const { type, boundary } = contentTypeOf(top.headers);

  let payload: GmailPart;
  if (type.startsWith("multipart/") && boundary) {
    const parts = splitMultipart(top.body, boundary).map((section) => splitHeadersAndBody(section));
    payload = { mimeType: type, parts: parts.map((part) => buildGmailPart(part, attachmentBytes)) };
  } else {
    payload = buildGmailPart(top, attachmentBytes);
  }

  const message: RawGmailMessage = {
    messageId,
    threadId: messageId,
    subject: top.headers["Subject"] ?? null,
    messageTimestamp: top.headers["Date"] ? new Date(top.headers["Date"]).toISOString() : new Date().toISOString(),
    labelIds: ["INBOX"],
    headers: top.headers,
    payload,
  };

  return { message, attachmentBytes };
}
