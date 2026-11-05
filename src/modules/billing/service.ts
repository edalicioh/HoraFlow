import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultDb } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { MAX_CENTS } from "@/lib/money";
import { withSqliteWriteTransaction } from "@/lib/sqlite-transaction";
import {
  listBillingPeriodAuditHistory,
  recordAuditLog,
} from "@/modules/audit/service";
import {
  billingPeriodDetailInclude,
  findCompetenceBillableEntries,
  getCompetenceDateBounds,
  type DbOrTx,
} from "./repository";
import {
  closeBillingPeriodSchema,
  previewMonthlyClosingSchema,
  reopenBillingPeriodSchema,
  validateBillingPeriodId,
} from "./schema";
import {
  formatBillingPeriodStatusLabel,
  formatPaymentStatusLabel,
  type BillingItemSnapshot,
  type BillingOverviewTotals,
  type BillingPeriodDetail,
  type BillingPeriodStatus,
  type BillingPeriodSummary,
  type CloseBillingPeriodInput,
  type DerivedPaymentStatus,
  type ListBillingPeriodsFilter,
  type MonthlyClosingPreview,
  type MonthlyClosingPreviewItem,
  type PaymentSummary,
  type PreviewMonthlyClosingInput,
  type ReopenBillingPeriodInput,
} from "./types";

export { formatBillingPeriodStatusLabel, formatPaymentStatusLabel };

const MAX_TOTAL_MINUTES = 60_000_000;

/**
 * Deriva o estado de pagamento sem persistir coluna redundante que possa divergir do saldo.
 * Competências `OPEN` ou `REOPENED` retornam `NOT_APPLICABLE` e não contam como dívida ativa.
 */
export function derivePaymentStatus(
  status: BillingPeriodStatus,
  totalCents: number,
  paidCents: number,
): DerivedPaymentStatus {
  if (status !== "CLOSED") {
    return "NOT_APPLICABLE";
  }

  if (totalCents === 0 || paidCents >= totalCents) {
    return "PAID";
  }

  if (paidCents <= 0) {
    return "UNPAID";
  }

  return "PARTIAL";
}

export function computePreviewSignature(input: {
  clientId: string;
  year: number;
  month: number;
  nextRevision: number;
  entries: Array<{
    id: string;
    workDate: string;
    durationMinutes: number;
    hourlyRateCents: number;
    amountCents: number;
    projectName: string;
    description: string | null;
  }>;
}): string {
  const payload = JSON.stringify({
    clientId: input.clientId,
    year: input.year,
    month: input.month,
    nextRevision: input.nextRevision,
    entries: input.entries.map((entry) => [
      entry.id,
      entry.workDate,
      entry.durationMinutes,
      entry.hourlyRateCents,
      entry.amountCents,
      entry.projectName,
      entry.description ?? "",
    ]),
  });

  return createHash("sha256").update(payload).digest("hex");
}

function sumEntrySnapshots(
  entries: Array<{ durationMinutes: number; amountCents: number }>,
): { totalMinutes: number; totalCents: number } {
  let minutesBig = 0n;
  let centsBig = 0n;

  for (const entry of entries) {
    minutesBig += BigInt(entry.durationMinutes);
    centsBig += BigInt(entry.amountCents);
  }

  if (minutesBig > BigInt(MAX_TOTAL_MINUTES)) {
    throw new ValidationError(
      "O total de minutos da competência excede o limite máximo suportado.",
    );
  }

  if (centsBig > BigInt(MAX_CENTS)) {
    throw new ValidationError(
      "O valor total da competência excede o limite máximo suportado.",
    );
  }

  return {
    totalMinutes: Number(minutesBig),
    totalCents: Number(centsBig),
  };
}

