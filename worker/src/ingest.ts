import { prisma } from "@perflo-ap-agent/db";
import type { RawGmailMessage } from "./gmail.js";
import { fetchAttachmentBytes } from "./gmail.js";
import { parseGmailPayload, toJsonSafeAttachments, type ParsedAttachment } from "./mime.js";
import { shouldIgnoreInitialJunk } from "./junk-filter.js";
import { classifyEmail, type ClassifierInput, type ClassificationResult } from "./classifier.js";
import { classifyEmailWithLLM } from "./llm-classifier.js";
import { extractPdfText } from "./pdf-extract.js";
import { extractPaymentDetails, type ExtractionInput, type ExtractionResult } from "./extractor.js";
import { extractPaymentDetailsWithLLM } from "./llm-extractor.js";
import { processLevel1, type Level1PipelineResult } from "./level1-pipeline.js";
import type { ApprovedPayee } from "./payee-resolver.js";
import type { PayableFingerprint } from "./duplicate-detector.js";
import { loadApprovedPayees } from "./payee-store.js";
import { loadPayeeUsage } from "./payment-usage.js";
import { runAutoPayIfEligible } from "./auto-pay-runner.js";

export const MAX_PDF_ATTACHMENTS_PER_EMAIL = 3;
export const MAX_PDF_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface IngestDeps {
  fetchAttachmentBytes: (messageId: string, attachmentId: string, filename: string, maxBytes?: number) => Promise<Uint8Array>;
  extractPdfText: (bytes: Uint8Array) => Promise<string | null>;
  classifyEmail: (input: ClassifierInput) => Promise<ClassificationResult>;
  extractPaymentDetails?: (input: ExtractionInput) => Promise<ExtractionResult>;
  loadApprovedPayees?: () => Promise<ApprovedPayee[]>;
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

// Like classification, LLM extraction is explicitly opt-in. The default is
// deterministic extraction, so an env/config mistake cannot consume API
// credit or change a review decision during local development.
export async function extractWithSelectedBackend(input: ExtractionInput): Promise<ExtractionResult> {
  if (process.env.EXTRACTOR_MODE === "llm") return extractPaymentDetailsWithLLM(input);
  return extractPaymentDetails(input);
}

const defaultDeps: IngestDeps = {
  fetchAttachmentBytes,
  extractPdfText,
  classifyEmail: classifyWithSelectedBackend,
  loadApprovedPayees,
};

function authFromJson(value: unknown): { dmarc: string | null; spf: string | null; dkim: string | null } {
  const auth = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    dmarc: typeof auth.dmarc === "string" ? auth.dmarc : null,
    spf: typeof auth.spf === "string" ? auth.spf : null,
    dkim: typeof auth.dkim === "string" ? auth.dkim : null,
  };
}

function linksFromJson(value: unknown): Array<{ href: string; finalDomain: string; visibleText: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const link = item as Record<string, unknown>;
    if (typeof link.href !== "string") return [];
    let finalDomain = "";
    try { finalDomain = new URL(link.href).hostname; } catch { /* suspicious non-URL is not a usable payment link */ }
    return [{ href: link.href, finalDomain, visibleText: typeof link.text === "string" ? link.text : "" }];
  });
}

function fingerprintsFromRows(rows: Array<{ id: string; resolvedPayeeId: string | null; extractionSummary: unknown }>): PayableFingerprint[] {
  return rows.flatMap((row) => {
    if (!row.resolvedPayeeId || !row.extractionSummary || typeof row.extractionSummary !== "object") return [];
    const summary = row.extractionSummary as Record<string, unknown>;
    const amount = summary.amount;
    const safeAmount = amount && typeof amount === "object" && typeof (amount as Record<string, unknown>).currency === "string"
      && typeof (amount as Record<string, unknown>).value === "string"
      ? { currency: (amount as Record<string, string>).currency, value: (amount as Record<string, string>).value }
      : null;
    return [{
      emailId: row.id,
      payeeId: row.resolvedPayeeId,
      referenceNumber: typeof summary.referenceNumber === "string" ? summary.referenceNumber : null,
      referenceIsFallback: summary.referenceIsFallback === true,
      amount: safeAmount,
    }];
  });
}

