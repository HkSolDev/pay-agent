import { describe, expect, it } from "vitest";
import { paymentMethodFromNormalized } from "./payee-store.js";

describe("Payee store — encrypted rail decoding", () => {
  it("decodes only canonical, valid payment methods", () => {
    expect(paymentMethodFromNormalized("upi:Riya@OKAXIS")).toEqual({ kind: "upi", vpa: "riya@okaxis" });
    expect(paymentMethodFromNormalized("bank_neft:5010023456789:HDFC0001234"))
      .toEqual({ kind: "bank_neft", accountNumber: "5010023456789", ifsc: "HDFC0001234" });
  });

  it("does not turn malformed data or ordinary email addresses into payment rails", () => {
    expect(paymentMethodFromNormalized("upi:billing@gmail.com")).toBeNull();
    expect(paymentMethodFromNormalized("bank_neft:123:HDFC0001234")).toBeNull();
    expect(paymentMethodFromNormalized("anything else")).toBeNull();
  });
});
