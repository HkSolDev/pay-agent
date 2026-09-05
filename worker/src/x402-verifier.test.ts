import { describe, expect, it } from "vitest";
import { runPaidVerifierChecks, type PaidVerifierDeps } from "./x402-verifier.js";

const deps = (overrides: Partial<PaidVerifierDeps> = {}): PaidVerifierDeps => ({
  purchase: async (request) => ({ settlementStatus: "settled", txHash: "0xtx", result: { ok: true, request } }),
  recordSpend: async () => undefined,
  ...overrides,
});

describe("paid verifier checks", () => {
  it("runs email and link checks through the paid seam and records settled evidence", async () => {
    const records: unknown[] = [];
    const result = await runPaidVerifierChecks({
      emailId: "email-1", fromAddr: "billing@example.com", links: [{ href: "https://example.com/invoice/1", finalDomain: "example.com", visibleText: "invoice" }],
      isNewPayee: true, amountAboveOwnerThreshold: false,
    }, deps({ recordSpend: async (record) => { records.push(record); } }));

    expect(result.status).toBe("verified");
    expect(result.checks.map((check) => check.capability)).toEqual(["email_verify", "browser"]);
    expect(records).toHaveLength(2);
    expect(records.every((record) => (record as { settlementStatus: string }).settlementStatus === "settled")).toBe(true);
  });

  it("turns an empty balance or failed paid call into unverified without throwing", async () => {
    const result = await runPaidVerifierChecks({
      emailId: "email-2", fromAddr: "billing@example.com", links: [], isNewPayee: false, amountAboveOwnerThreshold: false,
    }, deps({ purchase: async () => { throw new Error("insufficient_funds"); } }));

    expect(result.status).toBe("unverified");
    expect(result.unverifiedReason).toMatch(/insufficient_funds/);
  });
});
