import { prisma } from "@perflo-ap-agent/db";
import { sendEmail, type EmailMessage } from "./gmail.js";

const GRANT_EXPIRY_WARNING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface ExpiringPayee {
  id: string;
  name: string;
  grantExpiresAt: Date;
}

export interface GrantExpiryWarningDeps {
  ownerEmail: string | undefined;
  findExpiringPayees: (now: Date, deadline: Date) => Promise<ExpiringPayee[]>;
  claimWarning: (payeeId: string, now: Date) => Promise<boolean>;
  sendEmail: (message: EmailMessage) => Promise<void>;
}

const defaultDeps: GrantExpiryWarningDeps = {
  ownerEmail: process.env.OWNER_EMAIL,
  findExpiringPayees: async (now, deadline) => prisma.payee.findMany({
    where: {
      grantApproved: true,
      status: "approved",
      grantExpiresAt: { gt: now, lte: deadline },
      grantExpiryWarningSentAt: null,
    },
    select: { id: true, name: true, grantExpiresAt: true },
  }) as Promise<ExpiringPayee[]>,
  claimWarning: async (payeeId, now) => {
    const result = await prisma.payee.updateMany({
      where: {
        id: payeeId,
        grantApproved: true,
        status: "approved",
        grantExpiryWarningSentAt: null,
      },
      data: { grantExpiryWarningSentAt: now },
    });
    return result.count === 1;
  },
  sendEmail,
};

function warningMessage(ownerEmail: string, payee: ExpiringPayee): EmailMessage {
  const expires = payee.grantExpiresAt.toISOString();
  return {
    to: ownerEmail,
    subject: `Grant expiring soon: ${payee.name}`,
    text: `The payment grant for ${payee.name} expires on ${expires}. Review the payee before the grant expires.`,
    html: `<p>The payment grant for <strong>${payee.name}</strong> expires on ${expires}.</p><p>Review the payee before the grant expires.</p>`,
  };
}

/** Warns once per approved payee whose active grant expires within seven days. */
export async function warnAboutExpiringGrants(
  now: Date = new Date(),
  deps: GrantExpiryWarningDeps = defaultDeps,
): Promise<number> {
  if (!deps.ownerEmail) return 0;
  const deadline = new Date(now.getTime() + GRANT_EXPIRY_WARNING_WINDOW_MS);
  let warned = 0;
  for (const payee of await deps.findExpiringPayees(now, deadline)) {
    if (!await deps.claimWarning(payee.id, now)) continue;
    await deps.sendEmail(warningMessage(deps.ownerEmail, payee));
    warned += 1;
  }
  return warned;
}
