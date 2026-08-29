import { prisma } from "@perflo-ap-agent/db";

export interface ClaimedIntent {
  intentId: string;
  idempotencyKey: string;
  recipientNickname: string;
  amount: string;
  currency: string;
}

/**
 * Atomic claim via a conditional UPDATE: only succeeds while status is
 * "pending" (first attempt) or "failed" (owner-initiated retry after a
 * definite, safe-to-retry failure). A concurrent second claim attempt
 * updates 0 rows, gets null back, and backs off — same guarantee FR-24's
 * row lock gives a real queue, expressed as a single-row transition since
 * Level 0 has exactly one payable row per email, not a queue to drain.
 * "claimed", "paid", and "unknown_outcome" are deliberately excluded — the
 * last one is the one FR-27 says must never be retried automatically.
 *
 * Extracted out of the server action specifically so this — the exact logic
 * a prior review caught a real bug in (a "failed" row could never be
 * re-claimed, making the visible "Retry" button a dead end) — is testable
 * against real Postgres, not just eyeballed.
 */
export async function claimPaymentIntent(emailId: string): Promise<ClaimedIntent | null> {
  const claimed = await prisma.paymentIntent.updateMany({
    where: { emailId, status: { in: ["pending", "failed"] } },
    data: { status: "claimed", claimedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId } });
  return {
    intentId: intent.id,
    idempotencyKey: intent.idempotencyKey,
    recipientNickname: intent.recipientNickname,
    amount: intent.amount,
    currency: intent.currency,
  };
}
