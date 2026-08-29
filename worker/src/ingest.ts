import { prisma } from "@perflo-ap-agent/db";
import type { RawGmailMessage } from "./gmail.js";
import { parseGmailPayload, toJsonSafeAttachments } from "./mime.js";
import { shouldIgnoreInitialJunk } from "./junk-filter.js";
import { classifyEmail } from "./classifier.js";

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
export async function ingestGmailMessages(messages: RawGmailMessage[]) {
  if (messages.length === 0) return { inserted: 0, skipped: 0 };

  const rows = messages.map((m) => {
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
    const classification = isJunk
      ? null
      : classifyEmail({
          subject: m.subject,
          bodyText: content.bodyText,
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
      bodyText: content.bodyText,
      bodyHtmlHash: content.bodyHtmlHash,
      attachments: attachmentMetadata,
      links: content.links,
      auth: {
        spf: m.headers["Authentication-Results"]?.match(/spf=\w+/i)?.[0] ?? null,
        dkim: m.headers["Authentication-Results"]?.match(/dkim=\w+/i)?.[0] ?? null,
        dmarc: m.headers["Authentication-Results"]?.match(/dmarc=\w+/i)?.[0] ?? null,
      },
      gmailLabels: m.labelIds,
      classification: isJunk ? "ignored" : classification?.kind ?? null,
      classificationConfidence: classification?.confidence ?? null,
      classificationRationale: classification?.rationale ?? null,
      injectionDetected: classification?.injectionDetected ?? false,
      injectionEvidence: classification?.injectionEvidence ?? [],
    };
  });

  const result = await prisma.email.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return { inserted: result.count, skipped: rows.length - result.count };
}