function mapBillingItemSnapshot(row: {
  id: string;
  billingPeriodId: string;
  timeEntryId: string;
  revision: number;
  releasedAt: Date | null;
  clientName: string;
  projectName: string;
  description: string | null;
  workDate: string;
  durationMinutes: number;
  hourlyRateCents: number;
  amountCents: number;
  billable: boolean;
  createdAt: Date;
}): BillingItemSnapshot {
  return {
    id: row.id,
    billingPeriodId: row.billingPeriodId,
    timeEntryId: row.timeEntryId,
    revision: row.revision,
    releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
    clientName: row.clientName,
    projectName: row.projectName,
    description: row.description,
    workDate: row.workDate,
    durationMinutes: row.durationMinutes,
    hourlyRateCents: row.hourlyRateCents,
    amountCents: row.amountCents,
    billable: row.billable,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapPaymentSummary(row: {
  id: string;
  billingPeriodId: string;
  revision: number;
  amountCents: number;
  paidAt: Date;
  method: string | null;
  note: string | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PaymentSummary {
  const iso = row.paidAt.toISOString();
  return {
    id: row.id,
    billingPeriodId: row.billingPeriodId,
    revision: row.revision,
    amountCents: row.amountCents,
    paidAt: iso,
    paidDate: iso.slice(0, 10),
    method: row.method,
    note: row.note,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type LoadedBillingPeriod = Prisma.BillingPeriodGetPayload<{
  include: typeof billingPeriodDetailInclude;
}>;

function mapBillingPeriodSummary(
  row: LoadedBillingPeriod,
): BillingPeriodSummary {
  const { competenceLabel } = getCompetenceDateBounds(row.year, row.month);
  const activeItems = row.items.filter((item) => item.releasedAt === null);
  const releasedItems = row.items.filter((item) => item.releasedAt !== null);

  const activePaymentsCurrentRevision = row.payments.filter(
    (payment) => payment.voidedAt === null && payment.revision === row.revision,
  );
  const allActivePayments = row.payments.filter(
    (payment) => payment.voidedAt === null,
  );
  const voidedPayments = row.payments.filter(
    (payment) => payment.voidedAt !== null,
  );

  const rawPaidCents = activePaymentsCurrentRevision.reduce(
    (acc, payment) => acc + payment.amountCents,
    0,
  );

  // Período reaberto ou aberto não é contado como dívida fechada ativa
  const paidCents = row.status === "CLOSED" ? rawPaidCents : 0;
  const balanceCents =
    row.status === "CLOSED" ? Math.max(0, row.totalCents - paidCents) : 0;
  const paymentStatus = derivePaymentStatus(
    row.status,
    row.totalCents,
    paidCents,
  );

  let canReopen = false;
  let reopenBlockedReason: string | null = null;

  if (row.status !== "CLOSED") {
    reopenBlockedReason =
      row.status === "REOPENED"
        ? "Esta competência já está reaberta."
        : "Apenas competências fechadas podem ser reabertas.";
  } else if (allActivePayments.length > 0) {
    reopenBlockedReason =
      "Existem pagamentos ativos registrados nesta competência. Estorne todos os pagamentos ativos antes de reabrir.";
  } else {
    canReopen = true;
  }

  const displayClientName = row.clientNameSnapshot ?? row.client.name;

  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    clientNameSnapshot: row.clientNameSnapshot,
    displayClientName,
    year: row.year,
    month: row.month,
    competenceLabel,
    revision: row.revision,
    status: row.status,
    totalMinutes: row.totalMinutes,
    totalCents: row.totalCents,
    paidCents,
    balanceCents,
    paymentStatus,
    activeItemCount: activeItems.length,
    releasedItemCount: releasedItems.length,
    activePaymentCount: allActivePayments.length,
    voidedPaymentCount: voidedPayments.length,
    canReopen,
    reopenBlockedReason,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    reopenedAt: row.reopenedAt ? row.reopenedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function buildBillingPeriodDetail(
  database: PrismaClient,
  row: LoadedBillingPeriod,
): Promise<BillingPeriodDetail> {
  const summary = mapBillingPeriodSummary(row);
  const activeItems = row.items
    .filter((item) => item.releasedAt === null)
    .map(mapBillingItemSnapshot);
  const releasedItems = row.items
    .filter((item) => item.releasedAt !== null)
    .map(mapBillingItemSnapshot);
  const payments = row.payments.map(mapPaymentSummary);
  const auditLogs = await listBillingPeriodAuditHistory(
    row.id,
    row.payments.map((payment) => payment.id),
    database,
  );

  return {
    ...summary,
    activeItems,
    releasedItems,
    payments,
    auditLogs,
  };
}

/**
 * Gera a prévia de fechamento mensal de um cliente/competência sem alterar o banco.
 */
export async function previewMonthlyClosing(
  input: PreviewMonthlyClosingInput,
  database: DbOrTx = defaultDb,
): Promise<MonthlyClosingPreview> {
  const parsed = previewMonthlyClosingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    throw new ValidationError(
      "Parâmetros de prévia de fechamento inválidos.",
      fieldErrors,
    );
  }

  const { clientId, year, month } = parsed.data;
  const client = await database.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true },
  });

  if (!client) {
    throw new NotFoundError("Cliente não encontrado.");
  }

  const existingPeriod = await database.billingPeriod.findUnique({
    where: {
      clientId_year_month: {
        clientId,
        year,
        month,
      },
    },
    include: {
      _count: {
        select: {
          items: true,
        },
      },
    },
  });

  const entries = await findCompetenceBillableEntries(
    database,
    clientId,
    year,
    month,
  );

  const nextRevision = !existingPeriod
    ? 1
    : existingPeriod.status === "OPEN" && existingPeriod._count.items === 0
      ? existingPeriod.revision
      : existingPeriod.revision + 1;

  const blockingReasons: string[] = [];

  if (existingPeriod?.status === "CLOSED") {
    blockingReasons.push("Esta competência já está fechada para este cliente.");
  }

  if (entries.length === 0) {
    blockingReasons.push(
      "Não há apontamentos faturáveis elegíveis para este cliente na competência selecionada.",
    );
  }

  const conflictingEntries = entries.filter(
    (entry) => entry.status === "BILLED" || entry.billingItems.length > 0,
  );

  if (
    conflictingEntries.length > 0 &&
    existingPeriod?.status !== "CLOSED"
  ) {
    blockingReasons.push(
      `Existem ${conflictingEntries.length} apontamento(s) já marcados como faturados ou vinculados a um item ativo.`,
    );
  }

  const items: MonthlyClosingPreviewItem[] = entries.map((entry) => ({
    timeEntryId: entry.id,
    projectId: entry.projectId,
    projectName: entry.project.name,
    clientName: client.name,
    workDate: entry.workDate,
    mode: entry.mode,
    durationMinutes: entry.durationMinutes,
    hourlyRateCents: entry.hourlyRateCents,
    amountCents: entry.amountCents,
    description: entry.description,
    status: entry.status,
    hasActiveBillingItem: entry.billingItems.length > 0,
  }));

  const { totalMinutes, totalCents } = sumEntrySnapshots(entries);
  const { competenceLabel } = getCompetenceDateBounds(year, month);

  const previewSignature = computePreviewSignature({
    clientId,
    year,
    month,
    nextRevision,
    entries: items.map((item) => ({
      id: item.timeEntryId,
      workDate: item.workDate,
      durationMinutes: item.durationMinutes,
      hourlyRateCents: item.hourlyRateCents,
      amountCents: item.amountCents,
      projectName: item.projectName,
      description: item.description,
    })),
  });

  return {
    clientId: client.id,
    clientName: client.name,
    year,
    month,
    competenceLabel,
    existingPeriodId: existingPeriod?.id ?? null,
    existingStatus: existingPeriod?.status ?? null,
    nextRevision,
    items,
    totalMinutes,
    totalCents,
    previewSignature,
    canClose: blockingReasons.length === 0,
    blockingReasons,
  };
}

/**
 * Confirma atomicamente o fechamento (ou refechamento) de uma competência mensal:
 * 1. Adquire lock de escrita SQLite imediato.
 * 2. Valida estado atual do período e unicidade `(clientId, year, month)`.
 * 3. Reconsulta apontamentos elegíveis e impede conflito de estado ou vazio.
 * 4. Verifica assinatura da prévia (`previewSignature`), quando informada.
 * 5. Congela snapshots em `BillingItem` (incluindo nomes de cliente/projeto e descrição).
 * 6. Marca apontamentos como `BILLED` e período como `CLOSED`.
 * 7. Registra auditoria completa dentro da mesma transação.
 */
export async function closeBillingPeriod(
  input: CloseBillingPeriodInput,
  database: PrismaClient = defaultDb,
): Promise<BillingPeriodDetail> {
  const parsed = closeBillingPeriodSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    throw new ValidationError(
      "Dados inválidos para fechamento de competência.",
      fieldErrors,
    );
  }

  const { clientId, year, month, previewSignature } = parsed.data;

  const closedRow = await withSqliteWriteTransaction(database, async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true },
    });

    if (!client) {
      throw new NotFoundError("Cliente não encontrado.");
    }

    const existingPeriod = await tx.billingPeriod.findUnique({
      where: {
        clientId_year_month: {
          clientId,
          year,
          month,
        },
      },
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (existingPeriod?.status === "CLOSED") {
      throw new ConflictError(
        "Esta competência já está fechada para este cliente.",
      );
    }

    const entries = await findCompetenceBillableEntries(
      tx,
      clientId,
      year,
      month,
    );

    if (entries.length === 0) {
      throw new ConflictError(
        "Não há apontamentos faturáveis elegíveis para fechar nesta competência.",
      );
    }

    const conflictingEntries = entries.filter(
      (entry) => entry.status === "BILLED" || entry.billingItems.length > 0,
    );

    if (conflictingEntries.length > 0) {
      throw new ConflictError(
        "Conflito de estado: um ou mais apontamentos já estão faturados ou vinculados a um fechamento ativo.",
      );
    }

    const targetRevision = !existingPeriod
      ? 1
      : existingPeriod.status === "OPEN" && existingPeriod._count.items === 0
        ? existingPeriod.revision
        : existingPeriod.revision + 1;

    const currentSignature = computePreviewSignature({
      clientId,
      year,
      month,
      nextRevision: targetRevision,
      entries: entries.map((entry) => ({
        id: entry.id,
        workDate: entry.workDate,
        durationMinutes: entry.durationMinutes,
        hourlyRateCents: entry.hourlyRateCents,
        amountCents: entry.amountCents,
        projectName: entry.project.name,
        description: entry.description,
      })),
    });

    if (
      previewSignature !== undefined &&
      previewSignature !== null &&
      previewSignature.trim() !== "" &&
      previewSignature.trim() !== currentSignature
    ) {
      throw new ConflictError(
        "Os apontamentos da competência mudaram desde a geração da prévia. Atualize a prévia antes de confirmar o fechamento.",
      );
    }

    const { totalMinutes, totalCents } = sumEntrySnapshots(entries);
    const now = new Date();

    const beforeSnapshot = existingPeriod
      ? {
          id: existingPeriod.id,
          clientId: existingPeriod.clientId,
          year: existingPeriod.year,
          month: existingPeriod.month,
          revision: existingPeriod.revision,
          status: existingPeriod.status,
          clientNameSnapshot: existingPeriod.clientNameSnapshot,
          totalMinutes: existingPeriod.totalMinutes,
          totalCents: existingPeriod.totalCents,
          closedAt: existingPeriod.closedAt?.toISOString() ?? null,
          reopenedAt: existingPeriod.reopenedAt?.toISOString() ?? null,
        }
      : null;

    const period = existingPeriod
      ? await tx.billingPeriod.update({
          where: { id: existingPeriod.id },
          data: {
            revision: targetRevision,
            status: "CLOSED",
            clientNameSnapshot: client.name,
            totalMinutes,
            totalCents,
            closedAt: now,
          },
        })
      : await tx.billingPeriod.create({
          data: {
            clientId,
            year,
            month,
            revision: targetRevision,
            status: "CLOSED",
            clientNameSnapshot: client.name,
            totalMinutes,
            totalCents,
            closedAt: now,
          },
        });

    const createdItems = [];
    for (const entry of entries) {
      const createdItem = await tx.billingItem.create({
        data: {
          billingPeriodId: period.id,
          timeEntryId: entry.id,
          revision: targetRevision,
          releasedAt: null,
          clientName: client.name,
          projectName: entry.project.name,
          description: entry.description,
          workDate: entry.workDate,
          durationMinutes: entry.durationMinutes,
          hourlyRateCents: entry.hourlyRateCents,
          amountCents: entry.amountCents,
          billable: entry.billable,
        },
      });
      createdItems.push(createdItem);
    }

    await tx.timeEntry.updateMany({
      where: {
        id: {
          in: entries.map((entry) => entry.id),
        },
      },
      data: {
        status: "BILLED",
        updatedAt: now,
      },
    });

    await recordAuditLog(tx, {
      entity: "BillingPeriod",
      entityId: period.id,
      action: existingPeriod?.status === "REOPENED" ? "RECLOSE" : "CLOSE",
      before: beforeSnapshot,
      after: {
        id: period.id,
        clientId: period.clientId,
        clientNameSnapshot: period.clientNameSnapshot,
        year: period.year,
        month: period.month,
        revision: period.revision,
        status: period.status,
        totalMinutes: period.totalMinutes,
        totalCents: period.totalCents,
        closedAt: period.closedAt?.toISOString() ?? null,
        itemCount: createdItems.length,
        items: createdItems.map((item) => ({
          id: item.id,
          timeEntryId: item.timeEntryId,
          revision: item.revision,
          clientName: item.clientName,
          projectName: item.projectName,
          description: item.description,
          workDate: item.workDate,
          durationMinutes: item.durationMinutes,
          hourlyRateCents: item.hourlyRateCents,
          amountCents: item.amountCents,
        })),
      },
      origin: input.origin ?? "local",
    });

    const reloaded = await tx.billingPeriod.findUnique({
      where: { id: period.id },
      include: billingPeriodDetailInclude,
    });

    if (!reloaded) {
      throw new NotFoundError("Competência não encontrada após fechamento.");
    }

    return reloaded;
  });

  return buildBillingPeriodDetail(database, closedRow);
}

