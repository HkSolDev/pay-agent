import { createHash } from "node:crypto";
import type { ClassificationKind } from "./classifier.js";
import { normalizePaymentMethod, type PaymentMethod } from "./payment-method-validation.js";

// FR-10 through FR-13: pulls the actual payable fields out of an email
// already classified as invoice/payment_request/reminder. Every field
// carries its own confidence; a field this code can't find is `null`, never
// a guess — FR-11 is explicit that a ₹500 cab fare paid as $500 is the kind
// of bug that ends the project, so ambiguous currency stays ambiguous
// rather than defaulting to one.

export interface ExtractedAmount {
  value: string;
  currency: "INR" | "USD";
}

export type { PaymentMethod } from "./payment-method-validation.js";

// The classifier's own output feeds straight into this input — the
// extractor re-checks `kind` and `injectionDetected` itself and refuses to
// run rather than trusting the caller to have gated it correctly. Two
// independent checks are safer than one for the boundary between "just a
// label" and "fields the policy engine might act on".
export interface ExtractionInput {
  kind: ClassificationKind;
  injectionDetected?: boolean;
  subject: string | null;
  bodyText: string | null;
  fromName?: string | null;
  fromAddr?: string | null;
}

const PAYABLE_KINDS: ReadonlySet<ClassificationKind> = new Set(["invoice", "payment_request", "reminder"]);

export interface ExtractionResult {
  payeeName: string | null;
  payeeNameConfidence: number;
  amount: ExtractedAmount | null;
  amountConfidence: number;
  referenceNumber: string | null;
  referenceNumberConfidence: number;
  paymentMethods: PaymentMethod[];
  paymentMethodConfidence: number;
  issueDate: string | null;
  issueDateConfidence: number;
  dueDate: string | null;
  dueDateConfidence: number;
}

// A fully empty result — returned, never thrown, when this function refuses
// to run at all (non-payable classification, or an injection attempt). A
// thrown error would force every caller to remember a try/catch just to
// stay safe; a safe empty value can't be forgotten.
function emptyResult(): ExtractionResult {
  return {
    payeeName: null,
    payeeNameConfidence: 0,
    amount: null,
    amountConfidence: 0,
    referenceNumber: null,
    referenceNumberConfidence: 0,
    paymentMethods: [],
    paymentMethodConfidence: 0,
    issueDate: null,
    issueDateConfidence: 0,
    dueDate: null,
    dueDateConfidence: 0,
  };
}

// --- Amount + currency (FR-11) ---------------------------------------

// Symbol/code-led: "₹5,000", "Rs. 5000/-", "INR 5k", "$500".
const CURRENCY_LED_AMOUNT = /(₹|Rs\.?|INR|\$|USD)\s*([\d,]+(?:\.\d+)?)\s*(k)?/gi;
// Amount-led: "5000 INR", "500 rupees".
const AMOUNT_LED_CURRENCY = /([\d,]+(?:\.\d+)?)\s*(k)?\s*(INR|Rs\.?|rupees|USD|dollars)/gi;

// Words that mark a smaller, partial figure rather than the actual total
// owed — a deposit, advance, or a line item/subtotal is a real amount in
// the text, but it is not the amount that should be paid.
const PARTIAL_AMOUNT_CONTEXT = /\b(?:deposit|advance|part\s*payment|installment|subtotal|line\s*item)\b(?:\s*(?:paid|received))?/i;
// Ranked from most to least specific — "balance due" (what's left to pay
// after a deposit) is checked first since it's the most direct answer to
// "how much is actually owed now".
const TOTAL_CONTEXT = /\b(?:balance\s*due|outstanding\s*(?:amount|balance)?|amount\s*now\s*due|grand\s*total|total\s*(?:amount\s*)?(?:due|payable)|total\s*payable|net\s*payable|remaining\s*(?:amount|balance)?)\b/i;

function currencyFromToken(token: string): "INR" | "USD" | null {
  const normalized = token.toLowerCase().replace(/\./g, "");
  if (["₹", "rs", "inr", "rupees"].includes(normalized)) return "INR";
  if (["$", "usd", "dollars"].includes(normalized)) return "USD";
  return null;
}

