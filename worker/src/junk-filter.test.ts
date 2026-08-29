import { describe, expect, it } from "vitest";
import { shouldIgnoreInitialJunk } from "./junk-filter.js";

describe("initial junk filter (FR-7 cheap code pass)", () => {
  // Safety contract for implementers:
  // Return true only for clearly non-payable newsletters. A false positive
  // could hide an invoice, so uncertain messages must continue to the queue.
  it("ignores a newsletter with List-Unsubscribe and no money amount", () => {
    expect(shouldIgnoreInitialJunk({
      headers: { "List-Unsubscribe": "<https://news.example/unsubscribe>" },
      subject: "August product news",
      bodyText: "Read our latest company updates.",
    })).toBe(true);
  });

  it("does not ignore a newsletter-looking email that asks for INR payment", () => {
    expect(shouldIgnoreInitialJunk({
      headers: { "List-Unsubscribe": "<https://vendor.example/unsubscribe>" },
      subject: "Invoice INV-42",
      bodyText: "Please pay ₹5,000 by 5 September.",
    })).toBe(false);
  });

  it("recognizes common INR amount forms", () => {
    for (const amount of ["₹500", "₹ 500.50", "Rs. 500", "Rs 5k", "INR 500", "500 INR", "₹5,00,000"]) {
      expect(shouldIgnoreInitialJunk({
        headers: { "List-Unsubscribe": "<https://vendor.example/unsubscribe>" },
        subject: "Payment request",
        bodyText: `Amount due: ${amount}`,
      })).toBe(false);
    }
  });

  it("does not discard ordinary no-money email solely because it lacks an unsubscribe header", () => {
    expect(shouldIgnoreInitialJunk({
      headers: {},
      subject: "Can we meet tomorrow?",
      bodyText: "Let me know a good time.",
    })).toBe(false);
  });

  it("recognizes List-Unsubscribe regardless of header casing", () => {
    expect(shouldIgnoreInitialJunk({
      headers: { "list-unsubscribe": "<https://news.example/unsubscribe>" },
      subject: "Product updates",
      bodyText: "Here are this month's updates.",
    })).toBe(true);
  });

  it("does not ignore a possible payment request when the amount appears only in the subject", () => {
    expect(shouldIgnoreInitialJunk({
      headers: { "List-Unsubscribe": "<mailto:unsubscribe@example.com>" },
      subject: "Please pay ₹850 today",
      bodyText: "Payment details are in the attached invoice.",
    })).toBe(false);
  });

  it("does not ignore a contextual bare amount, because its currency may be implied by the inbox", () => {
    expect(shouldIgnoreInitialJunk({
      headers: { "List-Unsubscribe": "<mailto:unsubscribe@example.com>" },
      subject: "Invoice reminder",
      bodyText: "Please pay 500 by Friday.",
    })).toBe(false);
  });

  it("keeps messages with attachments because an invoice amount may be inside the file", () => {
    expect(shouldIgnoreInitialJunk({
      headers: { "List-Unsubscribe": "<https://vendor.example/unsubscribe>" },
      subject: "Your monthly invoice",
      bodyText: "Please see the attached PDF.",
      hasAttachments: true,
    })).toBe(false);
  });

  it("ignores a calendar invite regardless of headers or content", () => {
    expect(shouldIgnoreInitialJunk({
      headers: {},
      subject: "Meeting: Q3 planning",
      bodyText: "You're invited to a meeting.",
      isCalendarInvite: true,
    })).toBe(true);
  });

  it("ignores a 'payment received' receipt even though it restates the amount", () => {
    expect(shouldIgnoreInitialJunk({
      headers: {},
      subject: "Your payment receipt",
      bodyText: "Payment received: ₹500 on 1 September. Thank you.",
    })).toBe(true);
  });

  it("does not ignore a genuine new invoice that happens to mention a past payment", () => {
    expect(shouldIgnoreInitialJunk({
      headers: { "List-Unsubscribe": "<mailto:unsubscribe@example.com>" },
      subject: "New invoice INV-99",
      bodyText: "Please pay ₹700 for this month. Note: last month's payment received on time.",
    })).toBe(false);
  });

  it("ignores the PRD newsletter case even when it advertises a dollar subscription price", () => {
    expect(shouldIgnoreInitialJunk({
      headers: { "List-Unsubscribe": "<https://news.example/unsubscribe>" },
      subject: "Upgrade to Pro for $49/mo",
      bodyText: "New articles and features are waiting for you.",
    })).toBe(true);
  });
});
