import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

// Raw bank/UPI identifiers never sit in the DB as plaintext. The payload
// (the actual VPA or account+IFSC, needed to pay through it) is encrypted;
// the lookup hash (used for the resolver's exact-match query) is a
// *separate*, keyed hash — DB access alone can't be brute-forced back into
// a real VPA or account number just from the hash, since it needs the key
// too, unlike a plain sha256 of the normalized value.

function getEncryptionKey(): Buffer {
  const key = process.env.PAYEE_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "PAYEE_ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error("PAYEE_ENCRYPTION_KEY must be a 32-byte (64 hex character) key.");
  }
  return buf;
}

function getHashKey(): Buffer {
  // Deliberately a different secret than the encryption key: a compromise
  // of one must not automatically hand over the other. Falls back to the
  // encryption key only if a dedicated one isn't set, so this doesn't
  // silently fail in an otherwise-configured environment.
  const key = process.env.PAYEE_HASH_KEY ?? process.env.PAYEE_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("PAYEE_HASH_KEY (or PAYEE_ENCRYPTION_KEY) is not set.");
  }
  return Buffer.from(key, "hex");
}

/** AES-256-GCM: IV + auth tag + ciphertext, all concatenated into one Buffer. */
export function encryptPaymentMethod(plaintext: string): Buffer {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptPaymentMethod(encrypted: Buffer): string {
  const key = getEncryptionKey();
  const iv = encrypted.subarray(0, 12);
  const authTag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** HMAC-SHA256 of the normalized method — the exact-match lookup key. */
export function hashPaymentMethod(normalized: string): string {
  return createHmac("sha256", getHashKey()).update(normalized).digest("hex");
}

/**
 * One normalized string per rail, independent of which fields are present —
 * this is what both the encrypted payload and the lookup hash are derived
 * from, so "the same VPA" always normalizes to the same thing regardless of
 * how it was capitalized in the source email.
 */
export function normalizePaymentMethod(method: { kind: "upi"; vpa: string } | { kind: "bank_neft"; accountNumber: string; ifsc: string }): string {
  if (method.kind === "upi") return `upi:${method.vpa.toLowerCase()}`;
  return `bank_neft:${method.accountNumber}:${method.ifsc.toUpperCase()}`;
}