/**
 * Reabre atomicamente uma competência `CLOSED` sem pagamentos ativos:
 * 1. Adquire lock de escrita SQLite imediato.
 * 2. Verifica na mesma transação que o período está `CLOSED` e não possui pagamentos ativos (`voidedAt: null`).
 * 3. Preenche `releasedAt` nos `BillingItem` ativos da versão, preservando histórico.
 * 4. Retorna os `TimeEntry` correspondentes para `DRAFT`.
 * 5. Marca o período como `REOPENED` com `reopenedAt` preenchido.
 * 6. Registra auditoria com o motivo obrigatório e snapshots da versão liberada.
 */
export async function reopenBillingPeriod(
  input: ReopenBillingPeriodInput,
  database: PrismaClient = defaultDb,
): Promise<BillingPeriodDetail> {
  const parsed = reopenBillingPeriodSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    throw new ValidationError(
      "Dados inválidos para reabertura da competência.",
      fieldErrors,
    );
  }

  const { billingPeriodId, reason } = parsed.data;

  const reopenedRow = await withSqliteWriteTransaction(database, async (tx) => {
    const period = await tx.billingPeriod.findUnique({
      where: { id: billingPeriodId },
      include: {
        items: {
          where: { releasedAt: null },
        },
        payments: {
          where: { voidedAt: null },
        },
      },
    });

    if (!period) {
      throw new NotFoundError("Competência não encontrada.");
    }

    if (period.status !== "CLOSED") {
      throw new ConflictError(
        "Apenas competências fechadas podem ser reabertas.",
      );
    }

    if (period.payments.length > 0) {
      throw new ConflictError(
        "Não é possível reabrir uma competência com pagamentos ativos. Estorne todos os pagamentos ativos antes de reabrir.",
      );
    }

    const now = new Date();
    const activeTimeEntryIds = period.items.map((item) => item.timeEntryId);

    const beforeSnapshot = {
      id: period.id,
      clientId: period.clientId,
      clientNameSnapshot: period.clientNameSnapshot,
      year: period.year,
      month: period.month,
      revision: period.revision,
      status: period.status,
      totalMinutes: period.totalMinutes,
      totalCents: period.totalCents,
      closedAt: period.closedAt?.toISOString() ?? null,
      reopenedAt: period.reopenedAt?.toISOString() ?? null,
      activeItemIds: period.items.map((item) => item.id),
      activeTimeEntryIds,
    };

    if (period.items.length > 0) {
      await tx.billingItem.updateMany({
        where: {
          billingPeriodId: period.id,
          releasedAt: null,
        },
        data: {
          releasedAt: now,
        },
      });
    }

    if (activeTimeEntryIds.length > 0) {
      await tx.timeEntry.updateMany({
        where: {
          id: {
            in: activeTimeEntryIds,
          },
        },
        data: {
          status: "DRAFT",
          updatedAt: now,
        },
      });
    }

    const updatedPeriod = await tx.billingPeriod.update({
      where: { id: period.id },
      data: {
        status: "REOPENED",
        reopenedAt: now,
      },
    });

    await recordAuditLog(tx, {
      entity: "BillingPeriod",
      entityId: period.id,
      action: "REOPEN",
      before: beforeSnapshot,
      after: {
        id: updatedPeriod.id,
        clientId: updatedPeriod.clientId,
        clientNameSnapshot: updatedPeriod.clientNameSnapshot,
        year: updatedPeriod.year,
        month: updatedPeriod.month,
        revision: updatedPeriod.revision,
        status: updatedPeriod.status,
        totalMinutes: updatedPeriod.totalMinutes,
        totalCents: updatedPeriod.totalCents,
        closedAt: updatedPeriod.closedAt?.toISOString() ?? null,
        reopenedAt: updatedPeriod.reopenedAt?.toISOString() ?? null,
        reason,
        releasedItemCount: period.items.length,
        releasedTimeEntryIds: activeTimeEntryIds,
      },
      origin: input.origin ?? "local",
    });

    const reloaded = await tx.billingPeriod.findUnique({
      where: { id: period.id },
      include: billingPeriodDetailInclude,
    });

    if (!reloaded) {
      throw new NotFoundError("Competência não encontrada após reabertura.");
    }

    return reloaded;
  });

  return buildBillingPeriodDetail(database, reopenedRow);
}

