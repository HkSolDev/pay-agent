import "dotenv/config";
import { prisma } from "@perflo-ap-agent/db";
import { parseGmailPayload, toJsonSafeAttachments } from "./mime.js";
import { fetchMessageById } from "./gmail.js";

// One-time (and re-runnable) backfill: re-fetches full payloads for rows
// ingested before mime.ts existed, so bodyText/links/attachments aren't
// stuck null forever. Safe to re-run — it only updates rows still missing
// body content.
async function main() {
  const rows = await prisma.email.findMany({
    where: { bodyText: null },
    select: { id: true, gmailMessageId: true },
  });
  console.log(`Backfilling ${rows.length} rows...`);

  let done = 0;
  for (const row of rows) {
    const payload = await fetchMessageById(row.gmailMessageId);
    const content = parseGmailPayload(payload);
    await prisma.email.update({
      where: { id: row.id },
      data: {
        bodyText: content.bodyText,
        bodyHtmlHash: content.bodyHtmlHash,
        links: content.links,
        attachments: toJsonSafeAttachments(content.attachments),
      },
    });
    done++;
    console.log(`  [${done}/${rows.length}] ${row.gmailMessageId} — body: ${content.bodyText ? "yes" : "no"}, links: ${content.links.length}`);
  }

  console.log("Backfill complete.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
