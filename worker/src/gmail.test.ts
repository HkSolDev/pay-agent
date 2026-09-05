import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const create = vi.fn(async () => ({ execute }));

vi.mock("@composio/core", () => ({
  Composio: class {
    create = create;
  },
}));

const { sendEmail } = await import("./gmail.js");

describe("sendEmail", () => {
  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue({ successful: true });
  });

  it("sends plain text and HTML through the connected Gmail session", async () => {
    await sendEmail({
      to: "owner@example.com",
      subject: "Invoice needs approval",
      text: "Review invoice 0042.",
      html: "<p>Review invoice 0042.</p>",
    });

    expect(execute).toHaveBeenCalledWith("GMAIL_SEND_EMAIL", {
      recipient_email: "owner@example.com",
      subject: "Invoice needs approval",
      body: "<p>Review invoice 0042.</p>",
      is_html: true,
    });
  });

  it("surfaces a failed Gmail send", async () => {
    execute.mockResolvedValue({ successful: false, error: "Gmail rejected the message" });

    await expect(sendEmail({
      to: "owner@example.com",
      subject: "Alert",
      text: "Something needs attention.",
    })).rejects.toThrow("Gmail rejected the message");
  });
});
