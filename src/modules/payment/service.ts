import type { PrismaClient } from "@/generated/prisma/client";
import { formatInstantInTimeZone, localDateTimeToUtc } from "@/lib/datetime";
import { prisma as defaultDb } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { formatCentsAsBRL } from "@/lib/money";
import { withSqliteWriteTransaction } from "@/lib/sqlite-transaction";
import { recordAuditLog } from "@/modules/audit/service";
import { mapPaymentSummary } from "@/modules/billing/service";
import { SETTINGS_ID } from "@/modules/settings/schema";
import { validateCreatePaymentFields, voidPaymentSchema } from "./schema";
import type {
  CreatePaymentInput,
  PaymentSummary,
  VoidPaymentInput,
} from "./types";

/**
 * Converte a data civil `YYYY-MM-DD` para instante UTC no meio-dia (`12:00`)
 * do fuso configurado em `Settings`, garantindo que a data civil UTC (`YYYY-MM-DD`)
 * permaneça idêntica e imutável mesmo se o fuso global mudar posteriormente.
 */
export function resolvePaymentUtcInstant(
  paidDate: string,
  timeZone: string,
): Date {
  const candidate = localDateTimeToUtc(paidDate, "12:00", timeZone);
  if (candidate.toISOString().slice(0, 10) === paidDate) {
    return candidate;
  }
  return new Date(`${paidDate}T12:00:00.000Z`);
}

/**
 * Registra atomicamente um pagamento total ou parcial em uma competência `CLOSED`:
 * 1. Adquire lock de escrita SQLite imediato.
 * 2. Trata submissão duplicada de forma idempotente quando `operationId` já foi persistido.
 * 3. Garante que a competência está `CLOSED`.
 * 4. Soma pagamentos ativos da revisão atual e rejeita sobrepagamento (`somaAtiva + novo > totalCents`).
 * 5. Grava `Payment` e `AuditLog` na mesma transação.
 */
export async function createPayment(
  input: CreatePaymentInput,
  database: PrismaClient = defaultDb,
): Promise<PaymentSummary> {
  const parsed = validateCreatePaymentFields(input);

  return withSqliteWriteTransaction(database, async (tx) => {
    if (parsed.operationId) {
      const existingByOperation = await tx.payment.findUnique({
        where: { id: parsed.operationId },
      });

      if (existingByOperation) {
        if (existingByOperation.billingPeriodId !== parsed.billingPeriodId) {
          throw new ConflictError(
            "Identificador de operação já utilizado em outra competência.",
          );
        }
        return mapPaymentSummary(existingByOperation);
      }
    }

    const settings = await tx.settings.findUnique({
      where: { id: SETTINGS_ID },
      select: { timezone: true },
    });
    const timeZone = settings?.timezone ?? "America/Sao_Paulo";

    const effectivePaidDate = parsed.paidAt
      ? formatInstantInTimeZone(parsed.paidAt, timeZone).date
      : parsed.paidDate!;
    const paidAt = resolvePaymentUtcInstant(effectivePaidDate, timeZone);

    const period = await tx.billingPeriod.findUnique({
      where: { id: parsed.billingPeriodId },
    });

    if (!period) {
      throw new NotFoundError("Competência não encontrada.");
    }

    if (period.status !== "CLOSED") {
      throw new ConflictError(
        "Pagamentos só podem ser registrados em competências fechadas.",
      );
    }

    const activePayments = await tx.payment.findMany({
      where: {
        billingPeriodId: period.id,
        revision: period.revision,
        voidedAt: null,
      },
      select: {
        id: true,
        amountCents: true,
      },
    });

    const activePaidBig = activePayments.reduce(
      (acc, item) => acc + BigInt(item.amountCents),
      0n,
    );
    const nextPaidBig = activePaidBig + BigInt(parsed.amountCents);
    const totalBig = BigInt(period.totalCents);

    if (nextPaidBig > totalBig) {
      const remainingCents = Math.max(
        0,
        period.totalCents - Number(activePaidBig),
      );
      throw new ConflictError(
        `O valor informado (${formatCentsAsBRL(parsed.amountCents)}) excede o saldo em aberto da competência (${formatCentsAsBRL(remainingCents)}).`,
      );
    }

    const created = await tx.payment.create({
      data: {
        ...(parsed.operationId ? { id: parsed.operationId } : {}),
        billingPeriodId: period.id,
        revision: period.revision,
        amountCents: parsed.amountCents,
        paidAt,
        method: parsed.method,
        note: parsed.note,
        voidedAt: null,
      },
    });

    const balanceAfterCents = period.totalCents - Number(nextPaidBig);

    await recordAuditLog(tx, {
      entity: "Payment",
      entityId: created.id,
      action: "CREATE",
      before: null,
      after: {
        id: created.id,
        billingPeriodId: created.billingPeriodId,
        revision: created.revision,
        amountCents: created.amountCents,
        paidAt: created.paidAt.toISOString(),
        paidDate: created.paidAt.toISOString().slice(0, 10),
        method: created.method,
        note: created.note,
        voidedAt: null,
        operationId: parsed.operationId,
        balanceAfterCents,
      },
      origin: input.origin ?? "local",
    });

    return mapPaymentSummary(created);
  });
}

/**
 * Estorna logicamente um pagamento (`voidedAt` preenchido), preservando valor e data
 * originais, exigindo motivo não vazio e gravando auditoria antes/depois na mesma transação.
 */
export async function voidPayment(
  input: VoidPaymentInput,
  database: PrismaClient = defaultDb,
): Promise<PaymentSummary> {
  const parsed = voidPaymentSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    throw new ValidationError(
      "Dados inválidos para estorno do pagamento.",
      fieldErrors,
    );
  }

  const { paymentId, reason } = parsed.data;

  return withSqliteWriteTransaction(database, async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundError("Pagamento não encontrado.");
    }

    if (payment.voidedAt !== null) {
      throw new ConflictError("Este pagamento já foi estornado anteriormente.");
    }

    const now = new Date();

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        voidedAt: now,
      },
    });

    await recordAuditLog(tx, {
      entity: "Payment",
      entityId: payment.id,
      action: "VOID",
      before: {
        id: payment.id,
        billingPeriodId: payment.billingPeriodId,
        revision: payment.revision,
        amountCents: payment.amountCents,
        paidAt: payment.paidAt.toISOString(),
        paidDate: payment.paidAt.toISOString().slice(0, 10),
        method: payment.method,
        note: payment.note,
        voidedAt: null,
      },
      after: {
        id: updated.id,
        billingPeriodId: updated.billingPeriodId,
        revision: updated.revision,
        amountCents: updated.amountCents,
        paidAt: updated.paidAt.toISOString(),
        paidDate: updated.paidAt.toISOString().slice(0, 10),
        method: updated.method,
        note: updated.note,
        voidedAt: updated.voidedAt?.toISOString() ?? null,
        reason,
      },
      origin: input.origin ?? "local",
    });

    return mapPaymentSummary(updated);
  });
}
