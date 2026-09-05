import { describe, expect, it } from "vitest";
import { servicePurchaseMandateBody } from "./perflo-mandate-setup.js";

describe("Perflo service-purchase setup", () => {
  it("uses the PRD's bounded service budget and never includes beneficiary authority", () => {
    const body = servicePurchaseMandateBody("2030-01-01T00:00:00.000Z");
    expect(body).toMatchObject({ kind: "service_purchase", per_payment_max: "0.50", total_cap: "0.50", payment_count: 1, daily_max: "0.50", weekly_max: "0.50", monthly_max: "0.50", expires_at: "2030-01-01T00:00:00.000Z" });
    expect(body).not.toHaveProperty("beneficiary_id");
  });
});
