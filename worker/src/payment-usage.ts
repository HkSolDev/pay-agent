import { prisma } from "@perflo-ap-agent/db";
import type { PayeeUsage } from "./auto-pay-eligibility.js";

/** How much of a payee's total-cap/max-payments grant is already spent, counting only payments that actually landed. */
export async function loadPayeeUsage(recipientNickname: string): Promise<PayeeUsage> {
  const paid = await prisma.paymentIntent.findMany({
    where: { recipientNickname, status: "paid" },
    select: { amount: true },
  });
  return {
    totalPaidInr: paid.reduce((sum, row) => sum + Number(row.amount), 0),
    paidCount: paid.length,
  };
}