// Raw payment rails are intentionally omitted from this derived summary.
// The source email body is retained separately for audit/review; derived
// account/VPA fields live only transiently or in encrypted payee storage.
function extractionSummary(extraction: ExtractionResult) {
  return {
    payeeName: extraction.payeeName,
    payeeNameConfidence: extraction.payeeNameConfidence,
    amount: extraction.amount,
    amountConfidence: extraction.amountConfidence,
    currencyConfidence: extraction.amount ? extraction.amountConfidence : 0,
    referenceNumber: extraction.referenceNumber,
    referenceNumberConfidence: extraction.referenceNumberConfidence,
    referenceIsFallback: extraction.referenceNumberConfidence > 0 && extraction.referenceNumberConfidence < 0.85,
    paymentMethodKinds: extraction.paymentMethods.map((method) => method.kind),
    paymentMethodCount: extraction.paymentMethods.length,
    paymentMethodConfidence: extraction.paymentMethodConfidence,
    issueDate: extraction.issueDate,
    issueDateConfidence: extraction.issueDateConfidence,
    dueDate: extraction.dueDate,
    dueDateConfidence: extraction.dueDateConfidence,
  };
}

// Prisma's JSON input types require an index signature even for plain,
// JSON-safe TypeScript interfaces. A serialize/parse boundary also ensures
// no Date, Buffer, or prototype-bearing object is ever written as evidence.
function jsonForStorage(value: unknown): ReturnType<typeof JSON.parse> {
  return JSON.parse(JSON.stringify(value));
}

type ProcessableEmail = {
  id: string;
  gmailMessageId: string;
  fromAddr: string;
  fromName: string | null;
  subject: string | null;
  bodyText: string | null;
  replyTo: string | null;
  auth: unknown;
  links: unknown;
  classification: string | null;
  classificationConfidence: number | null;
  classificationRationale: string | null;
  injectionDetected: boolean;
  injectionEvidence: unknown;
};

async function processEmailRow(
  row: ProcessableEmail,
  approvedPayees: ApprovedPayee[],
  history: PayableFingerprint[],
  extract: (input: ExtractionInput) => Promise<ExtractionResult>,
): Promise<void> {
    const kind = row.classification ?? "unrelated";
    const result: Level1PipelineResult = await processLevel1({
      emailId: row.id,
      extractionInput: { kind: kind as ExtractionInput["kind"], injectionDetected: row.injectionDetected, subject: row.subject, bodyText: row.bodyText, fromName: row.fromName, fromAddr: row.fromAddr },
      classification: {
        kind: kind as ClassificationResult["kind"],
        confidence: row.classificationConfidence ?? 0,
        rationale: row.classificationRationale ?? "No classifier result.",
        injectionDetected: row.injectionDetected,
        injectionEvidence: Array.isArray(row.injectionEvidence) ? row.injectionEvidence.filter((item): item is string => typeof item === "string") : [],
      },
      auth: authFromJson(row.auth),
      replyTo: row.replyTo,
      links: linksFromJson(row.links),
      approvedPayees,
      duplicateHistory: history,
      loadPayeeUsage,
    }, extract);

    await prisma.email.update({
      where: { id: row.id },
      data: {
        extractionSummary: jsonForStorage(extractionSummary(result.extraction)),
        extractionBackend: process.env.EXTRACTOR_MODE === "llm" ? "llm" : "deterministic",
        resolvedPayeeId: result.resolution.status === "resolved" ? result.resolution.payeeId : null,
        payeeResolution: jsonForStorage(result.resolution),
        verificationResult: jsonForStorage(result.verification),
        duplicateResult: jsonForStorage(result.duplicate),
        policyDecision: result.decision,
        policyReasons: result.reasons,
        level1ProcessedAt: new Date(),
      },
    });

    if (result.decision === "auto_pay" && result.resolution.status === "resolved" && result.extraction.amount) {
      await runAutoPayIfEligible({
        emailId: row.id,
        policyDecision: result.decision,
        recipientNickname: result.resolution.recipientNickname,
        amount: result.extraction.amount.value,
      });
    }
}

const processableEmailSelect = {
  id: true, gmailMessageId: true, fromAddr: true, fromName: true, subject: true, bodyText: true, replyTo: true,
  auth: true, links: true, classification: true, classificationConfidence: true, classificationRationale: true,
  injectionDetected: true, injectionEvidence: true,
} as const;

async function processInsertedEmails(deps: IngestDeps, gmailMessageIds: string[]): Promise<void> {
  const rows = await prisma.email.findMany({
    where: { gmailMessageId: { in: gmailMessageIds }, level1ProcessedAt: null },
    select: processableEmailSelect,
  });
  if (rows.length === 0) return;
  const sourceOrder = new Map(gmailMessageIds.map((messageId, index) => [messageId, index]));
  rows.sort((a, b) => (sourceOrder.get(a.gmailMessageId) ?? 0) - (sourceOrder.get(b.gmailMessageId) ?? 0));

  const approvedPayees = await (deps.loadApprovedPayees?.() ?? Promise.resolve([]));
  const previousRows = await prisma.email.findMany({
    where: { level1ProcessedAt: { not: null } },
    select: { id: true, resolvedPayeeId: true, extractionSummary: true },
  });
  let history = fingerprintsFromRows(previousRows);
  const extract = deps.extractPaymentDetails ?? extractWithSelectedBackend;

  // Process this batch in source order so a second message in the same
  // ingestion (notably the demo duplicate pair) can see the first message's
  // resolved fingerprint. The database remains the source of truth for
  // idempotent insertion; this only makes duplicate review deterministic.
  for (const row of rows) {
    await processEmailRow(row, approvedPayees, history, extract);
    const processedRows = await prisma.email.findMany({
      where: { level1ProcessedAt: { not: null } },
      select: { id: true, resolvedPayeeId: true, extractionSummary: true },
    });
    history = fingerprintsFromRows(processedRows);
  }
}

