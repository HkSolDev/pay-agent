"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@perflo-ap-agent/db";
import { approvePayee } from "../../worker/src/payee-approval";
import { realApprovePayeeDeps } from "../../worker/src/payee-approval-deps";
import { replacePaymentRail, revokePaymentRail } from "../../worker/src/payee-rail-lifecycle";
import { paymentMethodFromForm, validatePayeeForm, type PayeeFormInput } from "./payee-form-model";

// UI → server action → validation → encryption → database. None of these
// actions import perflo-cli.ts or manual-pay.ts, and none of them ever
// create a PaymentIntent — payee setup approves a rail to pay *through*,
// it never itself pays anything.

function readFormInput(formData: FormData): PayeeFormInput {
  return {
    name: String(formData.get("name") ?? "").trim(),
    senderAddr: String(formData.get("senderAddr") ?? "").trim(),
    rail: String(formData.get("rail") ?? "upi").trim() as "upi" | "bank_neft",
    vpa: String(formData.get("vpa") ?? "").trim(),
    accountNumber: String(formData.get("accountNumber") ?? "").trim(),
    ifsc: String(formData.get("ifsc") ?? "").trim(),
    perPaymentCapInr: String(formData.get("perPaymentCapInr") ?? "").trim(),
    totalCapInr: String(formData.get("totalCapInr") ?? "").trim(),
    maxPayments: String(formData.get("maxPayments") ?? "").trim(),
    expiresAt: String(formData.get("expiresAt") ?? "").trim(),
  };
}

export async function createPayeeAction(formData: FormData): Promise<void> {
  const input = readFormInput(formData);
  const ownerConfirmed = formData.get("ownerConfirmed") === "on";

  const { valid, errors } = validatePayeeForm(input);
  if (!valid) throw new Error(Object.values(errors).join(" "));

  const result = await approvePayee({
    ownerConfirmed,
    name: input.name,
    senderAddr: input.senderAddr,
    paymentMethod: paymentMethodFromForm(input),
    grant: {
      perPaymentCapInr: input.perPaymentCapInr,
      totalCapInr: input.totalCapInr,
      maxPayments: Number(input.maxPayments),
      expiresAt: input.expiresAt,
    },
  }, realApprovePayeeDeps);

  if (result.status === "confirmation_required") throw new Error("Confirm the payee approval before submitting.");
  if (result.status === "invalid_request") throw new Error("Invalid payee, rail, or grant details.");
  revalidatePath("/payees");
}

export async function replaceRailAction(formData: FormData): Promise<void> {
  const oldMethodId = String(formData.get("oldMethodId") ?? "").trim();
  const ownerConfirmed = formData.get("ownerConfirmed") === "on";
  const rail = String(formData.get("rail") ?? "upi").trim();
  const newMethod = rail === "upi"
    ? { kind: "upi" as const, vpa: String(formData.get("vpa") ?? "").trim() }
    : {
      kind: "bank_neft" as const,
      accountNumber: String(formData.get("accountNumber") ?? "").trim(),
      ifsc: String(formData.get("ifsc") ?? "").trim(),
    };

  const result = await replacePaymentRail({ oldMethodId, ownerConfirmed, newMethod });
  if (result.status === "confirmation_required") throw new Error("Confirm the rail replacement before submitting.");
  if (result.status === "invalid_method") throw new Error("The new payment rail is invalid.");
  if (result.status === "not_found") throw new Error("The original payment rail was not found.");
  revalidatePath("/payees");
}

export async function revokeRailAction(formData: FormData): Promise<void> {
  const methodId = String(formData.get("methodId") ?? "").trim();
  const ownerConfirmed = formData.get("ownerConfirmed") === "on";

  const result = await revokePaymentRail({ methodId, ownerConfirmed });
  if (result.status === "confirmation_required") throw new Error("Confirm the revoke before submitting.");
  if (result.status === "not_found") throw new Error("The payment rail was not found.");
  revalidatePath("/payees");
}

// The other half of the auto-pay gate alongside AUTO_PAY_MODE (the global
// deployment-wide switch) — this is the per-payee opt-in. Off by default;
// approving a payee never turns this on by itself (see schema.prisma).
export async function toggleAutoPayAction(formData: FormData): Promise<void> {
  const payeeId = String(formData.get("payeeId") ?? "").trim();
  if (!payeeId) throw new Error("Missing payee id.");
  const payee = await prisma.payee.findUniqueOrThrow({ where: { id: payeeId }, select: { autoPayEnabled: true } });
  await prisma.payee.update({ where: { id: payeeId }, data: { autoPayEnabled: !payee.autoPayEnabled } });
  revalidatePath("/payees");
}
