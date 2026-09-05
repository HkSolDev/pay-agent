import type { PaymentMethod } from "./payee-resolver.js";
import { validatePaymentMethod } from "./payment-method-validation";

export interface GrantRequest {
  perPaymentCapInr: string;
  totalCapInr: string;
  maxPayments: number;
  expiresAt: string;
}

export interface ApprovePayeeRequest {
  ownerConfirmed: boolean;
  name: string;
  // The Perflo beneficiary's legal first/last name — kept separate from
  // `name` (the display/lookup field used elsewhere) because splitting a
  // free-text name on whitespace breaks on real names ("Mohammad Ali Khan",
  // single-word names). Perflo's bank.in.inr schema requires both.
  firstName: string;
  lastName: string;
  senderAddr: string;
  paymentMethod: PaymentMethod;
  grant: GrantRequest;
  useExistingBeneficiary?: boolean;
  recipientNickname?: string;
}

export interface ApprovePayeeDeps {
  findExistingApproval: (request: ApprovePayeeRequest) => Promise<{ payeeId: string } | null>;
  createPerfloRecipient: (request: ApprovePayeeRequest) => Promise<{ recipientNickname: string }>;
  // Atomically claims the one-pending-grant-at-a-time lock and persists the
  // payee row in "pending_grant" state — or reports the lock is already
  // held by another payee's in-flight approval. See payee-approval-deps.ts
  // for how the lock itself is enforced (a database-level constraint, not
  // an application check-then-write).
  startPendingGrant: (input: ApprovePayeeRequest & { recipientNickname: string }) => Promise<
    | { status: "started"; payeeId: string; recipientNickname?: string }
    | { status: "locked" }
  >;
  // Fires the real `policy enable` CLI call. Deliberately not awaited by
  // approvePayee (see below) — `policy enable` blocks on a real browser
  // approval for up to ~11 minutes, far too long to hold an HTTP request
  // open. This resolves the payee row itself (to "approved" or
  // "not_approved") on its own time, asynchronously, once the CLI exits.
  enablePerfloGrant: (input: { payeeId: string; recipientNickname: string; grant: GrantRequest }) => void;
}

function validPositiveMoney(value: string): boolean {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

function validPaymentMethod(method: PaymentMethod): boolean {
  return validatePaymentMethod(method);
}

function validRequest(request: ApprovePayeeRequest): boolean {
  if (request.useExistingBeneficiary && (!request.recipientNickname || request.recipientNickname.trim() === "")) {
    return false;
  }
  return request.name.trim() !== "" && request.firstName.trim() !== "" && request.lastName.trim() !== ""
    && /^[^@\s]+@[^@\s]+$/.test(request.senderAddr)
    && validPaymentMethod(request.paymentMethod)
    && validPositiveMoney(request.grant.perPaymentCapInr)
    && validPositiveMoney(request.grant.totalCapInr)
    && Number.isInteger(request.grant.maxPayments) && request.grant.maxPayments > 0
    && !Number.isNaN(Date.parse(request.grant.expiresAt));
}

/**
 * Owner approval is the only path that can create a recipient/grant mapping.
 * Existing approval is checked before external calls, preventing a reload or
 * double-click from creating a second Perflo recipient or grant.
 *
 * Two-phase, not synchronous end-to-end: `policy enable` blocks on a real
 * browser approval that can take minutes, so this function only ever starts
 * that process and returns — it never itself returns "approved" any more.
 * The eventual approved/denied/expired outcome is written directly to the
 * payee row by `enablePerfloGrant`'s own async continuation (or the expiry
 * sweep), not through this function's return value.
 */
export async function approvePayee(request: ApprovePayeeRequest, deps: ApprovePayeeDeps): Promise<
  { status: "confirmation_required" | "invalid_request" }
  | { status: "already_approved"; payeeId: string }
  | { status: "grant_in_progress" }
  | { status: "pending_grant"; payeeId: string }
> {
  if (!request.ownerConfirmed) return { status: "confirmation_required" };
  if (!validRequest(request)) return { status: "invalid_request" };
  const existing = await deps.findExistingApproval(request);
  if (existing) return { status: "already_approved", payeeId: existing.payeeId };

  let recipientNickname: string;
  if (request.useExistingBeneficiary && request.recipientNickname) {
    recipientNickname = request.recipientNickname.trim();
  } else {
    const recipient = await deps.createPerfloRecipient(request);
    recipientNickname = recipient.recipientNickname;
  }

  const started = await deps.startPendingGrant({ ...request, recipientNickname });
  if (started.status === "locked") return { status: "grant_in_progress" };

  const effectiveNickname = started.recipientNickname ?? recipientNickname;
  deps.enablePerfloGrant({ payeeId: started.payeeId, recipientNickname: effectiveNickname, grant: request.grant });
  return { status: "pending_grant", payeeId: started.payeeId };
}
