import type { PaymentIntentStatus } from "@perflo-ap-agent/db";

export type { PaymentIntentStatus };

/**
 * Call this in the `default` branch of any switch over PaymentIntentStatus.
 * If a new status is ever added to the enum without updating that switch,
 * this line fails to COMPILE — this is the specific class of bug that
 * already happened once in this project (claimPayment's WHERE clause only
 * covered 2 of 5 states, silently, until a second reviewer caught it).
 * A missed case is now a build error, not something a reviewer has to
 * remember to check for by hand.
 */
export function assertUnreachableStatus(status: never): never {
  throw new Error(`Unhandled payment status: ${String(status)}`);
}
