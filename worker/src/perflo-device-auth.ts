import { setTimeout as wait } from "node:timers/promises";

const DEFAULT_BASE_URL = "https://api-gateway.perflo.ai";

export interface CustomerCredentials {
  accessJwt: string;
  refreshToken: string;
  expiresAt: number;
  deviceId: string;
  email: string;
  walletAddress: string;
}

export interface DeviceStart {
  sid: string;
  connectUrl: string;
  pollInterval: number;
  expiresIn: number;
}

export type DevicePoll =
  | { status: "pending" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "complete"; result: CustomerCredentials };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Perflo returned an invalid object.");
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Perflo device response is missing ${name}.`);
  return value;
}

export function parseDeviceStart(value: unknown): DeviceStart {
  const body = record(value);
  if (body.success !== true) throw new Error("Perflo device authorization did not start.");
  const data = record(body.data);
  const connectUrl = nonEmpty(data.connectUrl, "connectUrl");
  const parsed = new URL(connectUrl);
  if (parsed.origin !== "https://app.perflo.ai") throw new Error("Perflo connectUrl must use https://app.perflo.ai.");
  if (typeof data.pollInterval !== "number" || data.pollInterval <= 0) throw new Error("Perflo device response is missing pollInterval.");
  if (typeof data.expiresIn !== "number" || data.expiresIn <= 0) throw new Error("Perflo device response is missing expiresIn.");
  return { sid: nonEmpty(data.sid, "sid"), connectUrl, pollInterval: data.pollInterval, expiresIn: data.expiresIn };
}

export function parseDevicePoll(value: unknown): DevicePoll {
  const data = record(record(value).data);
  const status = data.status;
  if (status === "pending" || status === "denied" || status === "expired") return { status };
  if (status !== "complete") throw new Error("Perflo returned an unknown device status.");
  const result = record(data.result);
  return {
    status,
    result: {
      accessJwt: nonEmpty(result.accessJwt, "accessJwt"),
      refreshToken: nonEmpty(result.refreshToken, "refreshToken"),
      expiresAt: typeof result.expiresAt === "number" ? result.expiresAt : (() => { throw new Error("Perflo device response is missing expiresAt."); })(),
      deviceId: nonEmpty(result.deviceId, "deviceId"),
      email: nonEmpty(result.email, "email"),
      walletAddress: nonEmpty(result.walletAddress, "walletAddress"),
    },
  };
}

export interface PerfloDeviceHttp {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

const defaultHttp: PerfloDeviceHttp = { fetch: (input, init) => fetch(input, init) };

export async function startDeviceAuthorization(
  options: { clientName: string; deviceName: string; baseUrl?: string; http?: PerfloDeviceHttp },
): Promise<DeviceStart> {
  const http = options.http ?? defaultHttp;
  const response = await http.fetch(`${options.baseUrl ?? DEFAULT_BASE_URL}/cli/device/start`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientName: options.clientName, deviceName: options.deviceName }),
  });
  if (!response.ok) throw new Error(`Perflo device start failed with HTTP ${response.status}.`);
  return parseDeviceStart(await response.json());
}

export async function pollDeviceAuthorization(
  start: DeviceStart,
  options: { baseUrl?: string; http?: PerfloDeviceHttp; sleep?: (ms: number) => Promise<void> } = {},
): Promise<CustomerCredentials> {
  const http = options.http ?? defaultHttp;
  const sleep = options.sleep ?? ((ms) => wait(ms).then(() => undefined));
  const deadline = Date.now() + start.expiresIn * 1000;
  while (Date.now() < deadline) {
    await sleep(Math.max(500, start.pollInterval));
    const response = await http.fetch(`${options.baseUrl ?? DEFAULT_BASE_URL}/cli/device/poll`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sid: start.sid }),
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "60");
      await sleep(Math.max(500, retryAfter * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`Perflo device poll failed with HTTP ${response.status}.`);
    const result = parseDevicePoll(await response.json());
    if (result.status === "complete") return result.result;
    if (result.status === "denied") throw new Error("Perflo device authorization was denied.");
    if (result.status === "expired") throw new Error("Perflo device authorization expired.");
  }
  throw new Error("Perflo device authorization timed out.");
}

export async function verifyCustomerToken(
  credentials: CustomerCredentials,
  options: { baseUrl?: string; http?: PerfloDeviceHttp; sleep?: (ms: number) => Promise<void>; attempts?: number } = {},
): Promise<void> {
  const http = options.http ?? defaultHttp;
  const sleep = options.sleep ?? ((ms) => wait(ms).then(() => undefined));
  const attempts = options.attempts ?? 3;
  let lastError = "";
  let attemptsMade = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    attemptsMade = attempt;
    const response = await http.fetch(`${options.baseUrl ?? DEFAULT_BASE_URL}/v1/identity`, {
      headers: { authorization: `Bearer ${credentials.accessJwt}` },
    });
    if (response.ok) {
      const identity = record(await response.json());
      if (identity.actor_type !== "customer") throw new Error("Perflo token is not a customer token.");
      return;
    }
    // A freshly-issued token failing /v1/identity immediately after device
    // poll returns "complete" has been observed live (HTTP 401 on the very
    // next call) — plausibly propagation lag on Perflo's side between
    // issuing the token and it being valid for a read. Retry a few times
    // with backoff before treating it as a real failure, rather than
    // burning another single-use approval link on every transient miss.
    const body = await response.text().catch(() => "<unreadable body>");
    lastError = `HTTP ${response.status}: ${body}`;
    try {
      if (record(JSON.parse(body)).retryable === false) break;
    } catch {
      // Preserve the retry behavior for non-JSON or otherwise malformed errors.
    }
    if (attempt < attempts) await sleep(1500 * attempt);
  }
  throw new Error(`Perflo identity verification failed after ${attemptsMade} attempt${attemptsMade === 1 ? "" : "s"}: ${lastError}`);
}
