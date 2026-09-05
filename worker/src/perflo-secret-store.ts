import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function key(): Buffer {
  const value = process.env.PERFLO_CREDENTIALS_KEY;
  if (!value) throw new Error("PERFLO_CREDENTIALS_KEY is required for Perflo credential storage.");
  const result = Buffer.from(value, "hex");
  if (result.length !== 32) throw new Error("PERFLO_CREDENTIALS_KEY must be 32 bytes of hex.");
  return result;
}

export async function savePerfloCredentials(path: string, value: unknown): Promise<void> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const payload = JSON.stringify({ iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, payload, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function loadPerfloCredentials<T>(path: string): Promise<T> {
  const payload = JSON.parse(await readFile(path, "utf8")) as { iv: string; tag: string; ciphertext: string };
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8")) as T;
}
