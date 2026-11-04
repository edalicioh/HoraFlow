import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  horaflowPrisma?: PrismaClient;
};

export function createPrismaClient(url: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url, timeout: 5_000 });
  return new PrismaClient({ adapter });
}

export const prisma =
  globalForPrisma.horaflowPrisma ?? createPrismaClient(getDatabaseUrl());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.horaflowPrisma = prisma;
}
