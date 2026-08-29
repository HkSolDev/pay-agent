"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@perflo-ap-agent/db";
import { requestManualPayment } from "../../worker/src/manual-pay";
import { payViaPerfloCli, PerfloUnknownOutcomeError } from "../../worker/src/perflo-cli";
import { claimPaymentIntent } from "../../worker/src/payment-claim";

export async function preparePayment(formData: FormData) {
  const emailId = String(formData.get("emailId"));
  const recipientNickname = String(formData.get("recipientNickname") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "INR");

  if (!recipientNickname || !amount) {
    throw new Error("Recipient nickname and amount are both required.");
  }

  // idempotencyKey is generated once here, at prepare time, and never
  // touched again on re-prepare — it identifies the logical payment, not
  // the attempt (same principle FR-23 uses for the real idempotency key).
  const idempotencyKey = randomBytes(16).toString("hex");
  await prisma.paymentIntent.upsert({
    where: { emailId },
    create: { emailId, recipientNickname, amount, currency, idempotencyKey },
    update: { recipientNickname, amount, currency },
  });
  revalidatePath("/");
}

// Return type must be void|Promise<void> — that's the contract a <form
// action> requires; the page re-reads state from the DB on the next render
// anyway (revalidatePath), so there's nothing useful to hand back here.
export async function confirmPayment(emailId: string, _formData: FormData): Promise<void> {
  try {
    const result = await requestManualPayment(
      { emailId, confirmedByOwner: true },
      {
        loadPayableEmail: async (id) => {
          const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { emailId: id } });
          return {
            emailId: id,
            recipientNickname: intent.recipientNickname,
            amount: intent.amount,
            currency: intent.currency,
          };
        },
        claimPayment: claimPaymentIntent,
        payRecipient: async ({ nickname, amount, currency, idempotencyKey }) =>
          payViaPerfloCli({ nickname, amount, currency, idempotencyKey }),
      },
    );

    await prisma.paymentIntent.update({
      where: { emailId },
      data: { status: "paid", paidAt: new Date(), paymentReference: result.paymentReference, lastError: null },
    });

    revalidatePath("/");
  } catch (err) {
    // FR-27: a timeout or unparseable result is NOT the same as a definite
    // "nothing happened" — the payment may already have landed at Perflo
    // before we lost the ability to confirm it. That case goes to
    // unknown_outcome and is never offered a retry button; only a clean,
    // CLI-reported failure (PerfloDefiniteFailure, or anything else clearly
    // pre-payment like a missing recipient/amount) is safe to mark "failed".
    const status = err instanceof PerfloUnknownOutcomeError ? "unknown_outcome" : "failed";
    // Store the real reason — "Not connected. Run `perflo login` first." is
    // very different from "outside grant," and the owner should see which
    // one happened, not a generic "Failed" for both (PRD FR-27 treats
    // NOT_CONNECTED/NO_SESSION/SIGNER_REVOKED as needing a clear alert).
    const lastError = err instanceof Error ? err.message : String(err);
    await prisma.paymentIntent.updateMany({
      where: { emailId, status: "claimed" },
      data: { status, lastError },
    });
    revalidatePath("/");
    throw err;
  }
}
