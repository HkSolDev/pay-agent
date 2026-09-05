import { randomBytes } from "node:crypto";
import { Prisma, prisma } from "@perflo-ap-agent/db";
import type { ApprovePayeeDeps, ApprovePayeeRequest } from "./payee-approval.js";
// Extensionless, not `.js` — this file is reachable from app/app/payee-
// actions.ts (Next's server bundle), and a `.js`-suffixed *value* import
// breaks Turbopack there even though the target plainly exists (see
// hands-off.md's "Turbopack import-extension gotcha"). `import type`
// above stays `.js`-suffixed since type-only imports are erased before
// bundling and never hit this.
import {
  createPerfloBeneficiary,
  enableGrantViaPerfloCli,
  GRANT_APPROVAL_TIMEOUT_MS,
  PerfloDefiniteFailure,
} from "./perflo-cli";
import { encryptPaymentMethod, hashPaymentMethod, toPrismaBytes } from "./payee-crypto";
import { normalizePaymentMethod } from "./payment-method-validation";
import { expireStalePendingGrants } from "./reconcile-grant-approvals";

// The Postgres-backed implementation of ApprovePayeeDeps used by the real
// Payees UI. `createPerfloRecipient` calls the real Perflo CLI (KYC cleared
// enough to connect for real on 4 Sep — see project memory). `enablePerfloGrant`
// is now real too: it shells out to `policy enable` via perflo-cli.ts's
// spawn-based function and resolves the payee row asynchronously once that
// call settles — see approvePayee's own header comment for why this can't
// be synchronous (`policy enable` blocks on a real browser approval for up
// to ~11 minutes, confirmed live 4 Sep — see GRANT_APPROVAL_TIMEOUT_MS).

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "payee";
}

/**
 * Pure: pulls the bank rail fields `beneficiary add` needs out of an
 * already-validated request. The connected Perflo account only has the
 * bank.in.inr rail (confirmed live via `beneficiary schemas --country IN` —
 * no UPI schema yet), so a UPI-rail payee can't get a real beneficiary
 * today and must fail loudly here rather than silently faking success.
 */
export function beneficiaryFieldsFromRequest(request: ApprovePayeeRequest): { accountNumber: string; ifsc: string } {
  const normalized = normalizePaymentMethod(request.paymentMethod);
  if (!normalized) throw new Error("beneficiaryFieldsFromRequest received an already-validated but non-normalizable payment method.");
  if (normalized.kind !== "bank_neft") {
    throw new Error(
      "Perflo does not yet support UPI beneficiaries for this account (only bank/IFSC is available) — use a bank account instead.",
    );
  }
  return { accountNumber: normalized.accountNumber, ifsc: normalized.ifsc };
}

function canonicalPaymentMethod(normalized: { kind: "upi"; vpa: string } | { kind: "bank_neft"; accountNumber: string; ifsc: string }): string {
  return normalized.kind === "upi"
    ? `upi:${normalized.vpa}`
    : `bank_neft:${normalized.accountNumber}:${normalized.ifsc}`;
}

const MS_PER_DAY = 86_400_000;

// `--expires-days` needs a positive integer. An owner-chosen expiry date
// that's today or already rounds down to 0 days out still needs to send
// *something* Perflo will accept, so this floors at 1 rather than sending
// 0 or a negative count.
export function grantExpiresDays(expiresAtIso: string): number {
  const days = Math.ceil((new Date(expiresAtIso).getTime() - Date.now()) / MS_PER_DAY);
  return Math.max(1, days);
}

