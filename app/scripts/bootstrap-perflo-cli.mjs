// Railway wipes the container filesystem on every redeploy, so the real
// `perflo` CLI's session file (~/.perflo/credentials.json, normally created
// once by `perflo login` on a persistent machine) never survives a restart
// there. This restores it from an env var at boot, before the app starts.
// No-op when PERFLO_CLI_CREDENTIALS_B64 is unset (e.g. local dev, or any
// deployment that only uses Razorpay) — never overwrites a real local session.
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const encoded = process.env.PERFLO_CLI_CREDENTIALS_B64;
if (!encoded) {
  process.exit(0);
}

const path = join(homedir(), ".perflo", "credentials.json");
await mkdir(dirname(path), { recursive: true, mode: 0o700 });
await writeFile(path, Buffer.from(encoded, "base64"), { mode: 0o600 });
console.log("[bootstrap-perflo-cli] wrote ~/.perflo/credentials.json from PERFLO_CLI_CREDENTIALS_B64");
