import { createHash } from "node:crypto";

/** Hashes the original downloaded bytes; extracted text must not be hashed instead. */
export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
