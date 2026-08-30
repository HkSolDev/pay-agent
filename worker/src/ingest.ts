import { prisma } from "@perflo-ap-agent/db";
import type { RawGmailMessage } from "./gmail.js";
import { fetchAttachmentBytes } from "./gmail.js";
import { parseGmailPayload, toJsonSafeAttachments, type ParsedAttachment } from "./mime.js";
import { shouldIgnoreInitialJunk } from "./junk-filter.js";
import { classifyEmail, type ClassifierInput, type ClassificationResult } from "./classifier.js";
import { classifyEmailWithLLM } from "./llm-classifier.js";
import { extractPdfText } from "./pdf-extract.js";

export const MAX_PDF_ATTACHMENTS_PER_EMAIL = 3;
export const MAX_PDF_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface IngestDeps {
  fetchAttachmentBytes: (messageId: string, attachmentId: string, filename: string, maxBytes?: number) => Promise<Uint8Array>;
  extractPdfText: (bytes: Uint8Array) => Promise<string | null>;
  classifyEmail: (input: ClassifierInput) => Promise<ClassificationResult>;
}

// Safety switch, opt-IN not opt-out: the free rule-based classifier runs
// unless CLASSIFIER_MODE=llm is explicitly set. Checked at call time (not
// baked in at import), so flipping the env var and restarting the worker —
// e.g. rule-based for everyday local testing, "llm" right before a demo —
// takes effect without any code change.
export async function classifyWithSelectedBackend(input: ClassifierInput): Promise<ClassificationResult> {
  if (process.env.CLASSIFIER_MODE === "llm") {
    return classifyEmailWithLLM(input);
  }
  return classifyEmail(input);
}

const defaultDeps: IngestDeps = { fetchAttachmentBytes, extractPdfText, classifyEmail: classifyWithSelectedBackend };

function isPdfAttachment(attachment: ParsedAttachment): boolean {
  return attachment.mimeType === "application/pdf" || attachment.filename.toLowerCase().endsWith(".pdf");
}

/**
 * Downloads and extracts text from every PDF attachment on a message,
 * appended to the parsed body text so the classifier can see what's inside
 * a PDF invoice, not just what's in the email itself. A failure on any one
 * attachment (corrupted PDF, expired download link, network error) is
 * logged and skipped — it must never block ingestion of the rest of the
 * email or the batch; the email still gets ingested with whatever text it
 * does have.
 */
