import type { PaymentMethod } from "./payee-resolver.js";
import { validatePaymentMethod } from "./payment-method-validation.js";

export interface GrantRequest {
  perPaymentCapInr: string;
  totalCapInr: string;
  maxPayments: number;
  expiresAt: string;
}

export interface ApprovePayeeRequest {
  ownerConfirmed: boolean;
  name: string;
  senderAddr: string;
  paymentMethod: PaymentMethod;
  grant: GrantRequest;
}

export interface ApprovePayeeDeps {
  findExistingApproval: (request: ApprovePayeeRequest) => Promise<{ payeeId: string } | null>;
  createPerfloRecipient: (request: ApprovePayeeRequest) => Promise<{ recipientNickname: string }>;
  enablePerfloGrant: (input: { recipientNickname: string; grant: GrantRequest }) => Promise<{ grantId: string }>;
  saveApprovedPayee: (input: ApprovePayeeRequest & { recipientNickname: string; grantId: string }) => Promise<{ payeeId: string; created: boolean }>;
}

function validPositiveMoney(value: string): boolean {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

function validPaymentMethod(method: PaymentMethod): boolean {
  return validatePaymentMethod(method);
}

function validRequest(request: ApprovePayeeRequest): boolean {
  return request.name.trim() !== "" && /^[^@\s]+@[^@\s]+$/.test(request.senderAddr)
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
 */
export async function approvePayee(request: ApprovePayeeRequest, deps: ApprovePayeeDeps): Promise<
  { status: "confirmation_required" | "invalid_request" }
  | { status: "already_approved"; payeeId: string }
  | { status: "approved"; payeeId: string; grantId: string }
> {
  if (!request.ownerConfirmed) return { status: "confirmation_required" };
  if (!validRequest(request)) return { status: "invalid_request" };
  const existing = await deps.findExistingApproval(request);
  if (existing) return { status: "already_approved", payeeId: existing.payeeId };

  const recipient = await deps.createPerfloRecipient(request);
  const grant = await deps.enablePerfloGrant({ recipientNickname: recipient.recipientNickname, grant: request.grant });
  const saved = await deps.saveApprovedPayee({ ...request, recipientNickname: recipient.recipientNickname, grantId: grant.grantId });
  return { status: "approved", payeeId: saved.payeeId, grantId: grant.grantId };
}
