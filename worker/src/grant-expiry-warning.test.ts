import { describe, expect, it, vi } from "vitest";
import { warnAboutExpiringGrants, type GrantExpiryWarningDeps } from "./grant-expiry-warning.js";

function deps(overrides: Partial<GrantExpiryWarningDeps> = {}): GrantExpiryWarningDeps {
  return {
    ownerEmail: "owner@example.com",
    findExpiringPayees: vi.fn(async () => [{
      id: "payee-1",
      name: "Riya Sharma",
      grantExpiresAt: new Date("2026-09-10T00:00:00.000Z"),
    }]),
    claimWarning: vi.fn(async () => true),
    sendEmail: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("grant expiry warning", () => {
  it("emails the owner once for each expiring approved payee", async () => {
    const d = deps();

    const warned = await warnAboutExpiringGrants(new Date("2026-09-05T00:00:00.000Z"), d);

    expect(warned).toBe(1);
    expect(d.claimWarning).toHaveBeenCalledWith("payee-1", new Date("2026-09-05T00:00:00.000Z"));
    expect(d.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "owner@example.com",
      subject: "Grant expiring soon: Riya Sharma",
    }));
  });

  it("does not send when the database claim was already taken", async () => {
    const sendEmail = vi.fn(async () => undefined);
    const d = deps({ claimWarning: vi.fn(async () => false), sendEmail });

    expect(await warnAboutExpiringGrants(new Date("2026-09-05T00:00:00.000Z"), d)).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
