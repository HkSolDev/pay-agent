import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Load the repo-root .env explicitly, not cwd-relative: `next dev` runs with
// cwd = app/, which has no .env of its own, so the default `dotenv/config`
// behavior would silently find nothing and DATABASE_URL would be undefined.
// A plain string path, not a URL object — dotenv needs the former.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

// One adapter/client per process. Both app/ and worker/ import this same
// file so they never end up with two separate connection pools by accident.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
