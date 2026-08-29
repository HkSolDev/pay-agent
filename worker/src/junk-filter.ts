export interface JunkCheckInput {
  headers: Record<string, string>;
  subject: string;
  bodyText: string;
  hasAttachments?: boolean;
  isCalendarInvite?: boolean;
}

const INR_AMOUNT_PATTERN = /₹\s*[\d,]+(?:\.\d+)?(?:\s*k)?|(?:Rs\.?|INR)\s*[\d,]+(?:\.\d+)?(?:\s*k)?|[\d,]+(?:\.\d+)?\s*INR\b/i;
const CONTEXTUAL_AMOUNT_PATTERN = /\b(?:pay|payment|amount\s+due|invoice\s+(?:amount|total|due))\s*(?:is|:|of|for)?\s*₹?\s*[\d,]+(?:\.\d+)?\b/i;

// FR-7 lists these by name: "payment received" confirmations are already
// settled, never a new payable — the phrase itself is the signal, same as
// the PRD's own wording, not conditioned on money being absent (a receipt
// legitimately restates the amount that was already paid).
const RECEIPT_PATTERN = /payment\s+(?:has\s+been\s+|was\s+)?received|thank\s+you\s+for\s+your\s+payment|receipt\s+for\s+your\s+(?:payment|order)/i;

/**
 * FR-7: the cheap code pass, no LLM involved.
 * - Calendar invites and "payment received" receipts are junk on their own
 *   terms — no List-Unsubscribe or money check needed for either.
 * - A newsletter (has List-Unsubscribe) that never mentions money is safe
 *   to drop before it costs an LLM call. Missing List-Unsubscribe never
 *   triggers this branch on its own — ordinary correspondence has no
 *   unsubscribe header either, and isn't junk just for lacking an amount.
 */
export function shouldIgnoreInitialJunk(input: JunkCheckInput): boolean {
  if (input.isCalendarInvite) return true;

  const text = `${input.subject}\n${input.bodyText}`;
  // Gated on the *contextual* pattern only (a fresh "pay X" / "amount due X"
  // request), not on bare presence of a rupee figure — a genuine receipt
  // legitimately restates the amount already paid, so requiring "no money
  // mentioned" would break real receipts. What must be absent is a NEW ask.
  if (RECEIPT_PATTERN.test(text) && !CONTEXTUAL_AMOUNT_PATTERN.test(text)) return true;

  const hasListUnsubscribe = Object.keys(input.headers).some(
    (name) => name.toLowerCase() === "list-unsubscribe",
  );
  if (!hasListUnsubscribe) return false;
  if (input.hasAttachments) return false;

  return !INR_AMOUNT_PATTERN.test(text) && !CONTEXTUAL_AMOUNT_PATTERN.test(text);
}
