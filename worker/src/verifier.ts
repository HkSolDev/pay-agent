export interface VerificationInput {
  fromAddr: string;
  replyTo: string | null;
  auth: { dmarc: string | null; spf: string | null; dkim: string | null };
  knownSenderAddrs: string[];
  knownPaymentMethodKeys: string[];
  extractedPaymentMethodKeys: string[];
  links: Array<{ href: string; finalDomain: string; visibleText: string }>;
  injectionDetected: boolean;
}

export interface VerificationResult {
  authPassed: boolean;
  hardFails: string[];
  softFlags: string[];
  score: number;
  unverified?: boolean;
  paidChecks?: {
    status: "verified" | "unverified";
    checks: Array<{ capability: string; status: "verified" | "unverified"; txHash: string | null; result: unknown }>;
    unverifiedReason?: string;
  };
}

function domainOf(address: string): string {
  return address.split("@")[1]?.toLowerCase() ?? "";
}

function headerAligned(value: string | null, fromDomain: string): boolean {
  if (!value || !/\b(?:dmarc|spf|dkim)=pass\b/i.test(value)) return false;
  const domains = [...value.matchAll(/(?:header\.from|smtp\.mailfrom|header\.d)=([\w.-]+)/gi)].map((m) => m[1].toLowerCase());
  return domains.includes(fromDomain);
}

function compactDomain(domain: string): string {
  return domain.replace(/\.com$/i, "").replace(/[._-]/g, "").replace(/[10]/g, (char) => char === "1" ? "l" : "o");
}

function looksLikeKnownDomain(fromDomain: string, knownDomains: string[]): boolean {
  const compact = compactDomain(fromDomain);
  return knownDomains.some((known) => compact === compactDomain(known));
}

/**
 * Verifier inputs are evidence gathered elsewhere; this function makes no
 * network request and never changes state. Bare `spf=pass` is insufficient:
 * it must be aligned with the visible From domain before policy may auto-pay.
 */
export function verifyEmail(input: VerificationInput): VerificationResult {
  const hardFails: string[] = [];
  const softFlags: string[] = [];
  const fromDomain = domainOf(input.fromAddr);
  const knownDomains = input.knownSenderAddrs.map(domainOf);
  const dmarcPass = headerAligned(input.auth.dmarc, fromDomain);
  const alignedSpfDkimPass = headerAligned(input.auth.spf, fromDomain) && headerAligned(input.auth.dkim, fromDomain);

  if (input.injectionDetected) hardFails.push("prompt_injection");
  if (knownDomains.length > 0 && !knownDomains.includes(fromDomain) && looksLikeKnownDomain(fromDomain, knownDomains)) {
    hardFails.push("lookalike_sender_domain");
  }
  if (input.replyTo && input.replyTo.toLowerCase() !== input.fromAddr.toLowerCase()) softFlags.push("reply_to_mismatch");
  // A changed rail is a hard fail only for a sender we already know. For a
  // genuinely new sender there is no approved rail to compare against yet;
  // the resolver/policy will route it to owner approval rather than calling
  // a normal first-time vendor a fraud attempt.
  const senderIsKnown = input.knownSenderAddrs.some((address) => address.toLowerCase() === input.fromAddr.toLowerCase());
  if (senderIsKnown && input.extractedPaymentMethodKeys.some((key) => !input.knownPaymentMethodKeys.includes(key))) {
    hardFails.push("payment_method_mismatch");
  }
  if (input.links.some((link) => !link.finalDomain.toLowerCase().endsWith(fromDomain))) {
    hardFails.push("link_domain_mismatch");
  }

  return { authPassed: dmarcPass || alignedSpfDkimPass, hardFails, softFlags, score: Math.max(0, 100 - softFlags.length * 10) };
}
