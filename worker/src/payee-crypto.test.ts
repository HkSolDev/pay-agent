import { afterEach, describe, expect, it } from "vitest";
import { decryptPaymentMethod, encryptPaymentMethod, hashPaymentMethod, normalizePaymentMethod } from "./payee-crypto.js";

const savedEncryptionKey = process.env.PAYEE_ENCRYPTION_KEY;
const savedHashKey = process.env.PAYEE_HASH_KEY;
const encryptionKey = "a".repeat(64);
const hashKey = "b".repeat(64);

afterEach(() => {
  if (savedEncryptionKey === undefined) delete process.env.PAYEE_ENCRYPTION_KEY;
  else process.env.PAYEE_ENCRYPTION_KEY = savedEncryptionKey;
  if (savedHashKey === undefined) delete process.env.PAYEE_HASH_KEY;
  else process.env.PAYEE_HASH_KEY = savedHashKey;
});

describe("Payee payment-method cryptography", () => {
  it("round-trips AES-GCM while using a fresh IV each time", () => {
    process.env.PAYEE_ENCRYPTION_KEY = encryptionKey;
    const first = encryptPaymentMethod("upi:riya@okaxis");
    const second = encryptPaymentMethod("upi:riya@okaxis");
    expect(decryptPaymentMethod(first)).toBe("upi:riya@okaxis");
    expect(first.equals(second)).toBe(false);
  });

  it("rejects tampered ciphertext instead of returning altered payment details", () => {
    process.env.PAYEE_ENCRYPTION_KEY = encryptionKey;
    const encrypted = encryptPaymentMethod("upi:riya@okaxis");
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => decryptPaymentMethod(encrypted)).toThrow();
  });

  it("rejects missing or malformed encryption keys", () => {
    delete process.env.PAYEE_ENCRYPTION_KEY;
    expect(() => encryptPaymentMethod("upi:riya@okaxis")).toThrow(/PAYEE_ENCRYPTION_KEY/);
    process.env.PAYEE_ENCRYPTION_KEY = "not-hex";
    expect(() => encryptPaymentMethod("upi:riya@okaxis")).toThrow(/32-byte/);
  });

  it("uses a stable keyed hash for the same normalized method", () => {
    process.env.PAYEE_ENCRYPTION_KEY = encryptionKey;
    process.env.PAYEE_HASH_KEY = hashKey;
    const one = normalizePaymentMethod({ kind: "upi", vpa: "Riya@OKAXIS" });
    const two = normalizePaymentMethod({ kind: "upi", vpa: "riya@okaxis" });
    expect(hashPaymentMethod(one)).toBe(hashPaymentMethod(two));
    expect(hashPaymentMethod(one)).not.toBe(hashPaymentMethod("upi:other@okaxis"));
  });
});
