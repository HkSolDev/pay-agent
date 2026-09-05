import { createHash, randomBytes } from "node:crypto";

export const X402_DEFAULT_BUDGET_MINOR = 5;
export const X402_EXCEPTION_BUDGET_MINOR = 50;

export type PaidCapability = "email_verify" | "browser";

export interface PaidVerifierInput {
  emailId: string;
  fromAddr: string;
  links: Array<{ href: string; finalDomain: string; visibleText: string }>;
  isNewPayee: boolean;
  amountAboveOwnerThreshold: boolean;
}

export interface PaidPurchaseRequest {
  capability: PaidCapability;
  input: Record<string, unknown>;
  maxPriceUsd: string;
}

export interface PaidPurchaseResult {
  settlementStatus: "settled" | "unverified" | "none";
  txHash: string | null;
  costMinor?: number;
  result: unknown;
}

export interface X402SpendRecord {
  emailId: string;
  tool: PaidCapability;
  costMinor: number;
  settlementStatus: PaidPurchaseResult["settlementStatus"];
  txHash: string | null;
  resultHash: string | null;
}

export interface PaidVerifierDeps {
  purchase: (request: PaidPurchaseRequest) => Promise<PaidPurchaseResult>;
  recordSpend: (record: X402SpendRecord) => Promise<void>;
}

export interface X402Http {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

const defaultHttp: X402Http = { fetch: (input, init) => fetch(input, init) };
const preferredService: Record<PaidCapability, string> = {
  email_verify: "stableenrich-hunter-email-verifier",
  browser: "apify-apify-ai-web-agent",
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Perflo returned an invalid service response.");
  return value as Record<string, unknown>;
}

function moneyToMinor(value: unknown): number {
  const price = object(value);
  const amount = typeof price.amount === "string" ? Number(price.amount) : NaN;
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Perflo returned an invalid service price.");
  return Math.ceil(amount * 100);
}

/** REST implementation for the mandate-scoped agent purchase flow. */
export class PerfloX402Client {
  constructor(
    private readonly options: { token: string; mandateId: string; baseUrl?: string; http?: X402Http; sleep?: (ms: number) => Promise<void> },
  ) {}

  async purchase(request: PaidPurchaseRequest): Promise<PaidPurchaseResult> {
    const http = this.options.http ?? defaultHttp;
    const base = this.options.baseUrl ?? "https://api-gateway.perflo.ai";
    const headers = { authorization: `Bearer ${this.options.token}` };
    const query = `mandate_id=${encodeURIComponent(this.options.mandateId)}`;
    const capabilities = await http.fetch(`${base}/v1/service-capabilities?query=${encodeURIComponent(request.capability)}&${query}`, { headers });
    if (!capabilities.ok) throw new Error(`Perflo capability discovery failed with HTTP ${capabilities.status}.`);
    const capabilityRows = await capabilities.json() as unknown;
    if (!Array.isArray(capabilityRows) || !capabilityRows.some((row) => object(row).id === request.capability)) throw new Error(`Perflo capability ${request.capability} is unavailable for this mandate.`);

    const servicesResponse = await http.fetch(`${base}/v1/services?capability=${encodeURIComponent(request.capability)}&${query}`, { headers });
    if (!servicesResponse.ok) throw new Error(`Perflo service discovery failed with HTTP ${servicesResponse.status}.`);
    const services = await servicesResponse.json() as unknown;
    if (!Array.isArray(services)) throw new Error("Perflo returned an invalid service list.");
    const service = services.find((row) => object(row).id === preferredService[request.capability]) ?? services[0];
    if (!service) throw new Error(`No Perflo service is available for ${request.capability}.`);
    const serviceId = String(object(service).id);

    const quoteResponse = await http.fetch(`${base}/v1/purchase-quotes?${query}`, {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ target: { kind: "service", service_id: serviceId } }),
    });
    if (!quoteResponse.ok) throw new Error(`Perflo purchase quote failed with HTTP ${quoteResponse.status}.`);
    const quote = object(await quoteResponse.json());
    if (quote.payable !== true || moneyToMinor(quote.price) > Math.round(Number(request.maxPriceUsd) * 100)) throw new Error(`${request.capability} price exceeds the invoice x402 budget.`);

