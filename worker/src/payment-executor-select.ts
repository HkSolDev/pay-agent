import { payViaPerfloCli } from "./perflo-cli";
import { createPerfloExecutor } from "./payment-executor-perflo";
import { createRazorpayExecutor } from "./payment-executor-razorpay";
import { payoutResultToLegacyPayResult } from "./payment-executor-adapter";
import { decimalStringToMinorUnits } from "./payment-amount";
import { loadApprovedPayees } from "./payee-store";
import { paymentMethodToPayoutDestination } from "./payment-executor-destination";

// Shared by the app's manual "Confirm & pay" (app/app/actions.ts) and the
// worker's auto-pay execution (auto-pay-runner.ts) — both must route through
// the exact same executor-selection logic, or the two paths could silently
// diverge on which provider a payment actually goes through. RazorpayX
// (sandbox/test-mode only) is used only when its test keys are configured;
// unset leaves Perflo as the default so existing behavior for anyone not
// opting in is unchanged. Both are just implementations of the same
// PaymentExecutor interface — see payment-executor.ts.
export async function payViaConfiguredExecutor(args: {
  nickname: string;
  amount: string;
  currency: "INR" | "USD";
  idempotencyKey: string;
}): Promise<{ paymentReference: string }> {
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
  // The RazorpayX business/customer-identifier account being debited — a
  // required field on the real Payouts API (`account_number`), distinct
  // from the recipient's own bank/UPI details. See payment-executor-razorpay.ts.
  const razorpayAccountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER;

  if (razorpayKeyId && razorpayKeySecret && razorpayAccountNumber) {
    const approvedPayees = await loadApprovedPayees();
    const payee = approvedPayees.find((p) => p.recipientNickname === args.nickname);
    if (!payee) {
      // Nothing has been sent to Razorpay yet — safe to mark failed (not
      // unknown) and let the owner retry once the payee record is fixed.
      throw new Error(`No approved payee rail found for recipient "${args.nickname}" — cannot route to RazorpayX.`);
    }
    const { destination, rail } = paymentMethodToPayoutDestination(payee.paymentMethod);
    const executor = createRazorpayExecutor({ keyId: razorpayKeyId, keySecret: razorpayKeySecret, accountNumber: razorpayAccountNumber });
    const result = await executor.createPayout({
      recipientName: payee.recipientNickname,
      currency: args.currency,
      rail,
      destination,
      amountMinor: decimalStringToMinorUnits(args.amount),
      idempotencyKey: args.idempotencyKey,
    });
    return payoutResultToLegacyPayResult(result);
  }

  const executor = createPerfloExecutor({ recipientNickname: args.nickname, payViaPerfloCli });
  const result = await executor.createPayout({
    recipientName: args.nickname,
    currency: args.currency,
    rail: "upi", // unused by the Perflo adapter — it addresses recipients by nickname, not rail.
    destination: { kind: "upi", vpa: "" },
    amountMinor: decimalStringToMinorUnits(args.amount),
    idempotencyKey: args.idempotencyKey,
  });
  return payoutResultToLegacyPayResult(result);
}
