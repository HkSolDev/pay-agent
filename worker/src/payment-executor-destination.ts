import type { PaymentMethod } from "./payment-method-validation.js";
import type { PayoutDestination, PayoutRail } from "./payment-executor.js";

/** Maps this codebase's existing PaymentMethod (approved-payee rail) to the provider-neutral PayoutDestination/rail pair. */
export function paymentMethodToPayoutDestination(method: PaymentMethod): { destination: PayoutDestination; rail: PayoutRail } {
  if (method.kind === "upi") {
    return { destination: { kind: "upi", vpa: method.vpa }, rail: "upi" };
  }
  return {
    destination: { kind: "bank_transfer", accountNumber: method.accountNumber, ifsc: method.ifsc },
    rail: "bank_transfer",
  };
}
