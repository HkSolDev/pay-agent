import { prisma } from "@perflo-ap-agent/db";

const CHECKPOINT_ID = 1;

/**
 * Just the "Paused" flag, split out from sync.ts on purpose: this file must
 * stay free of any Gmail/Composio import so the Next.js app can import it
 * directly into a Server Action without pulling that SDK into the app's
 * bundle (see syncNowAction in app/app/actions.ts for why that matters).
 */
export async function isSyncPaused(): Promise<boolean> {
  const row = await prisma.ingestCheckpoint.findUnique({ where: { id: CHECKPOINT_ID } });
  return row?.paused ?? false;
}

export async function setSyncPaused(paused: boolean): Promise<void> {
  await prisma.ingestCheckpoint.upsert({
    where: { id: CHECKPOINT_ID },
    create: { id: CHECKPOINT_ID, sinceEpochSeconds: Math.floor(Date.now() / 1000), paused },
    update: { paused },
  });
}