async function appendPdfText(
  messageId: string,
  bodyText: string | null,
  attachments: ParsedAttachment[],
  deps: IngestDeps,
): Promise<string | null> {
  const sections = bodyText ? [bodyText] : [];
  let fetchedPdfCount = 0;
  for (const attachment of attachments) {
    if (!isPdfAttachment(attachment) || !attachment.attachmentId) continue;
    if (fetchedPdfCount >= MAX_PDF_ATTACHMENTS_PER_EMAIL) {
      console.warn(`Skipping PDF attachment "${attachment.filename}" on message ${messageId}: attachment-count limit reached.`);
      continue;
    }
    if (attachment.size > MAX_PDF_ATTACHMENT_BYTES) {
      console.warn(`Skipping PDF attachment "${attachment.filename}" on message ${messageId}: exceeds size limit.`);
      continue;
    }
    fetchedPdfCount += 1;
    try {
      const bytes = await deps.fetchAttachmentBytes(messageId, attachment.attachmentId, attachment.filename, MAX_PDF_ATTACHMENT_BYTES);
      const text = await deps.extractPdfText(bytes);
      if (text) sections.push(`--- ${attachment.filename} ---\n${text}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`PDF extraction failed for "${attachment.filename}" on message ${messageId}: ${reason}`);
    }
  }
  return sections.length > 0 ? sections.join("\n\n") : null;
}

// Turns "Riya Sharma <riya@example.com>" into { name, email }.
// Plenty of real headers are just "riya@example.com" with no display name — handle both.
function parseAddress(raw: string | undefined): { name: string | null; email: string } {
  if (!raw) return { name: null, email: "" };
  const match = raw.match(/^(.*?)<(.+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    return { name: name || null, email: match[2].trim() };
  }
  return { name: null, email: raw.trim() };
}

/**
 * Writes fetched messages into `emails`. Safe to call with messages we've
 * already ingested — `gmail_message_id UNIQUE` is the real guarantee here
 * (FR-2), not the `after:` filter in gmail.ts. Two crons overlapping, or a
 * manual Sync racing the scheduled poll, must still land on exactly one row
 * per message — same principle FR-23's idempotency key uses later for
 * payments: the DB constraint is the source of truth, not application logic.
 */
export async function ingestGmailMessages(messages: RawGmailMessage[], deps: IngestDeps = defaultDeps) {
  if (messages.length === 0) return { inserted: 0, skipped: 0 };

  const rows = await Promise.all(messages.map(async (m) => {
    const from = parseAddress(m.headers["From"]);
    const toAddrs = (m.headers["To"] ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const content = parseGmailPayload(m.payload);
    const attachmentMetadata = toJsonSafeAttachments(content.attachments);

    // FR-7: plain code, no LLM. Junk still gets a row (never delete/hide the
    // source — FR-6), it just gets pre-labeled so the real classifier
    // doesn't waste an LLM call on something this obvious.
    const isJunk = shouldIgnoreInitialJunk({
      headers: m.headers,
      subject: m.subject ?? "",
      bodyText: content.bodyText ?? "",
      hasAttachments: content.attachments.length > 0,
      isCalendarInvite: content.hasCalendarInvite,
    });

    // Only fetched for messages that survived the junk filter — a PDF
    // attached to an obvious newsletter isn't worth a Composio call and a
    // parse. This is what the stored row AND the classifier both see, so a
    // PDF invoice with no text in the email body itself is still visible.
    const bodyText = isJunk
      ? content.bodyText
      : await appendPdfText(m.messageId, content.bodyText, content.attachments, deps);

    const classification = isJunk
      ? null
      : await deps.classifyEmail({
          subject: m.subject,
          bodyText,
          fromName: from.name,
          fromAddr: from.email,
          hasAttachments: content.attachments.length > 0,
        });

    return {
      gmailMessageId: m.messageId,
      gmailThreadId: m.threadId,
      fromAddr: from.email,
      fromName: from.name,
      replyTo: m.headers["Reply-To"] ?? null,
      returnPath: m.headers["Return-Path"] ?? null,
      toAddrs,
      date: new Date(m.messageTimestamp),
      subject: m.subject,
      rawHeaders: m.headers,
      bodyText,
      bodyHtmlHash: content.bodyHtmlHash,
      attachments: attachmentMetadata,
      links: content.links,
      // Each mechanism's whole clause (through the next `;`), not just the
      // 8-character "spf=pass" fragment a narrower match would give —
      // worker/src/verifier.ts needs the domain attribution that comes
      // after the pass/fail token (smtp.mailfrom=/header.from=/header.d=)
      // to check alignment, which a bare "spf=pass" can't provide at all.
      auth: {
        spf: m.headers["Authentication-Results"]?.match(/spf=[^;]+/i)?.[0]?.trim() ?? null,
        dkim: m.headers["Authentication-Results"]?.match(/dkim=[^;]+/i)?.[0]?.trim() ?? null,
        dmarc: m.headers["Authentication-Results"]?.match(/dmarc=[^;]+/i)?.[0]?.trim() ?? null,
      },
      gmailLabels: m.labelIds,
      classification: isJunk ? "ignored" : classification?.kind ?? null,
      classificationConfidence: classification?.confidence ?? null,
      classificationRationale: classification?.rationale ?? null,
      injectionDetected: classification?.injectionDetected ?? false,
      injectionEvidence: classification?.injectionEvidence ?? [],
    };
  }));

  const result = await prisma.email.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return { inserted: result.count, skipped: rows.length - result.count };
}