function isPendingGrantLockViolation(err: unknown): boolean {
  // Confirmed live against this exact schema: writing through Prisma
  // Client (not $executeRaw) surfaces a unique-index violation as
  // PrismaClientKnownRequestError with code "P2002", never a raw Postgres
  // 23505 — that raw code only ever reaches application code when a query
  // bypasses the client via $queryRaw/$executeRaw, which nothing here does.
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Resolves a payee's terminal grant outcome. A plain conditional
 * updateMany — same shape as claimPaymentIntent/expireStalePendingGrants —
 * so a late or duplicate resolution (two overlapping CLI invocations
 * somehow both completing, or a resolution racing the expiry sweep) can
 * never clobber a row that has already settled one way or another; it
 * simply matches zero rows and does nothing.
 */
export async function applyGrantOutcome(payeeId: string, outcome: "approved" | "denied"): Promise<void> {
  if (outcome === "approved") {
    await prisma.payee.updateMany({
      where: { id: payeeId, status: "pending_grant" },
      data: {
        status: "approved",
        grantApproved: true,
        approvedAt: new Date(),
        lastGrantOutcome: null,
        pendingGrantApprovalUrl: null,
      },
    });
  } else {
    await prisma.payee.updateMany({
      where: { id: payeeId, status: "pending_grant" },
      data: { status: "not_approved", lastGrantOutcome: "denied", pendingGrantApprovalUrl: null },
    });
  }
}

/**
 * Persists the approval URL the moment perflo-cli.ts's streaming parser
 * finds it, independent of the eventual outcome. Errors are logged, not
 * thrown — this runs inside enableGrantViaPerfloCli's onApproveUrl
 * callback, deep in a streaming data handler with no caller waiting to
 * catch a rejection; a failed write here shouldn't take down the CLI call
 * itself, only mean the UI shows "starting..." a little longer than ideal.
 */
export async function persistApproveUrl(payeeId: string, url: string): Promise<void> {
  try {
    await prisma.payee.update({ where: { id: payeeId }, data: { pendingGrantApprovalUrl: url } });
  } catch (err) {
    console.error(`[grant-approval] failed to persist approval URL for payee ${payeeId}:`, err);
  }
}

export const realApprovePayeeDeps: ApprovePayeeDeps = {
  async findExistingApproval(request) {
    const identity = await prisma.payeeIdentity.findUnique({
      where: { senderAddr: request.senderAddr },
      select: { payeeId: true, payee: { select: { status: true } } },
    });
    if (!identity || identity.payee.status !== "approved") return null;
    return { payeeId: identity.payeeId };
  },

  async createPerfloRecipient(request) {
    const { accountNumber, ifsc } = beneficiaryFieldsFromRequest(request);
    const nickname = `${slugify(request.name)}-${randomBytes(3).toString("hex")}`;
    await createPerfloBeneficiary({ nickname, firstName: request.firstName, lastName: request.lastName, accountNumber, ifsc });
    return { recipientNickname: nickname };
  },

  async startPendingGrant(input) {
    // Resolve any stale lock before trusting an existing pending_grant row
    // as still blocking (plan §3) — a sweep is also run periodically by the
    // worker, but running it inline here too means a payee never has to
    // wait for the next poll tick just because nobody happened to click
    // Approve on another payee in the meantime.
    await expireStalePendingGrants();

    const normalized = normalizePaymentMethod(input.paymentMethod);
    if (!normalized) throw new Error("startPendingGrant received an already-validated but non-normalizable payment method.");
    const canonical = canonicalPaymentMethod(normalized);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + GRANT_APPROVAL_TIMEOUT_MS);
    const grantFields = {
      status: "pending_grant",
      pendingGrantStartedAt: now,
      pendingGrantExpiresAt: expiresAt,
      lastGrantOutcome: null,
      pendingGrantApprovalUrl: null,
      grantPerPaymentCapInr: input.grant.perPaymentCapInr,
      grantTotalCapInr: input.grant.totalCapInr,
      grantMaxPayments: input.grant.maxPayments,
      grantExpiresAt: new Date(input.grant.expiresAt),
    };

    const existingIdentity = await prisma.payeeIdentity.findUnique({
      where: { senderAddr: input.senderAddr },
      select: { payeeId: true, payee: { select: { status: true } } },
    });

    if (existingIdentity) {
      // approvePayee's own findExistingApproval already short-circuits the
      // "approved" case before this ever runs. Any status here other than
      // "not_approved" (a prior denied/expired attempt — the one case
      // explicitly meant to be retryable, see schema.prisma's comment on
      // lastGrantOutcome) is treated as locked rather than silently
      // reused — in particular a payee that's itself already
      // pending_grant (a double-click on the same Approve button) must
      // never spawn a second CLI call for the same row.
      if (existingIdentity.payee.status !== "not_approved") {
        return { status: "locked" };
      }

      let claimed: { count: number };
      try {
        claimed = await prisma.payee.updateMany({
          where: { id: existingIdentity.payeeId, status: "not_approved" },
          data: { name: input.name, recipientNickname: input.recipientNickname, ...grantFields },
        });
      } catch (err) {
        if (isPendingGrantLockViolation(err)) return { status: "locked" };
        throw err;
      }
      // Lost a race against another retry attempt on this exact row, or
      // against the lock itself — either way, nothing was claimed.
      if (claimed.count === 0) return { status: "locked" };

      // The rail may be unchanged from the prior attempt — reuse the
      // existing active method rather than colliding with its unique
      // lookupHash by trying to create a duplicate.
      const lookupHash = hashPaymentMethod(canonical);
      const existingMethod = await prisma.payeePaymentMethod.findUnique({ where: { lookupHash } });
      if (!existingMethod) {
        await prisma.payeePaymentMethod.create({
          data: {
            payeeId: existingIdentity.payeeId,
            rail: normalized.kind,
            encryptedPayload: toPrismaBytes(encryptPaymentMethod(canonical)),
            lookupHash,
          },
        });
      }

      return { status: "started", payeeId: existingIdentity.payeeId };
    }

    try {
      const payee = await prisma.payee.create({
        data: {
          name: input.name,
          recipientNickname: input.recipientNickname,
          ...grantFields,
          identities: { create: { senderAddr: input.senderAddr } },
          paymentMethods: {
            create: {
              rail: normalized.kind,
              encryptedPayload: toPrismaBytes(encryptPaymentMethod(canonical)),
              lookupHash: hashPaymentMethod(canonical),
            },
          },
        },
      });
      return { status: "started", payeeId: payee.id };
    } catch (err) {
      if (isPendingGrantLockViolation(err)) return { status: "locked" };
      throw err;
    }
  },

  // Returns the promise it kicks off so tests can await the full
  // fire-and-forget chain deterministically (production callers ignore the
  // return value, per ApprovePayeeDeps's `void` signature — this can't
  // become a real await there without blocking the request on Perflo's own
  // ~11-minute browser-approval wait).
  enablePerfloGrant(input) {
    const expiresDays = grantExpiresDays(input.grant.expiresAt);
    return enableGrantViaPerfloCli({
      nickname: input.recipientNickname,
      perPaymentCapInr: input.grant.perPaymentCapInr,
      totalCapInr: input.grant.totalCapInr,
      maxPayments: input.grant.maxPayments,
      expiresDays,
      timeoutMs: GRANT_APPROVAL_TIMEOUT_MS,
      onApproveUrl: (url) => { void persistApproveUrl(input.payeeId, url); },
    })
      .then(() => applyGrantOutcome(input.payeeId, "approved"))
      .catch((err) => {
        if (err instanceof PerfloDefiniteFailure) return applyGrantOutcome(input.payeeId, "denied");
        // PerfloUnknownOutcomeError (our own kill timer fired) or anything
        // else unexpected — never guess success or failure. Leave the row
        // exactly as pending_grant; the expiry sweep
        // (reconcile-grant-approvals.ts) resolves it once
        // pendingGrantExpiresAt passes, the same FR-27 principle already
        // applied to payments.
        console.error(`[grant-approval] ambiguous outcome for payee ${input.payeeId}, leaving pending_grant for the expiry sweep:`, err);
        return undefined;
      })
      .catch((err) => {
        console.error(`[grant-approval] failed to persist grant outcome for payee ${input.payeeId}:`, err);
      });
  },
};