function parseAmountNumber(digits: string, hasK: boolean): number {
  const n = Number.parseFloat(digits.replace(/,/g, ""));
  return hasK ? n * 1000 : n;
}

interface AmountCandidate {
  value: number;
  currency: "INR" | "USD" | null;
  isTotal: boolean;
  isPartial: boolean;
}

// A line is a real structural unit a table's own layout already respects —
// a character radius bleeds across rows in a dense table (subtotal/CGST/
// SGST/total a few characters apart). Two different windows on purpose:
// - "total" labels are allowed to sit on the line before the amount
//   ("TOTAL AMOUNT DUE:\n₹15,000"), so that check gets prevLine+currentLine.
// - "partial" labels (deposit/advance/subtotal) must describe THIS amount,
//   not bleed forward from a deposit line into the very next line's real
//   balance-due figure — that check gets currentLine only.
function lineContext(text: string, index: number): { currentLine: string; withPrevLine: string } {
  const lineStart = text.lastIndexOf("\n", index);
  const lineEnd = text.indexOf("\n", index);
  const currentLine = text.slice(lineStart + 1, lineEnd === -1 ? text.length : lineEnd);
  const prevLineStart = text.lastIndexOf("\n", lineStart - 1);
  const prevLine = lineStart === -1 ? "" : text.slice(prevLineStart + 1, lineStart);
  return { currentLine, withPrevLine: `${prevLine}\n${currentLine}` };
}

function collectAmountCandidates(text: string): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];

  for (const match of text.matchAll(CURRENCY_LED_AMOUNT)) {
    const { currentLine, withPrevLine } = lineContext(text, match.index!);
    candidates.push({
      value: parseAmountNumber(match[2], !!match[3]),
      currency: currencyFromToken(match[1]),
      isTotal: TOTAL_CONTEXT.test(withPrevLine),
      isPartial: PARTIAL_AMOUNT_CONTEXT.test(currentLine),
    });
  }
  for (const match of text.matchAll(AMOUNT_LED_CURRENCY)) {
    const { currentLine, withPrevLine } = lineContext(text, match.index!);
    candidates.push({
      value: parseAmountNumber(match[1], !!match[2]),
      currency: currencyFromToken(match[3]),
      isTotal: TOTAL_CONTEXT.test(withPrevLine),
      isPartial: PARTIAL_AMOUNT_CONTEXT.test(currentLine),
    });
  }

  return candidates;
}

interface AmountExtraction {
  amount: ExtractedAmount | null;
  confidence: number;
}

function extractAmount(text: string): AmountExtraction {
  const candidates = collectAmountCandidates(text);
  if (candidates.length === 0) return { amount: null, confidence: 0 };

  // A labeled total/balance-due wins over every other figure on the page,
  // including a deposit, a subtotal, or individual line items — those are
  // real amounts in the text, just not the one that should be paid.
  const total = candidates.find((c) => c.isTotal && !c.isPartial);
  const nonPartial = candidates.filter((c) => !c.isPartial);
  const chosen = total ?? (nonPartial.length === 1 ? nonPartial[0] : null);

  // FR-11: never guess. No labeled total, and more than one candidate left
  // once deposits/subtotals are excluded — picking any one of them would be
  // a guess about which the real total is.
  if (!chosen) return { amount: null, confidence: 0 };
  if (!chosen.currency) return { amount: null, confidence: 0.2 };

  return {
    amount: { value: chosen.value.toFixed(2), currency: chosen.currency },
    confidence: 0.95,
  };
}

// --- Payment methods (FR-12) ------------------------------------------

// handle@psp — syntactic only. Lower-cased for comparison, since a VPA is
// not case-sensitive but a stray uppercase letter shouldn't create a
// separate identity from the same handle written in lowercase.
const VPA_PATTERN = /\b([\w.\-]{2,})@([a-zA-Z][\w.\-]{1,})\b/;
const IFSC_PATTERN = /\b([A-Z]{4}0[A-Z0-9]{6})\b/;
const ACCOUNT_NUMBER_PATTERN = /\b(?:a\/?c|account)(?:\s*(?:no\.?|number))?\s*:?\s*(\d{9,18})\b/i;
const BENEFICIARY_NAME_PATTERN = /\bbeneficiary(?:\s*name)?\s*:?\s*([A-Za-z][A-Za-z .]{1,60})/i;

