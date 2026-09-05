import { createHash } from "node:crypto";
import { prisma } from "@perflo-ap-agent/db";
import type { X402SpendRecord } from "./x402-verifier.js";

export async function recordX402Spend(record: X402SpendRecord): Promise<void> {
  await prisma.$transaction([
    prisma.x402Spend.create({
      data: {
        emailId: record.emailId,
        tool: record.tool,
        costMinor: record.costMinor,
        settlementStatus: record.settlementStatus,
        txHash: record.txHash,
        resultHash: record.resultHash ? createHash("sha256").update(record.resultHash).digest("hex") : null,
      },
    }),
    prisma.email.update({ where: { id: record.emailId }, data: { x402SpentMinor: { increment: record.costMinor } } }),
  ]);
}
