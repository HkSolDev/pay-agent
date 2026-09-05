import { randomBytes } from "node:crypto";

const DEFAULT_BASE_URL = "https://api-gateway.perflo.ai";

export interface SetupHttp { fetch(input: string, init?: RequestInit): Promise<Response> }

export function servicePurchaseMandateBody(expiresAt: string): Record<string, unknown> {
  return {
    kind: "service_purchase",
    per_payment_max: "0.50",
    total_cap: "0.50",
    payment_count: 1,
    daily_max: "0.50",
    weekly_max: "0.50",
    monthly_max: "0.50",
    expires_at: expiresAt,
    allowed_services: ["stableenrich-hunter-email-verifier", "apify-apify-ai-web-agent"],
    allowed_capabilities: ["email_verify", "browser"],
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Perflo returned an invalid setup response.");
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Perflo setup response is missing ${name}.`);
  return value;
}

export async function setupServicePurchaseAgent(options: {
  customerToken: string;
  agentName: string;
  expiresAt: string;
  baseUrl?: string;
  http?: SetupHttp;
}): Promise<{ mandateId: string; agentToken: string }> {
  const http = options.http ?? { fetch: (input: string, init?: RequestInit) => fetch(input, init) };
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  const auth = { authorization: `Bearer ${options.customerToken}` };
  const body = servicePurchaseMandateBody(options.expiresAt);
  const confirmationResponse = await http.fetch(`${base}/v1/confirmation-intents`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ action: "mandate.create", payload: body }) });
  if (!confirmationResponse.ok) throw new Error(`Perflo mandate confirmation failed with HTTP ${confirmationResponse.status}.`);
  const confirmation = object(await confirmationResponse.json());
  const confirmationId = text(confirmation.id, "confirmation intent id");
  const mandateResponse = await http.fetch(`${base}/v1/mandates`, { method: "POST", headers: { ...auth, "content-type": "application/json", "confirmation-intent-id": confirmationId, "idempotency-key": randomBytes(16).toString("hex") }, body: JSON.stringify(body) });
  if (!mandateResponse.ok) throw new Error(`Perflo mandate creation failed with HTTP ${mandateResponse.status}.`);
  const mandate = object(await mandateResponse.json());
  const mandateId = text(mandate.resource_id, "mandate id");
  for (;;) {
    const statusResponse = await http.fetch(`${base}/v1/mandates/${encodeURIComponent(mandateId)}`, { headers: auth });
    if (!statusResponse.ok) throw new Error(`Perflo mandate status failed with HTTP ${statusResponse.status}.`);
    const status = object(await statusResponse.json()).status;
    if (status === "active") break;
    if (status === "revoked" || status === "expired" || status === "failed") throw new Error(`Perflo service-purchase mandate ended in ${String(status)}.`);
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
  const connectResponse = await http.fetch(`${base}/v1/mandates/${encodeURIComponent(mandateId)}/connect-codes`, { method: "POST", headers: auth });
  if (!connectResponse.ok) throw new Error(`Perflo connect-code creation failed with HTTP ${connectResponse.status}.`);
  const connectCode = text(object(await connectResponse.json()).code, "connect code");
  const redeemResponse = await http.fetch(`${base}/v1/connect-codes/redeem`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: connectCode, agent_name: options.agentName }) });
  if (!redeemResponse.ok) throw new Error(`Perflo pairing redemption failed with HTTP ${redeemResponse.status}.`);
  const credential = object(await redeemResponse.json());
  return { mandateId, agentToken: text(credential.access_token, "agent token") };
}
