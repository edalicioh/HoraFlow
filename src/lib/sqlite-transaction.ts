import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { SETTINGS_ID } from "@/modules/settings/schema";

const MAX_SQLITE_WRITE_RETRIES = 6;

export function isRetryableSqliteConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";

  return (
    code === "P2034" ||
    code === "P1008" ||
    code === "SQLITE_BUSY" ||
    message.includes("SQLITE_BUSY") ||
    message.includes("database is locked") ||
    message.includes("SocketTimeout") ||
    message.includes("Transaction failed due to a write conflict")
  );
}

/**
 * Promove imediatamente a transação `BEGIN DEFERRED` do `@prisma/adapter-better-sqlite3`
 * para lock de escrita no SQLite (WAL) antes de qualquer leitura crítica.
 * Isso evita `SQLITE_BUSY_SNAPSHOT` e garante serialização real entre conexões
 * e processos independentes.
 */
export async function acquireSqliteWriteLock(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.settings.upsert({
    where: { id: SETTINGS_ID },
    update: { currency: "BRL" },
    create: { id: SETTINGS_ID },
  });
}

/**
 * Executa uma transação de escrita no SQLite adquirindo o lock de escrita
 * imediatamente no início e repetindo a operação inteira (incluindo todas as
 * leituras e validações internas) em caso de contenção transitória de lock.
 */
export async function withSqliteWriteTransaction<T>(
  database: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SQLITE_WRITE_RETRIES; attempt += 1) {
    try {
      return await database.$transaction(
        async (tx) => {
          await acquireSqliteWriteLock(tx);
          return operation(tx);
        },
        {
          timeout: 15_000,
          maxWait: 10_000,
        },
      );
    } catch (error) {
      if (
        attempt === MAX_SQLITE_WRITE_RETRIES ||
        !isRetryableSqliteConflict(error)
      ) {
        throw error;
      }

      const backoffMs = attempt * 25;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw new Error("Falha ao concluir transação SQLite após múltiplas tentativas.");
}
