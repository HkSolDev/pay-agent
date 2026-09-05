import { describe, expect, it, vi } from "vitest";
import { parseDeviceStart, parseDevicePoll, verifyCustomerToken } from "./perflo-device-auth.js";

describe("Perflo device authorization", () => {
  it("accepts only a customer-approved Perflo connect URL and complete credential payload", () => {
    expect(parseDeviceStart({
      success: true,
      data: { sid: "sid-1", connectUrl: "https://app.perflo.ai/connect/sid-1", pollInterval: 1000, expiresIn: 300 },
    })).toEqual({ sid: "sid-1", connectUrl: "https://app.perflo.ai/connect/sid-1", pollInterval: 1000, expiresIn: 300 });

    expect(() => parseDeviceStart({
      success: true,
      data: { sid: "sid-1", connectUrl: "https://evil.example/connect/sid-1", pollInterval: 1000, expiresIn: 300 },
    })).toThrow(/app\.perflo\.ai/);

    expect(parseDevicePoll({
      data: {
        status: "complete",
        result: { accessJwt: "access", refreshToken: "refresh", expiresAt: 2, deviceId: "device", email: "owner@example.com", walletAddress: "0xabc" },
      },
    })).toEqual({ status: "complete", result: { accessJwt: "access", refreshToken: "refresh", expiresAt: 2, deviceId: "device", email: "owner@example.com", walletAddress: "0xabc" } });
  });

  it("does not retry an identity failure that Perflo marks non-retryable", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "authentication_required",
      detail: "The access token is invalid or expired",
      retryable: false,
    }), { status: 401, headers: { "content-type": "application/problem+json" } }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(verifyCustomerToken({
      accessJwt: "access", refreshToken: "refresh", expiresAt: 2, deviceId: "device",
      email: "owner@example.com", walletAddress: "0xabc",
    }, { http: { fetch }, sleep, attempts: 3 })).rejects.toThrow("after 1 attempt");

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