export async function getBillingPeriodDetail(
  id: string,
  database: PrismaClient = defaultDb,
): Promise<BillingPeriodDetail> {
  const validId = validateBillingPeriodId(id);
  const row = await database.billingPeriod.findUnique({
    where: { id: validId },
    include: billingPeriodDetailInclude,
  });

  if (!row) {
    throw new NotFoundError("Competência não encontrada.");
  }

  return buildBillingPeriodDetail(database, row);
}

export async function listBillingPeriods(
  filter: ListBillingPeriodsFilter = {},
  database: PrismaClient = defaultDb,
): Promise<BillingPeriodSummary[]> {
  const where: Prisma.BillingPeriodWhereInput = {};

  if (filter.clientId && filter.clientId.trim() !== "") {
    where.clientId = filter.clientId.trim();
  }

  if (filter.year !== undefined) {
    where.year = filter.year;
  }

  if (filter.month !== undefined) {
    where.month = filter.month;
  }

  if (filter.status && filter.status !== "ALL") {
    where.status = filter.status;
  }

  const rows = await database.billingPeriod.findMany({
    where,
    include: billingPeriodDetailInclude,
    orderBy: [{ year: "desc" }, { month: "desc" }, { updatedAt: "desc" }],
  });

  const summaries = rows.map(mapBillingPeriodSummary);

  if (filter.paymentStatus && filter.paymentStatus !== "ALL") {
    return summaries.filter(
      (summary) => summary.paymentStatus === filter.paymentStatus,
    );
  }

  return summaries;
}

export function computeBillingOverviewTotals(
  periods: BillingPeriodSummary[],
): BillingOverviewTotals {
  let closedCount = 0;
  let reopenedCount = 0;
  let totalClosedMinutes = 0;
  let totalClosedCents = 0;
  let totalPaidCents = 0;
  let totalOpenBalanceCents = 0;

  for (const period of periods) {
    if (period.status === "CLOSED") {
      closedCount += 1;
      totalClosedMinutes += period.totalMinutes;
      totalClosedCents += period.totalCents;
      totalPaidCents += period.paidCents;
      totalOpenBalanceCents += period.balanceCents;
    } else if (period.status === "REOPENED") {
      reopenedCount += 1;
    }
  }

  return {
    closedCount,
    reopenedCount,
    totalClosedMinutes,
    totalClosedCents,
    totalPaidCents,
    totalOpenBalanceCents,
  };
}
