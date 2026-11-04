import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const TEST_ROOT = "/tmp/opencode";

export type TestDatabase = {
  url: string;
  filePath: string;
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
};

export function createTestDatabaseUrl(prefix: string): {
  url: string;
  filePath: string;
} {
  mkdirSync(TEST_ROOT, { recursive: true, mode: 0o700 });
  const filePath = path.join(
    TEST_ROOT,
    `horaflow-f0-${prefix}-${randomUUID()}.db`,
  );

  return {
    url: `file:${filePath}`,
    filePath,
  };
}

export function prepareDatabase(url: string): void {
  execFileSync(process.execPath, ["scripts/prepare-local-db.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

export function deployMigrations(url: string): string {
  return execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    stdio: "pipe",
  });
}

export function createClient(url: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url, timeout: 5_000 });
  return new PrismaClient({ adapter });
}

export function createTestDatabase(prefix: string): TestDatabase {
  const { url, filePath } = createTestDatabaseUrl(prefix);
  prepareDatabase(url);
  deployMigrations(url);
  const prisma = createClient(url);

  return {
    url,
    filePath,
    prisma,
    async cleanup() {
      await prisma.$disconnect();
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(`${filePath}${suffix}`, { force: true });
      }
    },
  };
}
