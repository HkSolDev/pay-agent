import { describe, expect, it } from "vitest";
import { PerfloCliX402Client } from "./x402-cli-client.js";

describe("Perflo CLI x402 client", () => {
  it("discovers, checks, and fetches a service within the verifier budget", async () => {
    const calls: string[][] = [];
    const client = new PerfloCliX402Client({
      execFile: async (_command, args) => {
        calls.push(args);
        if (args.includes("best-vendor")) {
          return { stdout: JSON.stringify({ ok: true, best: { url: "https://vendor.example/verify", method: "POST" } }), stderr: "" };
        }
        if (args.includes("check")) {
          return { stdout: JSON.stringify({ ok: true, contract: { url: "https://vendor.example/verify", method: "POST", priceMinor: "30000", asset: "USDC" } }), stderr: "" };
        }
        return {
          stdout: JSON.stringify({ ok: true, result: { settlementStatus: "settled", txHash: "0xtx", priceMinor: "30000", value: { deliverable: true } } }),
          stderr: "",
        };
      },
    });

    await expect(client.purchase({ capability: "email_verify", input: { email: "billing@example.com" }, maxPriceUsd: "0.05" })).resolves.toEqual({
      settlementStatus: "settled",
      txHash: "0xtx",
      costMinor: 3,
      result: { settlementStatus: "settled", txHash: "0xtx", priceMinor: "30000", value: { deliverable: true } },
    });

    expect(calls).toEqual([
      ["@perflo/cli@latest", "--json", "best-vendor", "email_verify"],
      ["@perflo/cli@latest", "--json", "check", "https://vendor.example/verify"],
      [
        "@perflo/cli@latest", "--json", "fetch", "https://vendor.example/verify", "--method", "POST",
        "--body", JSON.stringify({ email: "billing@example.com" }), "--price", "50000", "--asset", "USDC",
      ],
    ]);
  });
});
