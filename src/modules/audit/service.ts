import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma as db } from "@/lib/db";
import type { AuditLogSummary, AuditRecordInput } from "./types";

const FORBIDDEN_AUDIT_KEY_PATTERN =
  /^(password|secret|token|authorization|cookie|stack|stackTrace|rawFile|fileBuffer)$/i;

/**
 * Sanitiza objetos de auditoria para JSON seguro do Prisma, removendo chaves
 * sensíveis/stack traces e convertendo instantes `Date` para ISO-8601 UTC.
 */
export function sanitizeAuditPayload(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return sanitizeJsonNode(value);
}

function sanitizeJsonNode(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return null as unknown as Prisma.InputJsonValue;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonNode(item));
  }

  if (typeof value === "object") {
    const result: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (FORBIDDEN_AUDIT_KEY_PATTERN.test(key) || entryValue === undefined) {
        continue;
      }
      result[key] = sanitizeJsonNode(entryValue);
    }
    return result;
  }

  return String(value);
}

/**
 * Registra um evento de auditoria dentro da transação SQLite ativa.
 * Se a gravação da auditoria falhar, a transação inteira sofre rollback.
 */
export async function recordAuditLog(
  tx: Prisma.TransactionClient,
  input: AuditRecordInput,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      before: sanitizeAuditPayload(input.before ?? null),
      after: sanitizeAuditPayload(input.after ?? null),
      origin: input.origin ?? "local",
    },
  });
}

function toAuditSummary(row: {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  origin: string;
  createdAt: Date;
}): AuditLogSummary {
  return {
    id: row.id,
    entity: row.entity,
    entityId: row.entityId,
    action: row.action,
    before:
      row.before && typeof row.before === "object" && !Array.isArray(row.before)
        ? (row.before as Record<string, unknown>)
        : null,
    after:
      row.after && typeof row.after === "object" && !Array.isArray(row.after)
        ? (row.after as Record<string, unknown>)
        : null,
    origin: row.origin,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAuditLogsForEntity(
  entity: string,
  entityId: string,
  database: PrismaClient = db,
): Promise<AuditLogSummary[]> {
  const rows = await database.auditLog.findMany({
    where: { entity, entityId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return rows.map(toAuditSummary);
}

/**
 * Lista o histórico completo de auditoria de um fechamento (`BillingPeriod`)
 * e de todos os seus pagamentos (`Payment`), ordenado do evento mais recente
 * para o mais antigo.
 */
export async function listBillingPeriodAuditHistory(
  billingPeriodId: string,
  paymentIds: string[],
  database: PrismaClient = db,
): Promise<AuditLogSummary[]> {
  const orConditions: Prisma.AuditLogWhereInput[] = [
    { entity: "BillingPeriod", entityId: billingPeriodId },
  ];

  if (paymentIds.length > 0) {
    orConditions.push({
      entity: "Payment",
      entityId: { in: paymentIds },
    });
  }

  const rows = await database.auditLog.findMany({
    where: {
      OR: orConditions,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return rows.map(toAuditSummary);
}
