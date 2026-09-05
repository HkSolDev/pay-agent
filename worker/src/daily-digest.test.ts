import { describe, expect, it, vi } from "vitest";
import { sendDailyDigest, type DailyDigest, type DailyDigestDeps } from "./daily-digest.js";

function digest(): DailyDigest {
  return {
    paid: [{ description: "Riya Sharma · ₹500", occurredAt: "2026-09-05T08:10:00.000Z" }],
    waiting: [{ description: "Invoice 0043 from Acme", occurredAt: "2026-09-05T08:20:00.000Z" }],
    rejected: [{ description: "Invoice 0041 from Evil Co", occurredAt: "2026-09-05T08:30:00.000Z" }],
    x402SpendMinor: 12,
    x402CallCount: 2,
  };
}

function deps(overrides: Partial<DailyDigestDeps> = {}): DailyDigestDeps {
  return {
    ownerEmail: "owner@example.com",
    loadState: vi.fn(async () => ({ digestHour: 9, lastDigestSentAt: null })),
    collect: vi.fn(async () => digest()),
    claimDigest: vi.fn(async () => true),
    sendEmail: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("daily digest", () => {
  it("sends the paid, waiting, rejected, and x402 summary at the configured hour", async () => {
    const d = deps();
    const now = new Date(2026, 8, 5, 9, 15);

    const sent = await sendDailyDigest(now, d);

    expect(sent).toBe(true);
    expect(d.collect).toHaveBeenCalledWith(new Date(0));
    expect(d.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "owner@example.com",
      subject: "Perflo AP daily digest · 2026-09-05",
      text: expect.stringContaining("x402 spend: $0.12 across 2 checks"),
    }));
  });

  it("does not send outside the configured hour or after another worker claims the digest", async () => {
    const sendEmail = vi.fn(async () => undefined);
    const d = deps({ claimDigest: vi.fn(async () => false), sendEmail });
    const outsideHour = new Date(2026, 8, 5, 10, 15);
    const configuredHour = new Date(2026, 8, 5, 9, 20);

    expect(await sendDailyDigest(outsideHour, d)).toBe(false);
    expect(await sendDailyDigest(configuredHour, d)).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