/** Processes rows explicitly queued for another review-only worker pass. */
export async function processPendingLevel1(deps: IngestDeps = defaultDeps): Promise<void> {
  const rows = await prisma.email.findMany({
    where: { level1ProcessedAt: null },
    select: processableEmailSelect,
  });
  if (rows.length === 0) return;

  const approvedPayees = await (deps.loadApprovedPayees?.() ?? Promise.resolve([]));
  const previousRows = await prisma.email.findMany({
    where: { level1ProcessedAt: { not: null } },
    select: { id: true, resolvedPayeeId: true, extractionSummary: true },
  });
  await Promise.all(rows.map((row) => processEmailRow(row, approvedPayees, fingerprintsFromRows(previousRows), deps.extractPaymentDetails ?? extractWithSelectedBackend)));
}

/** Re-run the review-only Level 1 stages for an existing email. */
export async function retryLevel1Processing(emailId: string): Promise<void> {
  const row = await prisma.email.findUniqueOrThrow({ where: { id: emailId }, select: processableEmailSelect });
  const approvedPayees = await loadApprovedPayees();
  const previousRows = await prisma.email.findMany({
    where: { level1ProcessedAt: { not: null } },
    select: { id: true, resolvedPayeeId: true, extractionSummary: true },
  });
  await processEmailRow(row, approvedPayees, fingerprintsFromRows(previousRows), extractWithSelectedBackend);
}

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
): Promise<{ bodyText: string | null; statuses: Map<string, "extracted" | "failed" | "skipped"> }> {
  const sections = bodyText ? [bodyText] : [];
  const statuses = new Map<string, "extracted" | "failed" | "skipped">();
  let fetchedPdfCount = 0;
  for (const attachment of attachments) {
    if (!isPdfAttachment(attachment)) continue;
    if (!attachment.attachmentId) {
      statuses.set(attachment.filename, "skipped");
      continue;
    }
    if (fetchedPdfCount >= MAX_PDF_ATTACHMENTS_PER_EMAIL) {
      statuses.set(attachment.filename, "skipped");
      console.warn(`Skipping PDF attachment "${attachment.filename}" on message ${messageId}: attachment-count limit reached.`);
      continue;
    }
    if (attachment.size > MAX_PDF_ATTACHMENT_BYTES) {
      statuses.set(attachment.filename, "skipped");
      console.warn(`Skipping PDF attachment "${attachment.filename}" on message ${messageId}: exceeds size limit.`);
      continue;
    }
    fetchedPdfCount += 1;
    try {
      const bytes = await deps.fetchAttachmentBytes(messageId, attachment.attachmentId, attachment.filename, MAX_PDF_ATTACHMENT_BYTES);
      const text = await deps.extractPdfText(bytes);
      if (text) {
        sections.push(`--- ${attachment.filename} ---\n${text}`);
        statuses.set(attachment.filename, "extracted");
      } else {
        statuses.set(attachment.filename, "failed");
      }
    } catch (error) {
      statuses.set(attachment.filename, "failed");
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`PDF extraction failed for "${attachment.filename}" on message ${messageId}: ${reason}`);
    }
  }
  return { bodyText: sections.length > 0 ? sections.join("\n\n") : null, statuses };
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
    let attachmentMetadata = toJsonSafeAttachments(content.attachments);

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
    let bodyText = content.bodyText;
    if (!isJunk) {
      const pdfResult = await appendPdfText(m.messageId, content.bodyText, content.attachments, deps);
      bodyText = pdfResult.bodyText;
      attachmentMetadata = attachmentMetadata.map((metadata) => {
        const filename = metadata.filename;
        const status = typeof filename === "string" ? pdfResult.statuses.get(filename) : undefined;
        return status ? { ...metadata, extractionStatus: status } : metadata;
      });
    }

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

  // Persist evaluation only after the immutable source row exists. A retry
  // after a crash picks up rows with level1ProcessedAt=NULL without ever
  // re-downloading Gmail content or creating another email record.
  await processInsertedEmails(deps, rows.map((row) => row.gmailMessageId));

  return { inserted: result.count, skipped: rows.length - result.count };
}
