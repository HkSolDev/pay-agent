import "dotenv/config";
import { retryLevel1Processing } from "./ingest.js";

const emailId = process.argv[2]?.trim();
if (!emailId) {
  console.error("Usage: tsx worker/src/retry-level1-cli.ts <email-id>");
  process.exitCode = 1;
} else {
  retryLevel1Processing(emailId)
    .then(() => console.log(`[review-retry] reprocessed ${emailId}`))
    .catch((error) => {
      console.error(`[review-retry] failed for ${emailId}:`, error);
      process.exitCode = 1;
    });
}
