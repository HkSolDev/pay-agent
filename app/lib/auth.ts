export const COOKIE_NAME = "perflo_access";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function getHmacKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createAuthToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const timestamp = Date.now().toString();
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = bytesToHex(nonceBytes);
  const payload = `${timestamp}:${nonce}`;

  const key = await getHmacKey(password);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const signatureHex = bytesToHex(new Uint8Array(signatureBuffer));

  return `${payload}.${signatureHex}`;
}

export async function verifyAuthToken(
  token: string | undefined | null,
  password: string
): Promise<boolean> {
  if (!token || !password) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, signatureHex] = parts;
  const [timestampStr] = payload.split(":");
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  const now = Date.now();
  // Reject tokens with timestamp in future (> 5 mins clock drift) or older than 30 days
  if (timestamp > now + 5 * 60 * 1000) return false;
  if (now - timestamp > SESSION_MAX_AGE_SECONDS * 1000) return false;

  const sigBytes = hexToBytes(signatureHex);
  if (!sigBytes) return false;

  const key = await getHmacKey(password);
  const enc = new TextEncoder();
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as unknown as BufferSource,
    enc.encode(payload)
  );
}
