import { describe, expect, it } from "vitest";
import { verifyEmail, type VerificationInput } from "./verifier.js";

const base = (): VerificationInput => ({
  fromAddr: "billing@riya.example",
  replyTo: null,
  auth: { dmarc: "dmarc=pass header.from=riya.example", spf: "spf=pass smtp.mailfrom=riya.example", dkim: "dkim=pass header.d=riya.example" },
  knownSenderAddrs: ["billing@riya.example"],
  knownPaymentMethodKeys: ["upi:riya@okaxis"],
  extractedPaymentMethodKeys: ["upi:riya@okaxis"],
  links: [],
  injectionDetected: false,
});

describe("Verifier — hard evidence before policy can auto-pay", () => {
  it("accepts aligned DMARC or aligned SPF plus DKIM, not bare pass tokens", () => {
    expect(verifyEmail(base())).toEqual(expect.objectContaining({ hardFails: [], authPassed: true }));

    const unaligned = base();
    unaligned.auth = { dmarc: "dmarc=pass header.from=attacker.example", spf: "spf=pass smtp.mailfrom=attacker.example", dkim: "dkim=pass header.d=attacker.example" };
    expect(verifyEmail(unaligned)).toEqual(expect.objectContaining({ authPassed: false }));
  });

  it("hard-fails an injection-flagged message even if every other signal is good", () => {
    const input = base(); input.injectionDetected = true;
    expect(verifyEmail(input).hardFails).toContain("prompt_injection");
  });

  it("hard-fails a lookalike sender instead of trusting a matching display name", () => {
    const input = base();
    input.fromAddr = "billing@riya-examp1e.com";
    expect(verifyEmail(input).hardFails).toContain("lookalike_sender_domain");
  });

  it("flags a Reply-To takeover and a payment-method mismatch", () => {
    const input = base();
    input.replyTo = "collect@attacker.example";
    input.extractedPaymentMethodKeys = ["upi:attacker@okaxis"];
    const result = verifyEmail(input);
    expect(result.softFlags).toContain("reply_to_mismatch");
    expect(result.hardFails).toContain("payment_method_mismatch");
  });

  it("hard-fails an invoice link whose final domain conflicts with the approved sender domain", () => {
    const input = base();
    input.links = [{ href: "https://riya-invoice.example/pay", finalDomain: "attacker.example", visibleText: "Riya invoice portal" }];
    expect(verifyEmail(input).hardFails).toContain("link_domain_mismatch");
  });
});
