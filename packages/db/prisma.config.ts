import "dotenv/config";
import { defineConfig, env } from "prisma/config";

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
