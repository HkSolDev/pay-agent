-- Written by hand, not by `prisma migrate dev`: that command refuses to
-- run non-interactively on a change it flags as data-lossy (drop + recreate
-- the column). It's not actually lossy done this way — CREATE TYPE, then
-- ALTER COLUMN ... USING to cast existing text values into the enum,
-- keeping every row's real status intact.

CREATE TYPE "PaymentIntentStatus" AS ENUM ('pending', 'claimed', 'paid', 'failed', 'unknown_outcome');

ALTER TABLE "payment_intents"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PaymentIntentStatus" USING ("status"::"PaymentIntentStatus"),
  ALTER COLUMN "status" SET DEFAULT 'pending';
