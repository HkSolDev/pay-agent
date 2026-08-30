export type JsonRecord = Record<string, unknown>;

export interface ReviewAttachment {
  filename: string;
  mimeType: string;
  size: number;
  extractionStatus?: string;
}

export interface ReviewEmail {
  id: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromName: string | null;
  fromAddr: string;
  replyTo: string | null;
  returnPath: string | null;
  toAddrs: string[];
  date: string;
  subject: string | null;
  bodyText: string | null;
  attachments: unknown;
  auth: unknown;
  classification: string | null;
  classificationConfidence: number | null;
  classificationRationale: string | null;
  injectionDetected: boolean;
  injectionEvidence: unknown;
  extractionSummary: unknown;
  extractionBackend: string | null;
  payeeResolution: unknown;
  verificationResult: unknown;
  duplicateResult: unknown;
  policyDecision: string | null;
  policyReasons: string[];
  level1ProcessedAt: string | null;
  reviewStatus: string | null;
  reviewedAt: string | null;
}

export interface ReviewIntent {
  status: string;
  paidAt?: string | null;
}

export interface ReviewField {
  label: string;
  value: string;
  confidence: string;
}

export type EvidenceState = "pass" | "review" | "fail" | "unknown";

export interface ReviewEvidence {
  label: string;
  state: EvidenceState;
  detail: string;
}

export interface ReviewTimelineEvent {
  label: string;
  state: "complete" | "pending";
  date: string | null;
  detail: string;
}

