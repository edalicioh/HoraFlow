import { defineConfig } from "prisma/config";
import { loadProjectEnv } from "./scripts/load-env.mjs";
import { resolveDatabaseUrl } from "./scripts/database-url.mjs";

loadProjectEnv();

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/horaflow.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveDatabaseUrl(databaseUrl),
  },
});
