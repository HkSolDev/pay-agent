/** Shared domain boundary. Payment and policy logic will live here, outside the UI. */
export type QueueStatus = "received" | "needs_approval" | "quarantined" | "ready_to_pay" | "paid";