export interface ReviewDrawerModel {
  email: {
    from: string;
    replyTo: string;
    to: string;
    subject: string;
    body: string;
  };
  fields: ReviewField[];
  attachments: Array<{ name: string; type: string; size: string; status: string }>;
  verification: ReviewEvidence[];
  duplicate: { status: string; detail: string; originalEmailId: string | null };
  policy: { decision: string; reasons: string[] };
  timeline: ReviewTimelineEvent[];
  actions: Array<"approve" | "reject" | "not_an_invoice" | "retry">;
  extractionBackend: string;
  payeeResolution: string;
  classification: string;
  classificationConfidence: string;
  classificationRationale: string;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function formatConfidence(value: unknown): string {
  const number = asNumber(value);
  return number === null ? "—" : `${Math.round(Math.max(0, Math.min(1, number)) * 100)}%`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatSize(value: unknown): string {
  const bytes = asNumber(value);
  if (bytes === null) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 1024 * 1024 ? 1 : 2)} ${bytes < 1024 * 1024 ? "KB" : "MB"}`;
}

function railLabel(value: string): string {
  switch (value) {
    case "upi": return "UPI";
    case "bank_neft": return "Bank transfer (NEFT)";
    default: return "Unknown rail";
  }
}

function attachmentStatus(attachment: JsonRecord, bodyText: string | null): string {
  switch (attachment.extractionStatus) {
    case "extracted": return "Extracted";
    case "failed": return "Extraction failed";
    case "skipped": return "Skipped — review required";
    case "pending": return "Pending extraction";
  }
  const filename = asString(attachment.filename);
  const mimeType = asString(attachment.mimeType);
  const isPdf = mimeType === "application/pdf" || filename?.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Not a PDF";
  return filename && bodyText?.includes(`--- ${filename} ---`)
    ? "Extracted"
    : "Not extracted — review required";
}

function evidenceState(hardFails: string[], softFlags: string[], flag: string, fallback: EvidenceState = "pass"): EvidenceState {
  if (hardFails.includes(flag)) return "fail";
  if (softFlags.includes(flag)) return "review";
  return fallback;
}

function evidenceDetail(state: EvidenceState, pass: string, review: string, fail: string, unknown = "No evidence stored."): string {
  if (state === "pass") return pass;
  if (state === "review") return review;
  if (state === "fail") return fail;
  return unknown;
}

export function safeEmailBody(value: string | null): string {
  // The caller renders this string as a text node inside <pre>. Keeping the
  // original value intact preserves audit evidence while React escapes tags
  // and prevents links or remote images from becoming active content.
  return value ?? "No body content stored.";
}

export function buildReviewDrawerModel(email: ReviewEmail, intent?: ReviewIntent): ReviewDrawerModel {
  const extraction = asRecord(email.extractionSummary);
  const amount = asRecord(extraction.amount);
  const verification = asRecord(email.verificationResult);
  const duplicate = asRecord(email.duplicateResult);
  const auth = asRecord(email.auth);
  const hardFails = Array.isArray(verification.hardFails) ? verification.hardFails.filter((item): item is string => typeof item === "string") : [];
  const softFlags = Array.isArray(verification.softFlags) ? verification.softFlags.filter((item): item is string => typeof item === "string") : [];
  const paymentKinds = Array.isArray(extraction.paymentMethodKinds)
    ? extraction.paymentMethodKinds.filter((kind): kind is string => typeof kind === "string")
    : [];
  const amountValue = asString(amount.value);
  const amountCurrency = asString(amount.currency);
  const authValues = ["dmarc", "spf", "dkim"].map((key) => `${key.toUpperCase()}: ${asString(auth[key]) ?? "not stored"}`).join(" · ");
  const authState: EvidenceState = verification.authPassed === true
    ? "pass"
    : Object.keys(auth).length > 0
      ? "review"
      : "unknown";
  const duplicateStatus = duplicate.duplicate === true
    ? "Duplicate"
    : asString(duplicate.suspiciousConflict)
      ? "Review conflict"
      : "No duplicate found";

  const fields: ReviewField[] = [
    { label: "Payee", value: asString(extraction.payeeName) ?? "Not found", confidence: formatConfidence(extraction.payeeNameConfidence) },
    { label: "Amount", value: amountValue && amountCurrency ? `${amountCurrency} ${amountValue}` : "Not found", confidence: formatConfidence(extraction.amountConfidence) },
    { label: "Currency", value: amountCurrency ?? "Unknown", confidence: formatConfidence(extraction.currencyConfidence ?? extraction.amountConfidence) },
    { label: "Invoice reference", value: asString(extraction.referenceNumber) ?? "Not found", confidence: formatConfidence(extraction.referenceNumberConfidence) },
    { label: "Issue date", value: asString(extraction.issueDate) ?? "Not found", confidence: formatConfidence(extraction.issueDateConfidence) },
    { label: "Due date", value: asString(extraction.dueDate) ?? "Not found", confidence: formatConfidence(extraction.dueDateConfidence) },
    { label: "Payment rail", value: paymentKinds.length ? paymentKinds.map(railLabel).join(" + ") : "Not found", confidence: formatConfidence(extraction.paymentMethodConfidence) },
  ];

  const attachments = asRecords(email.attachments).map((attachment) => ({
    name: asString(attachment.filename) ?? "Unnamed attachment",
    type: asString(attachment.mimeType) ?? "Unknown type",
    size: formatSize(attachment.size),
    status: attachmentStatus(attachment, email.bodyText),
  }));

  const verificationEvidence: ReviewEvidence[] = [
    {
      label: "Authentication",
      state: authState,
      detail: evidenceDetail(authState, `DMARC or aligned SPF + DKIM passed. ${authValues}`, `Authentication is present but not aligned. ${authValues}`, "Authentication failed.", authValues),
    },
    {
      label: "Reply-To",
      state: evidenceState(hardFails, softFlags, "reply_to_mismatch", "pass"),
      detail: evidenceDetail(evidenceState(hardFails, softFlags, "reply_to_mismatch", "pass"), "Reply-To matches the sender or is absent.", "Reply-To differs from the sender.", "Reply-To evidence failed."),
    },
    {
      label: "Sender / domain",
      state: hardFails.includes("lookalike_sender_domain") ? "fail" : "pass",
      detail: hardFails.includes("lookalike_sender_domain") ? "Lookalike sender domain detected." : "No lookalike-domain flag was recorded.",
    },
    {
      label: "Links",
      state: hardFails.includes("link_domain_mismatch") ? "fail" : "pass",
      detail: hardFails.includes("link_domain_mismatch") ? "A link domain does not match the sender domain." : "No link-domain mismatch was recorded. Links stay inert in this view.",
    },
    {
      label: "Prompt injection",
      state: email.injectionDetected || hardFails.includes("prompt_injection") ? "fail" : "pass",
      detail: email.injectionDetected || hardFails.includes("prompt_injection") ? "Untrusted instructions were detected; payment execution is blocked." : "No prompt-injection flag was recorded.",
    },
    {
      label: "Changed rail",
      state: hardFails.includes("payment_method_mismatch") ? "fail" : "pass",
      detail: hardFails.includes("payment_method_mismatch") ? "The payment rail differs from the approved payee rail." : "No changed-rail flag was recorded.",
    },
  ];

  const has = (value: unknown) => value !== null && value !== undefined;
  const timeline: ReviewTimelineEvent[] = [
    { label: "Received", state: "complete", date: formatDate(email.date), detail: "Email received" },
    { label: "Classified", state: has(email.classification) ? "complete" : "pending", date: has(email.classification) ? formatDate(email.level1ProcessedAt ?? email.date) : null, detail: email.classification ?? "Waiting for classification" },
    { label: "Extracted", state: has(email.extractionSummary) ? "complete" : "pending", date: has(email.extractionSummary) ? formatDate(email.level1ProcessedAt) : null, detail: email.extractionBackend ? `Using ${email.extractionBackend} extractor` : "Waiting for extraction" },
    { label: "Verified", state: has(email.verificationResult) ? "complete" : "pending", date: has(email.verificationResult) ? formatDate(email.level1ProcessedAt) : null, detail: has(email.verificationResult) ? "Verifier evidence recorded" : "Waiting for verification" },
    { label: "Reviewed", state: has(email.reviewedAt) ? "complete" : "pending", date: formatDate(email.reviewedAt), detail: email.reviewStatus ?? "Owner review pending" },
    { label: "Manually paid", state: intent?.status === "paid" ? "complete" : "pending", date: formatDate(intent?.paidAt ?? null), detail: intent?.status === "paid" ? "Payment recorded" : "No manual payment recorded" },
  ];

  return {
    email: {
      from: email.fromName ? `${email.fromName} <${email.fromAddr}>` : email.fromAddr,
      replyTo: email.replyTo ?? "Not provided",
      to: email.toAddrs.length ? email.toAddrs.join(", ") : "Not provided",
      subject: email.subject ?? "(no subject)",
      body: safeEmailBody(email.bodyText),
    },
    fields,
    attachments,
    verification: verificationEvidence,
    duplicate: {
      status: duplicateStatus,
      detail: duplicate.duplicate === true
        ? "An earlier email has the same approved payee, reference, and amount."
        : asString(duplicate.suspiciousConflict)
          ? `Potential duplicate conflict: ${duplicate.suspiciousConflict}.`
          : "No matching duplicate was recorded.",
      originalEmailId: asString(duplicate.originalEmailId),
    },
    policy: {
      decision: email.policyDecision ?? "pending review",
      reasons: email.policyReasons.length ? email.policyReasons : ["No policy reasons recorded."],
    },
    timeline,
    actions: ["approve", "reject", "not_an_invoice", "retry"],
    extractionBackend: email.extractionBackend ?? "Not recorded",
    payeeResolution: asString(asRecord(email.payeeResolution).status) ?? "Not recorded",
    classification: email.classification ?? "queued",
    classificationConfidence: formatConfidence(email.classificationConfidence),
    classificationRationale: email.classificationRationale ?? "No classifier rationale recorded.",
  };
}
