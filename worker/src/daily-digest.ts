import { prisma } from "@perflo-ap-agent/db";
import { sendEmail, type EmailMessage } from "./gmail.js";

const DEFAULT_DIGEST_HOUR = 9;

export interface DigestState {
  digestHour: number;
  lastDigestSentAt: Date | null;
}

export interface DigestLine {
  description: string;
  occurredAt: string;
}

export interface DailyDigest {
  paid: DigestLine[];
  waiting: DigestLine[];
  rejected: DigestLine[];
  x402SpendMinor: number;
  x402CallCount: number;
}

export interface DailyDigestDeps {
  ownerEmail: string | undefined;
  loadState: () => Promise<DigestState>;
  collect: (since: Date) => Promise<DailyDigest>;
  claimDigest: (now: Date, lastDigestSentAt: Date | null) => Promise<boolean>;
  sendEmail: (message: EmailMessage) => Promise<void>;
}

const defaultDeps: DailyDigestDeps = {
  ownerEmail: process.env.OWNER_EMAIL,
  loadState: async () => {
    const row = await prisma.ingestCheckpoint.findUnique({
      where: { id: 1 },
      select: { digestHour: true, lastDigestSentAt: true },
    });
    return {
      digestHour: row?.digestHour ?? DEFAULT_DIGEST_HOUR,
      lastDigestSentAt: row?.lastDigestSentAt ?? null,
    };
  },
  collect: async (since) => {
    const [paid, waiting, rejected, x402] = await Promise.all([
      prisma.paymentIntent.findMany({
        where: { status: "paid", paidAt: { gte: since } },
        select: { recipientNickname: true, amount: true, currency: true, paidAt: true },
        orderBy: { paidAt: "asc" },
      }),
      prisma.email.findMany({
        where: {
          policyDecision: "needs_approval",
          reviewStatus: { not: "rejected" },
          level1ProcessedAt: { gte: since },
        },
        select: { subject: true, fromAddr: true, level1ProcessedAt: true },
        orderBy: { level1ProcessedAt: "asc" },
      }),
      prisma.email.findMany({
        where: { reviewStatus: "rejected", reviewedAt: { gte: since } },
        select: { subject: true, fromAddr: true, reviewedAt: true },
        orderBy: { reviewedAt: "asc" },
      }),
      prisma.x402Spend.findMany({
        where: { createdAt: { gte: since } },
        select: { costMinor: true, createdAt: true },
      }),
    ]);
    return {
      paid: paid.map((row) => ({ description: `${row.recipientNickname} · ${row.currency} ${row.amount}`, occurredAt: (row.paidAt ?? new Date()).toISOString() })),
      waiting: waiting.map((row) => ({ description: `${row.subject ?? "Untitled invoice"} from ${row.fromAddr}`, occurredAt: (row.level1ProcessedAt ?? new Date()).toISOString() })),
      rejected: rejected.map((row) => ({ description: `${row.subject ?? "Untitled invoice"} from ${row.fromAddr}`, occurredAt: (row.reviewedAt ?? new Date()).toISOString() })),
      x402SpendMinor: x402.reduce((sum, row) => sum + row.costMinor, 0),
      x402CallCount: x402.length,
    };
  },
  claimDigest: async (now, lastDigestSentAt) => {
    await prisma.ingestCheckpoint.upsert({
      where: { id: 1 },
      create: { id: 1, sinceEpochSeconds: Math.floor(now.getTime() / 1000), digestHour: DEFAULT_DIGEST_HOUR },
      update: {},
    });
    const result = await prisma.ingestCheckpoint.updateMany({
      where: { id: 1, lastDigestSentAt },
      data: { lastDigestSentAt: now },
    });
    return result.count === 1;
  },
  sendEmail,
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

function renderSection(title: string, lines: DigestLine[]): string {
  return `${title}: ${lines.length}\n${lines.map((line) => `- ${line.description}`).join("\n") || "- None"}`;
}

function renderDigestMessage(ownerEmail: string, now: Date, digest: DailyDigest): EmailMessage {
  const x402 = `$${(digest.x402SpendMinor / 100).toFixed(2)} across ${digest.x402CallCount} checks`;
  const text = [
    `Perflo AP daily digest · ${now.toISOString().slice(0, 10)}`,
    "",
    renderSection("Paid", digest.paid),
    "",
    renderSection("Waiting", digest.waiting),
    "",
    renderSection("Rejected", digest.rejected),
    "",
    `x402 spend: ${x402}`,
  ].join("\n");
  const html = `<h2>Perflo AP daily digest · ${now.toISOString().slice(0, 10)}</h2>${[
    ["Paid", digest.paid],
    ["Waiting", digest.waiting],
    ["Rejected", digest.rejected],
  ].map(([title, lines]) => `<h3>${title}</h3><ul>${(lines as DigestLine[]).map((line) => `<li>${escapeHtml(line.description)}</li>`).join("") || "<li>None</li>"}</ul>`).join("")}<p>x402 spend: ${escapeHtml(x402)}</p>`;
  return { to: ownerEmail, subject: `Perflo AP daily digest · ${now.toISOString().slice(0, 10)}`, text, html };
}

/** Sends one digest during the configured local hour, guarded by a database claim. */
export async function sendDailyDigest(now: Date = new Date(), deps: DailyDigestDeps = defaultDeps): Promise<boolean> {
  if (!deps.ownerEmail) return false;
  const state = await deps.loadState();
  if (now.getHours() !== state.digestHour) return false;
  if (state.lastDigestSentAt && state.lastDigestSentAt.toDateString() === now.toDateString()) return false;
  const digest = await deps.collect(state.lastDigestSentAt ?? new Date(0));
  if (!await deps.claimDigest(now, state.lastDigestSentAt)) return false;
  await deps.sendEmail(renderDigestMessage(deps.ownerEmail, now, digest));
  return true;
}
