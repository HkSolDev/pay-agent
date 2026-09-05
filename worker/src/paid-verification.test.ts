import { describe, expect, it } from "vitest";
import { runConfiguredPaidVerifier, type PaidVerifierRuntimeDeps } from "./paid-verification.js";

const input = {
  emailId: "email-1",
  fromAddr: "billing@example.com",
  links: [],
  isNewPayee: false,
  amountAboveOwnerThreshold: false,
};

function deps(overrides: Partial<PaidVerifierRuntimeDeps> = {}): PaidVerifierRuntimeDeps {
  return {
    loadCredentials: async () => ({ agentToken: "agent-token", mandateId: "mandate-1" }),
    createPurchase: () => async () => ({ settlementStatus: "settled", txHash: "0xtx", result: { ok: true } }),
    recordSpend: async () => undefined,
    ...overrides,
  };
}

describe("runConfiguredPaidVerifier", () => {
  it("uses the CLI purchase seam without requiring dormant REST credentials", async () => {
    const result = await runConfiguredPaidVerifier(input, deps({
      loadCredentials: async () => { throw new Error("REST credentials unavailable"); },
    }));

    expect(result.status).toBe("verified");
  });

  it("runs the real paid-check function after setup and returns settled evidence", async () => {
    const result = await runConfiguredPaidVerifier(input, deps());

    expect(result.status).toBe("verified");
    expect(result.checks).toEqual([{ capability: "email_verify", status: "verified", txHash: "0xtx", result: { ok: true } }]);
  });

  it("fails closed without setup instead of throwing or pretending a check ran", async () => {
    const previousTransport = process.env.X402_TRANSPORT;
    process.env.X402_TRANSPORT = "rest";
    const result = await runConfiguredPaidVerifier(input, deps({ loadCredentials: async () => { throw new Error("credentials missing"); } }));
    if (previousTransport === undefined) delete process.env.X402_TRANSPORT;
    else process.env.X402_TRANSPORT = previousTransport;

    expect(result).toEqual({
      status: "unverified",
      checks: [],
      unverifiedReason: "Perflo paid verifier setup is unavailable; complete the human device-auth/mandate setup before paid checks can be verified.",
    });
  });
});