    const purchaseResponse = await http.fetch(`${base}/v1/purchases`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", "idempotency-key": randomBytes(16).toString("hex") },
      body: JSON.stringify({ target: { kind: "service", service_id: serviceId }, input: request.input, max_price: { amount: request.maxPriceUsd, currency: "USD" }, mandate_id: this.options.mandateId }),
    });
    if (!purchaseResponse.ok) throw new Error(`Perflo purchase failed with HTTP ${purchaseResponse.status}.`);
    const accepted = object(await purchaseResponse.json());
    const purchaseId = typeof accepted.resource_id === "string" ? accepted.resource_id : typeof accepted.id === "string" ? accepted.id : null;
    if (!purchaseId) throw new Error("Perflo purchase response did not include a purchase id.");

    const sleep = this.options.sleep ?? (async (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    for (;;) {
      const statusResponse = await http.fetch(`${base}/v1/purchases/${encodeURIComponent(purchaseId)}`, { headers });
      if (!statusResponse.ok) throw new Error(`Perflo purchase polling failed with HTTP ${statusResponse.status}.`);
      const status = object(await statusResponse.json());
      const state = status.status;
      if (["queued", "running", "settling"].includes(String(state))) { await sleep(500); continue; }
      const result = status.result;
      const txHash = typeof status.txHash === "string" ? status.txHash : result && typeof result === "object" && typeof (result as Record<string, unknown>).txHash === "string" ? (result as Record<string, string>).txHash : null;
      return { settlementStatus: state === "completed" && txHash ? "settled" : state === "completed" ? "unverified" : "none", txHash, costMinor: status.price ? moneyToMinor(status.price) : undefined, result };
    }
  }
}

export interface PaidCheckEvidence {
  capability: PaidCapability;
  status: "verified" | "unverified";
  txHash: string | null;
  result: unknown;
}

export interface PaidVerifierResult {
  status: "verified" | "unverified";
  checks: PaidCheckEvidence[];
  unverifiedReason?: string;
}

function resultHash(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export async function runPaidVerifierChecks(input: PaidVerifierInput, deps: PaidVerifierDeps): Promise<PaidVerifierResult> {
  const checks: PaidCheckEvidence[] = [];
  const budgetMinor = input.isNewPayee || input.amountAboveOwnerThreshold ? X402_EXCEPTION_BUDGET_MINOR : X402_DEFAULT_BUDGET_MINOR;
  let spentMinor = 0;
  const requests: PaidPurchaseRequest[] = [
    { capability: "email_verify", input: { email: input.fromAddr }, maxPriceUsd: "0" },
    ...input.links.map((link) => ({ capability: "browser" as const, input: { startUrl: link.href, instructions: "Extract the final URL, page title, visible payment details, payee name, and any request for login, OTP, or card details." }, maxPriceUsd: "0" })),
  ];

  for (const request of requests) {
    const remainingMinor = budgetMinor - spentMinor;
    if (remainingMinor <= 0) return { status: "unverified", checks, unverifiedReason: "The per-invoice x402 budget is exhausted." };
    request.maxPriceUsd = (remainingMinor / 100).toFixed(2);
    let purchase: PaidPurchaseResult;
    try {
      purchase = await deps.purchase(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.recordSpend({ emailId: input.emailId, tool: request.capability, costMinor: 0, settlementStatus: "none", txHash: null, resultHash: null });
      return { status: "unverified", checks, unverifiedReason: message };
    }
    await deps.recordSpend({ emailId: input.emailId, tool: request.capability, costMinor: purchase.costMinor ?? 0, settlementStatus: purchase.settlementStatus, txHash: purchase.txHash, resultHash: resultHash(purchase.result) });
    spentMinor += purchase.costMinor ?? 0;
    const verified = purchase.settlementStatus === "settled" && purchase.txHash !== null;
    checks.push({ capability: request.capability, status: verified ? "verified" : "unverified", txHash: purchase.txHash, result: purchase.result });
    if (!verified) return { status: "unverified", checks, unverifiedReason: `${request.capability} has no verified settlement.` };
  }
  return { status: "verified", checks };
}