interface PaymentMethodExtraction {
  methods: PaymentMethod[];
  confidence: number;
}

function extractPaymentMethods(text: string): PaymentMethodExtraction {
  const methods: PaymentMethod[] = [];
  let confidence = 0;

  const vpaMatch = text.match(VPA_PATTERN);
  const upi = vpaMatch && normalizePaymentMethod({ kind: "upi", vpa: `${vpaMatch[1]}@${vpaMatch[2]}` });
  if (upi?.kind === "upi") {
    methods.push(upi);
    confidence = Math.max(confidence, 0.9);
  }

  // A bank transfer needs BOTH the account number and a valid IFSC to be
  // usable at all — an account number alone, or an IFSC alone, isn't
  // enough to actually route a payment, so neither counts on its own.
  const ifscMatch = text.match(IFSC_PATTERN);
  const accountMatch = text.match(ACCOUNT_NUMBER_PATTERN);
  const beneficiaryMatch = text.match(BENEFICIARY_NAME_PATTERN);
  if (ifscMatch && accountMatch) {
    const bank = normalizePaymentMethod({
      kind: "bank_neft",
      accountNumber: accountMatch[1],
      ifsc: ifscMatch[1].toUpperCase(),
      ...(beneficiaryMatch ? { beneficiaryName: beneficiaryMatch[1].trim() } : {}),
    });
    if (bank?.kind === "bank_neft") {
      methods.push(bank);
      confidence = Math.max(confidence, 0.9);
    }
  }

  return { methods, confidence };
}

// --- Reference / invoice number ----------------------------------------

