import { sendEmail, type EmailMessage } from "./gmail.js";

export interface NotificationDeps {
  ownerEmail: string | undefined;
  sendEmail: (message: EmailMessage) => Promise<void>;
}

export interface NewPayeeApprovalNotification {
  approvalUrl: string;
  payeeName: string;
  amount: { value: string; currency: string } | null;
  subject: string | null;
  fromAddr: string;
  evidenceSummary: string;
}

export interface QuarantineNotification {
  reviewUrl: string;
  fromAddr: string;
  subject: string | null;
  reasons: string[];
}

const defaultDeps: NotificationDeps = { ownerEmail: process.env.OWNER_EMAIL, sendEmail };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

function approvalSubject(input: NewPayeeApprovalNotification): string {
  const amount = input.amount ? `${input.amount.currency} ${input.amount.value}` : "payment";
  const invoice = input.subject ? ` (${input.subject})` : "";
  return `Approve payment: ${amount} to ${input.payeeName}${invoice}`;
}

/** Sends the owner one review link; payment details and rail secrets stay out of the message. */
export async function sendNewPayeeApprovalEmail(
  input: NewPayeeApprovalNotification,
  deps: NotificationDeps = defaultDeps,
): Promise<boolean> {
  if (!deps.ownerEmail) return false;
  const subject = approvalSubject(input);
  await deps.sendEmail({
    to: deps.ownerEmail,
    subject,
    text: [
      subject,
      "",
      `From: ${input.fromAddr}`,
      `Evidence: ${input.evidenceSummary}`,
      "",
      `Review and approve: ${input.approvalUrl}`,
      "",
      "The review page is the only place to approve this payment.",
    ].join("\n"),
    html: `<h2>${escapeHtml(subject)}</h2><p>From: ${escapeHtml(input.fromAddr)}</p><p>Evidence: ${escapeHtml(input.evidenceSummary)}</p><p><a href="${escapeHtml(input.approvalUrl)}">Review and approve</a></p><p>The review page is the only place to approve this payment.</p>`,
  });
  return true;
}

/** Sends the owner an immediate alert when a message is quarantined. */
export async function sendQuarantineAlert(
  input: QuarantineNotification,
  deps: NotificationDeps = defaultDeps,
): Promise<boolean> {
  if (!deps.ownerEmail) return false;
  const subject = `Security alert: quarantined invoice from ${input.fromAddr}`;
  const reasons = input.reasons.length > 0 ? input.reasons.map((reason) => `- ${reason}`).join("\n") : "- No reason recorded";
  await deps.sendEmail({
    to: deps.ownerEmail,
    subject,
    text: [subject, "", `Subject: ${input.subject ?? "(none)"}`, `From: ${input.fromAddr}`, "Reasons:", reasons, "", `Review: ${input.reviewUrl}`].join("\n"),
    html: `<h2>${escapeHtml(subject)}</h2><p>Subject: ${escapeHtml(input.subject ?? "(none)")}</p><p>From: ${escapeHtml(input.fromAddr)}</p><p>Reasons:</p><ul>${input.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>No reason recorded</li>"}</ul><p><a href="${escapeHtml(input.reviewUrl)}">Review quarantine</a></p>`,
  });
  return true;
}
