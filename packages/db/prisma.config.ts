import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Load the repo-root .env explicitly — dotenv/config's default (cwd-relative)
// only works when you happen to run this from packages/db itself, which
// breaks `pnpm --dir packages/db exec prisma ...` run from the repo root.
config({ path: new URL("../../.env", import.meta.url) });

// Prisma 7 config: the CLI (generate/migrate) reads the connection from here.
// The runtime client gets its own adapter instance separately — see prisma/client.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
