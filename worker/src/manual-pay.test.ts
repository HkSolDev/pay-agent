import { describe, expect, it, vi } from "vitest";
import { requestManualPayment } from "./manual-pay.js";

const payable = {
  emailId: "email-1",
  recipientNickname: "riya-sharma",
  amount: "500",
  currency: "INR",
};

describe("locked manual payment", () => {
  it("pays only after an explicit owner confirmation", async () => {
    const loadPayableEmail = vi.fn().mockResolvedValue(payable);
    const claimPayment = vi.fn().mockResolvedValue({ intentId: "intent-1", idempotencyKey: "idem-1" });
    const payRecipient = vi.fn().mockResolvedValue({ paymentReference: "perflo-1" });

    await expect(requestManualPayment(
      { emailId: "email-1", confirmedByOwner: false },
      { loadPayableEmail, claimPayment, payRecipient },
    )).rejects.toThrow(/owner confirmation/i);

    expect(claimPayment).not.toHaveBeenCalled();
    expect(payRecipient).not.toHaveBeenCalled();
  });

  it("uses payment details loaded from the database, never an amount supplied by the browser", async () => {
    const loadPayableEmail = vi.fn().mockResolvedValue(payable);
    const claimPayment = vi.fn().mockResolvedValue({ intentId: "intent-1", idempotencyKey: "idem-1" });
    const payRecipient = vi.fn().mockResolvedValue({ paymentReference: "perflo-1" });

    const result = await requestManualPayment(
      { emailId: "email-1", confirmedByOwner: true },
      { loadPayableEmail, claimPayment, payRecipient },
    );

    expect(claimPayment).toHaveBeenCalledWith("email-1");
    expect(payRecipient).toHaveBeenCalledWith({
      nickname: "riya-sharma",
      amount: "500",
      currency: "INR",
      idempotencyKey: "idem-1",
    });
    expect(result).toEqual({ intentId: "intent-1", paymentReference: "perflo-1" });
  });

  it("does not call Perflo when another worker already owns the payment claim", async () => {
    const payRecipient = vi.fn();

    await expect(requestManualPayment(
      { emailId: "email-1", confirmedByOwner: true },
      {
        loadPayableEmail: vi.fn().mockResolvedValue(payable),
        claimPayment: vi.fn().mockResolvedValue(null),
        payRecipient,
      },
    )).rejects.toThrow(/already being processed/i);

    expect(payRecipient).not.toHaveBeenCalled();
  });
});
