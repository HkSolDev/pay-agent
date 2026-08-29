import "dotenv/config";
import { connectGmail } from "./gmail.js";

// Run this once, by hand: `pnpm connect-gmail`
// It is not part of the cron loop — the worker never initiates OAuth itself.
connectGmail().catch((err) => {
  console.error("Gmail connect failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
