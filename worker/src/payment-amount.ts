/**
 * The rest of the codebase stores/displays amounts as decimal strings
 * ("500", "500.50") — see PaymentIntent.amount. The PaymentExecutor
 * boundary deliberately never touches that representation (see
 * payment-executor.ts's header comment on integer minor units), so this is
 * the one, explicit place the conversion happens.
 */
export function decimalStringToMinorUnits(amount: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) {
    throw new Error(`Cannot convert "${amount}" to minor units: expected a plain amount with at most 2 decimal places.`);
  }
  const [, whole, fraction = ""] = match;
  const paddedFraction = fraction.padEnd(2, "0");
  return BigInt(whole) * BigInt(100) + BigInt(paddedFraction || "0");
}
