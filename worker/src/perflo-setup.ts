import { fileURLToPath } from "node:url";
import { pollDeviceAuthorization, startDeviceAuthorization, verifyCustomerToken } from "./perflo-device-auth.js";
import { setupServicePurchaseAgent } from "./perflo-mandate-setup.js";
import { savePerfloCredentials } from "./perflo-secret-store.js";

export async function runOneTimePerfloSetup(): Promise<void> {
  const start = await startDeviceAuthorization({ clientName: "Perflo AP Agent", deviceName: "Perflo AP Agent backend" });
  console.log(`Open this URL in Abhinav's browser and approve the device: ${start.connectUrl}`);
  const customer = await pollDeviceAuthorization(start);
  console.log(
    `[diagnostic] email=${customer.email} deviceId=${customer.deviceId} ` +
    `jwtSegments=${customer.accessJwt.split(".").length} jwtLength=${customer.accessJwt.length} ` +
    `expiresAt=${new Date(customer.expiresAt).toISOString()} msUntilExpiry=${customer.expiresAt - Date.now()}`,
  );
  const jwtParts = customer.accessJwt.split(".");
  if (jwtParts.length === 3) {
    try {
      const decode = (segment: string) => JSON.parse(Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
      console.log(`[diagnostic] jwt header=${JSON.stringify(decode(jwtParts[0]))}`);
      const payload = decode(jwtParts[1]);
      const { sub, iss, aud, iat, exp, nbf, ...rest } = payload;
      console.log(
        `[diagnostic] jwt payload sub=${sub} iss=${iss} aud=${JSON.stringify(aud)} ` +
        `iat=${iat ? new Date(iat * 1000).toISOString() : iat} exp=${exp ? new Date(exp * 1000).toISOString() : exp} ` +
        `nbf=${nbf ? new Date(nbf * 1000).toISOString() : nbf} nowIso=${new Date().toISOString()} otherKeys=${Object.keys(rest).join(",")}`,
      );
    } catch (err) {
      console.log(`[diagnostic] failed to decode JWT payload: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    console.log(`[diagnostic] accessJwt is not a 3-segment JWT (has ${jwtParts.length} segments) — first 20 chars: ${customer.accessJwt.slice(0, 20)}`);
  }
  await verifyCustomerToken(customer);
  const mandate = await setupServicePurchaseAgent({ customerToken: customer.accessJwt, agentName: "Perflo AP Agent", expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
  await savePerfloCredentials(process.env.PERFLO_CREDENTIALS_FILE ?? ".perflo/ap-agent.credentials.enc", { customer, mandateId: mandate.mandateId, agentToken: mandate.agentToken });
  console.log("Perflo setup complete; credentials were stored encrypted.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runOneTimePerfloSetup().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
