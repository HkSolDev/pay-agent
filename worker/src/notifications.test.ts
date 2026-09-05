import { describe, expect, it, vi } from "vitest";
import { sendNewPayeeApprovalEmail, sendQuarantineAlert, type NotificationDeps } from "./notifications.js";

function deps(): NotificationDeps {
  return { ownerEmail: "owner@example.com", sendEmail: vi.fn(async () => undefined) };
}

describe("owner notifications", () => {
  it("sends a new-payee approval email with one review link and evidence summary", async () => {
    const d = deps();

    await sendNewPayeeApprovalEmail({
      approvalUrl: "https://app.example.com/?email=email-1",
      payeeName: "Riya Sharma",
      amount: { value: "500", currency: "INR" },
      subject: "Invoice 0042",
      fromAddr: "billing@riya.example",
      evidenceSummary: "Authentication passed; first seen sender; no links found.",
    }, d);

    expect(d.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "owner@example.com",
      subject: "Approve payment: INR 500 to Riya Sharma (Invoice 0042)",
      text: expect.stringContaining("https://app.example.com/?email=email-1"),
    }));
    const message = vi.mocked(d.sendEmail).mock.calls[0][0];
    expect(message.text.match(/https:\/\/app\.example\.com\/\?email=email-1/g)).toHaveLength(1);
  });

  it("sends an immediate quarantine alert with the review link and reasons", async () => {
    const d = deps();

    await sendQuarantineAlert({
      reviewUrl: "https://app.example.com/?email=email-2",
      fromAddr: "attacker@example.net",
      subject: "Urgent payment",
      reasons: ["Prompt-injection attempt detected."],
    }, d);

    expect(d.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "owner@example.com",
      subject: "Security alert: quarantined invoice from attacker@example.net",
      text: expect.stringContaining("Prompt-injection attempt detected."),
    }));
  });

  it("does not claim a notification when no owner address is configured", async () => {
    const sendEmail = vi.fn(async () => undefined);

    expect(await sendQuarantineAlert({ reviewUrl: "https://app.example.com/?email=email-3", fromAddr: "attacker@example.net", subject: null, reasons: [] }, {
      ownerEmail: undefined,
      sendEmail,
    })).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
