import { prisma } from "@perflo-ap-agent/db";
// Extensionless, not `.js` — this file is reachable from app/app/actions.ts
// (Next's server bundle), and a `.js`-suffixed *value* import breaks
// Turbopack there even though the target plainly exists (see hands-off.md's
// "Turbopack import-extension gotcha", also worked around in
// payee-approval-deps.ts for the same reason).
import { loadPerfloCredentials } from "./perflo-secret-store";
import { PerfloCliX402Client } from "./x402-cli-client";
import { PerfloX402Client, runPaidVerifierChecks, type PaidVerifierDeps, type PaidVerifierInput, type PaidVerifierResult } from "./x402-verifier";
import { recordX402Spend } from "./x402-spend-store";
import type { VerificationResult } from "./verifier";

interface StoredPerfloCredentials {
  agentToken: string;
  mandateId: string;
}

export interface PaidVerifierRuntimeDeps {
  loadCredentials: () => Promise<StoredPerfloCredentials>;
  createPurchase: (credentials?: StoredPerfloCredentials) => PaidVerifierDeps["purchase"];
  recordSpend: PaidVerifierDeps["recordSpend"];
}

type X402Transport = "cli" | "rest";

function configuredTransport(): X402Transport {
  const transport = process.env.X402_TRANSPORT ?? "cli";
  if (transport !== "cli" && transport !== "rest") throw new Error("X402_TRANSPORT must be cli or rest.");
  return transport;
}

const defaultRuntimeDeps: PaidVerifierRuntimeDeps = {
  loadCredentials: () => loadPerfloCredentials<StoredPerfloCredentials>(process.env.PERFLO_CREDENTIALS_FILE ?? ".perflo/ap-agent.credentials.enc"),
  createPurchase: (credentials) => {
    if (configuredTransport() === "cli") {
      const client = new PerfloCliX402Client();
      return client.purchase.bind(client);
    }
    if (!credentials) throw new Error("REST x402 credentials are required when X402_TRANSPORT=rest.");
    const client = new PerfloX402Client({ token: credentials.agentToken, mandateId: credentials.mandateId });
    return client.purchase.bind(client);
  },
  recordSpend: recordX402Spend,
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function linksFromJson(value: unknown): PaidVerifierInput["links"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const link = object(item);
    if (typeof link.href !== "string") return [];
    let finalDomain = "";
    try { finalDomain = new URL(link.href).hostname; } catch { /* invalid links remain visible as unverified evidence */ }
    return [{ href: link.href, finalDomain, visibleText: typeof link.text === "string" ? link.text : "" }];
  });
}

function existingPaidChecks(value: unknown): PaidVerifierResult | null {
  const paidChecks = object(object(value).paidChecks);
  if (paidChecks && (paidChecks.status === "verified" || paidChecks.status === "unverified") && Array.isArray(paidChecks.checks)) {
    return paidChecks as unknown as PaidVerifierResult;
  }
  return null;
}

function existingVerification(value: unknown): VerificationResult {
  const verification = object(value);
  return {
    authPassed: verification.authPassed === true,
    hardFails: Array.isArray(verification.hardFails) ? verification.hardFails.filter((item): item is string => typeof item === "string") : [],
    softFlags: Array.isArray(verification.softFlags) ? verification.softFlags.filter((item): item is string => typeof item === "string") : [],
    score: typeof verification.score === "number" ? verification.score : 0,
    ...(verification.unverified === true ? { unverified: true } : {}),
    ...(verification.paidChecks ? { paidChecks: verification.paidChecks as VerificationResult["paidChecks"] } : {}),
  };
}

export async function runConfiguredPaidVerifier(
  input: PaidVerifierInput,
  deps: PaidVerifierRuntimeDeps = defaultRuntimeDeps,
): Promise<PaidVerifierResult> {
  const transport = configuredTransport();
  let credentials: StoredPerfloCredentials | undefined;
  if (transport === "rest") {
    try {
      credentials = await deps.loadCredentials();
      if (!credentials.agentToken || !credentials.mandateId) throw new Error("stored credentials are incomplete");
    } catch {
      return {
        status: "unverified",
        checks: [],
        unverifiedReason: "Perflo paid verifier setup is unavailable; complete the human device-auth/mandate setup before paid checks can be verified.",
      };
    }
  }

  return runPaidVerifierChecks(input, {
    purchase: deps.createPurchase(credentials),
    recordSpend: deps.recordSpend,
  });
}

/**
 * Runs paid checks for a stored queue item at an allowed trigger: owner-open,
 * prepare, confirm, or the auto-pay executor. Normal ingest never calls this.
 * Existing evidence is reused so one invoice cannot spend repeatedly merely
 * because the owner opened its drawer and then prepared it.
 */
export async function runPaidVerifierForEmail(emailId: string): Promise<{ paid: PaidVerifierResult; verification: VerificationResult }> {
  const row = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    select: { classification: true, fromAddr: true, links: true, verificationResult: true, policyReasons: true },
  });

  const priorPaid = existingPaidChecks(row.verificationResult);
  if (priorPaid) return { paid: priorPaid, verification: existingVerification(row.verificationResult) };

  const verification = existingVerification(row.verificationResult);
  if (!['invoice', 'payment_request', 'reminder'].includes(row.classification ?? "")) {
    return { paid: { status: "verified", checks: [] }, verification };
  }

  const approvedIdentities = await prisma.payeeIdentity.findMany({
    where: { payee: { grantApproved: true } },
    select: { senderAddr: true },
  });
  const knownSenderAddrs = approvedIdentities.map((identity) => identity.senderAddr);

  const paid = await runConfiguredPaidVerifier({
    emailId,
    fromAddr: row.fromAddr,
    links: linksFromJson(row.links),
    isNewPayee: !knownSenderAddrs.some((senderAddr) => senderAddr.toLowerCase() === row.fromAddr.toLowerCase()),
    amountAboveOwnerThreshold: false,
  });
  const updatedVerification = {
    ...object(row.verificationResult),
    unverified: paid.status === "unverified",
    paidChecks: paid,
  } as VerificationResult;

  await prisma.email.update({
    where: { id: emailId },
    data: {
      verificationResult: JSON.parse(JSON.stringify(updatedVerification)),
      ...(paid.status === "unverified"
        ? { policyDecision: "needs_approval", policyReasons: [...new Set([...row.policyReasons, "Paid verifier checks are unverified."])] }
        : {}),
    },
  });
  return { paid, verification: updatedVerification };
}