// Keep the explicit-label pattern separate and first. Combining its optional
// "number/no" token with the broad pattern lets a regex engine capture the
// word "Number" itself instead of the actual identifier in
// "Invoice Number: INV-9005".
const LABELLED_REFERENCE_PATTERN = /\b(?:invoice|inv|bill)\.?\s+(?:no\.?|number|#)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{2,20})/gi;
const REFERENCE_PATTERN = /\b(?:invoice|inv|bill)\.?\s*(?:[:#]\s*|\s+)([A-Za-z0-9][A-Za-z0-9\-\/]{2,20})/gi;

function extractReference(text: string): { value: string | null; confidence: number } {
  // Not just the first match: an earlier mention (a quoted reply, "your
  // last invoice was...", a bare "Invoice attached" subject with no code)
  // would otherwise shadow the real, current reference. The last
  // digit-containing match is the current invoice's own number far more
  // often than the first one is.
  const findLastDigitContainingReference = (pattern: RegExp): string | null => {
    let found: string | null = null;
    for (const match of text.matchAll(pattern)) {
      if (/\d/.test(match[1])) found = match[1];
    }
    return found;
  };

  const labelled = findLastDigitContainingReference(LABELLED_REFERENCE_PATTERN);
  // An explicit "Invoice Number"/"Invoice No" label is direct, structured
  // evidence from the parsed source, not a model estimate.
  if (labelled) return { value: labelled, confidence: 1 };

  const found = findLastDigitContainingReference(REFERENCE_PATTERN);
  if (found) {
    // This is no longer merely an LLM's estimate: the candidate was matched
    // directly in the source text next to an invoice label. It is still kept
    // below 1.0 because the pattern can match a quoted/replaced invoice; the
    // duplicate and payee/rail checks remain independent guards.
    return { value: found, confidence: 0.9 };
  }
  return { value: null, confidence: 0 };
}

// FR-10's fallback: "invoice number, or failing that a hash of payee +
// amount + date". Deliberately grouping/display use only, at a confidence
// below an explicit invoice number — NEVER wired into a payment
// idempotency key (FR-23 already defines that separately, keyed on
// gmail_message_id; a recurring bill with the same payee/amount/date would
// collide here on its own).
function fallbackReference(payeeName: string, amount: string, date: string): { value: string; confidence: number } {
  const hash = createHash("sha256").update(`${payeeName}|${amount}|${date}`).digest("hex").slice(0, 16);
  return { value: hash, confidence: 0.6 };
}

// --- Dates ---------------------------------------------------------------

// Deliberately no D/M/Y slash pattern — "05/09/2026" is ambiguous (5 Sept
// or May 9) and there's no way to tell which without knowing the source's
// locale. Same "never guess" principle as amount/currency: only formats
// that are unambiguous regardless of locale (a month name, or ISO
// YYYY-MM-DD) get extracted.
const DATE_PATTERNS = [
  /\b(\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4})\b/i,
  /\b(\d{4}-\d{2}-\d{2})\b/,
];

function findDateAfterLabel(text: string, label: RegExp): string | null {
  const labelMatch = text.match(label);
  if (!labelMatch) return null;
  const rest = text.slice(labelMatch.index! + labelMatch[0].length, labelMatch.index! + labelMatch[0].length + 40);
  for (const pattern of DATE_PATTERNS) {
    const m = rest.match(pattern);
    if (m) return m[1];
  }
  return null;
}

function extractDates(text: string): { issueDate: string | null; issueDateConfidence: number; dueDate: string | null; dueDateConfidence: number } {
  const dueDate = findDateAfterLabel(text, /\bdue\s*(?:date)?\s*:?/i);
  const issueDate = findDateAfterLabel(text, /\b(?:invoice\s*)?date\s*:?/i);
  return {
    issueDate,
    issueDateConfidence: issueDate ? 0.9 : 0,
    dueDate,
    dueDateConfidence: dueDate ? 0.9 : 0,
  };
}

// --- Payee name ----------------------------------------------------------

// The payee is who gets PAID — the vendor, not the debtor. "Bill To" names
// the person who owes the money (the AP agent's own owner, most of the
// time) and must never be read as the payee; only an explicit "Pay to" /
// "Payee" / "Remit to" label, or the sender's own name, identifies who the
// money actually goes to.
const PAYEE_LABEL_PATTERN = /\b(?:pay\s*to|payee|remit\s*to)\s*:?\s*([A-Za-z][A-Za-z .]{1,60})/i;

function extractPayee(text: string, fromName: string | null | undefined): { value: string | null; confidence: number } {
  const labeled = text.match(PAYEE_LABEL_PATTERN);
  if (labeled && !/@/.test(labeled[1])) {
    return { value: labeled[1].trim().replace(/\s+/g, " "), confidence: 0.9 };
  }
  // The sender is the vendor issuing the invoice in the overwhelming
  // majority of real cases — a much stronger signal than any label found
  // inside the body text itself.
  if (fromName && !/@/.test(fromName)) {
    return { value: fromName, confidence: 0.75 };
  }
  return { value: null, confidence: 0 };
}

/**
 * FR-10 through FR-13's field extraction, implemented as deterministic
 * pattern matching (same reasoning as the rule-based classifier: testable
 * without a live model call). Refuses to run at all on anything the
 * classifier didn't mark payable, or flagged as an injection attempt —
 * a safe empty result, not a thrown error, so no caller can forget to
 * handle it.
 */
export async function extractPaymentDetails(input: ExtractionInput): Promise<ExtractionResult> {
  if (input.injectionDetected || !PAYABLE_KINDS.has(input.kind)) {
    return emptyResult();
  }

  const subject = input.subject ?? "";
  const bodyText = input.bodyText ?? "";
  const text = `${subject}\n${bodyText}`;

  const payee = extractPayee(text, input.fromName);
  const { amount, confidence: amountConfidence } = extractAmount(text);
  const { methods: paymentMethods, confidence: paymentMethodConfidence } = extractPaymentMethods(text);
  const dates = extractDates(text);

  let reference = extractReference(text);
  if (!reference.value && payee.value && amount) {
    const date = dates.dueDate ?? dates.issueDate;
    if (date) reference = fallbackReference(payee.value, amount.value, date);
  }

  return {
    payeeName: payee.value,
    payeeNameConfidence: payee.confidence,
    amount,
    amountConfidence,
    referenceNumber: reference.value,
    referenceNumberConfidence: reference.confidence,
    paymentMethods,
    paymentMethodConfidence,
    issueDate: dates.issueDate,
    issueDateConfidence: dates.issueDateConfidence,
    dueDate: dates.dueDate,
    dueDateConfidence: dates.dueDateConfidence,
  };
}
