import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  formatCivilDate,
  formatInstantInTimeZone,
  formatYearMonthLabelPtBR,
  getDayOfWeekFromCivilDate,
  getDaysInMonth,
  getTodayCivilDateInTimeZone,
  intervalsOverlap,
  isWeekendCivilDate,
  parseCivilDate,
  resolveIntervalWindow,
} from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { MAX_DURATION_MINUTES } from "@/lib/duration";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { calculateTimeEntryAmountCents } from "@/lib/money";
import { resolveHourlyRate } from "@/lib/rates";
import { clientIdSchema } from "@/modules/client/schema";
import { projectIdSchema } from "@/modules/project/schema";
import { SETTINGS_ID } from "@/modules/settings/schema";
import { getSettings } from "@/modules/settings/service";
import {
  timeEntryWithProjectAndBillingInclude,
  type TimeEntryDbClientLike,
} from "@/modules/time-entry/repository";
import {
  civilDateSchema,
  durationMinutesSchema,
  durationTextSchema,
  optionalExplicitRateCentsSchema,
  parseCalendarParams,
  parseTimeEntryListFilter,
  timeEntryDescriptionSchema,
  timeEntryIdSchema,
  type TimeEntryWriteInput,
} from "@/modules/time-entry/schema";
import type {
  CalendarDaySummary,
  MonthlyCalendarView,
  TimeEntryListFilter,
  TimeEntryListResult,
  TimeEntryRecord,
  TimeEntrySummary,
  TimeEntryTotals,
} from "@/modules/time-entry/types";

function timeEntrySnapshot(entry: TimeEntryRecord) {
  return {
    id: entry.id,
    projectId: entry.projectId,
    workDate: entry.workDate,
    mode: entry.mode,
    startAt: entry.startAt ? entry.startAt.toISOString() : null,
    endAt: entry.endAt ? entry.endAt.toISOString() : null,
    durationMinutes: entry.durationMinutes,
    description: entry.description,
    hourlyRateCents: entry.hourlyRateCents,
    amountCents: entry.amountCents,
    billable: entry.billable,
    status: entry.status,
    deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
  };
}

function validateTimeEntryId(id: string): string {
  const parsed = timeEntryIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new ValidationError("Identificador de apontamento inválido.", {
      id: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return parsed.data;
}

function isRetryableSqliteBusyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  if (code === "P1008" || code === "P2034") {
    return true;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  return (
    message.includes("SQLITE_BUSY") ||
    message.includes("database is locked") ||
    message.includes("SocketTimeout")
  );
}

/**
 * Executa uma transação Prisma garantindo repetição integral da operação
 * (incluindo nova validação de domínio e sobreposição) caso ocorra contenda
 * transitória de escrita (`SQLITE_BUSY` / `P1008`) entre conexões concorrentes.
 */
async function withSqliteWriteTransaction<T>(
  db: Pick<PrismaClient, "$transaction">,
  operation: (
    tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  ) => Promise<T>,
): Promise<T> {
  const maxAttempts = 6;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => operation(tx));
    } catch (error) {
      if (!isRetryableSqliteBusyError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }

      const backoffMs = 25 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

type ResolvedModeFields = {
  mode: "DURATION" | "INTERVAL";
  workDate: string;
  startAt: Date | null;
  endAt: Date | null;
  durationMinutes: number;
};

function resolveAndValidateWritePayload(
  input: TimeEntryWriteInput,
  timeZone: string,
): {
  projectId: string;
  clientId: string | null;
  description: string | null;
  billable: boolean;
  explicitHourlyRateCents: number | null | undefined;
  modeFields: ResolvedModeFields;
} {
  const projectParsed = projectIdSchema.safeParse(input.projectId);
  if (!projectParsed.success) {
    throw new ValidationError("Revise o projeto selecionado.", {
      projectId: projectParsed.error.issues.map((issue) => issue.message),
    });
  }

  let validatedClientId: string | null = null;
  if (input.clientId !== undefined && input.clientId !== null && input.clientId !== "") {
    const clientParsed = clientIdSchema.safeParse(input.clientId);
    if (!clientParsed.success) {
      throw new ValidationError("Revise o cliente selecionado.", {
        clientId: clientParsed.error.issues.map((issue) => issue.message),
      });
    }
    validatedClientId = clientParsed.data;
  }

  const descParsed = timeEntryDescriptionSchema.safeParse(input.description);
  if (!descParsed.success) {
    throw new ValidationError("Revise a descrição do apontamento.", {
      description: descParsed.error.issues.map((issue) => issue.message),
    });
  }

  const billableParsed = z.boolean().safeParse(input.billable ?? true);
  if (!billableParsed.success) {
    throw new ValidationError("Indicador faturável inválido.", {
      billable: ["Informe se o apontamento é faturável."],
    });
  }

  let explicitHourlyRateCents: number | null | undefined = undefined;
  if (input.hourlyRateCents !== undefined) {
    const rateParsed = optionalExplicitRateCentsSchema.safeParse(
      input.hourlyRateCents,
    );
    if (!rateParsed.success) {
      throw new ValidationError("Revise a tarifa informada.", {
        hourlyRateCents: rateParsed.error.issues.map((issue) => issue.message),
      });
    }
    explicitHourlyRateCents = rateParsed.data;
  }

  if (input.mode === "DURATION") {
    const dateParsed = civilDateSchema.safeParse(input.workDate);
    if (!dateParsed.success) {
      throw new ValidationError("Informe uma data civil válida.", {
        workDate: dateParsed.error.issues.map((issue) => issue.message),
      });
    }

    let durationMinutes: number;
    if (input.durationMinutes !== undefined) {
      const durParsed = durationMinutesSchema.safeParse(input.durationMinutes);
      if (!durParsed.success) {
        throw new ValidationError("Informe uma duração válida.", {
          durationMinutes: durParsed.error.issues.map((issue) => issue.message),
        });
      }
      durationMinutes = durParsed.data;
    } else if (input.durationText !== undefined) {
      const durTextParsed = durationTextSchema.safeParse(input.durationText);
      if (!durTextParsed.success) {
        throw new ValidationError("Informe uma duração válida no formato HH:mm.", {
          durationText: durTextParsed.error.issues.map(
            (issue) => issue.message,
          ),
        });
      }
      durationMinutes = durTextParsed.data;
    } else {
      throw new ValidationError("Informe a duração do apontamento.", {
        durationText: ["Informe a duração no formato HH:mm."],
      });
    }

    return {
      projectId: projectParsed.data,
      clientId: validatedClientId,
      description: descParsed.data,
      billable: billableParsed.data,
      explicitHourlyRateCents,
      modeFields: {
        mode: "DURATION",
        workDate: dateParsed.data,
        startAt: null,
        endAt: null,
        durationMinutes,
      },
    };
  }

  if (input.mode === "INTERVAL") {
    if ("startAt" in input && "endAt" in input) {
      if (
        !(input.startAt instanceof Date) ||
        Number.isNaN(input.startAt.getTime()) ||
        !(input.endAt instanceof Date) ||
        Number.isNaN(input.endAt.getTime())
      ) {
        throw new ValidationError("Informe instantes de início e término válidos.", {
          startTime: ["Instante de início ou término inválido."],
        });
      }

      const diffMs = input.endAt.getTime() - input.startAt.getTime();
      if (diffMs <= 0) {
        throw new ValidationError(
          "O término deve ser posterior ao início.",
          {
            endTime: ["O término deve ser posterior ao início."],
          },
        );
      }

      if (diffMs % 60_000 !== 0) {
        throw new ValidationError(
          "O intervalo deve ter precisão em minutos inteiros (sem segundos).",
          {
            endTime: ["Segundos ou subminutos não são permitidos."],
          },
        );
      }

      const durationMinutes = diffMs / 60_000;
      if (durationMinutes > MAX_DURATION_MINUTES) {
        throw new ValidationError(
          "A duração calculada excede o limite máximo permitido.",
          {
            endDate: ["O intervalo excede o limite máximo permitido."],
          },
        );
      }

      const startInZone = formatInstantInTimeZone(input.startAt, timeZone);
      const workDate =
        input.workDate !== undefined && input.workDate.trim().length > 0
          ? civilDateSchema.parse(input.workDate)
          : startInZone.date;

      return {
        projectId: projectParsed.data,
        clientId: validatedClientId,
        description: descParsed.data,
        billable: billableParsed.data,
        explicitHourlyRateCents,
        modeFields: {
          mode: "INTERVAL",
          workDate,
          startAt: input.startAt,
          endAt: input.endAt,
          durationMinutes,
        },
      };
    }

    const window = resolveIntervalWindow({
      startDate: input.startDate,
      startTime: input.startTime,
      endDate: input.endDate,
      endTime: input.endTime,
      timeZone,
    });

    return {
      projectId: projectParsed.data,
      clientId: validatedClientId,
      description: descParsed.data,
      billable: billableParsed.data,
      explicitHourlyRateCents,
      modeFields: {
        mode: "INTERVAL",
        workDate: window.workDate,
        startAt: window.startAt,
        endAt: window.endAt,
        durationMinutes: window.durationMinutes,
      },
    };
  }

  throw new ValidationError("Modalidade de apontamento inválida.");
}

async function assertBillingPeriodOpen(
  tx: Pick<PrismaClient, "billingPeriod">,
  clientId: string,
  workDate: string,
): Promise<void> {
  const parts = parseCivilDate(workDate);
  if (!parts) {
    throw new ValidationError("Data civil inválida.");
  }

  const period = await tx.billingPeriod.findUnique({
    where: {
      clientId_year_month: {
        clientId,
        year: parts.year,
        month: parts.month,
      },
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (period && period.status === "CLOSED") {
    throw new ConflictError(
      `A competência ${String(parts.month).padStart(2, "0")}/${parts.year} deste cliente está fechada. Reabra o período antes de registrar, alterar ou excluir apontamentos.`,
    );
  }
}

async function assertNoGlobalIntervalOverlap(
  tx: Pick<PrismaClient, "timeEntry">,
  startAt: Date,
  endAt: Date,
  timeZone: string,
  excludeEntryId?: string,
): Promise<void> {
  const conflicting = await tx.timeEntry.findFirst({
    where: {
      mode: "INTERVAL",
      deletedAt: null,
      ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    include: {
      project: {
        select: {
          name: true,
          client: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      startAt: "asc",
    },
  });

  if (
    conflicting &&
    conflicting.startAt &&
    conflicting.endAt &&
    intervalsOverlap(startAt, endAt, conflicting.startAt, conflicting.endAt)
  ) {
    const startFmt = formatInstantInTimeZone(conflicting.startAt, timeZone);
    const endFmt = formatInstantInTimeZone(conflicting.endAt, timeZone);

    throw new ConflictError(
      `Conflito de horário: o período informado se sobrepõe ao apontamento em "${conflicting.project.name}" (${conflicting.project.client.name}) de ${startFmt.dateTimePtBR} até ${endFmt.dateTimePtBR}. Intervalos ativos não podem se sobrepor.`,
    );
  }
}

export function computeTimeEntryTotals(
  entries: Array<{
    workDate: string;
    durationMinutes: number;
    amountCents: number;
    billable: boolean;
  }>,
): TimeEntryTotals {
  let totalMinutes = 0;
  let billableMinutes = 0;
  let nonBillableMinutes = 0;
  let totalCents = 0;
  const distinctDates = new Set<string>();

  for (const entry of entries) {
    totalMinutes += entry.durationMinutes;
    if (entry.billable) {
      billableMinutes += entry.durationMinutes;
      totalCents += entry.amountCents;
    } else {
      nonBillableMinutes += entry.durationMinutes;
    }
    distinctDates.add(entry.workDate);
  }

  return {
    totalMinutes,
    billableMinutes,
    nonBillableMinutes,
    totalCents,
    workedDaysCount: distinctDates.size,
    entryCount: entries.length,
  };
}

function mapTimeEntrySummary(
  row: {
    id: string;
    projectId: string;
    workDate: string;
    mode: "DURATION" | "INTERVAL";
    startAt: Date | null;
    endAt: Date | null;
    durationMinutes: number;
    description: string | null;
    hourlyRateCents: number;
    amountCents: number;
    billable: boolean;
    status: "DRAFT" | "BILLED" | "APPROVED";
    deletedAt: Date | null;
    importBatchId: string | null;
    createdAt: Date;
    updatedAt: Date;
    project: {
      id: string;
      name: string;
      active: boolean;
      hourlyRateCents: number | null;
      clientId: string;
      client: {
        id: string;
        name: string;
        active: boolean;
        hourlyRateCents: number | null;
      };
    };
    billingItems: Array<{
      id: string;
      billingPeriodId: string;
    }>;
  },
  timeZone: string,
  closedPeriodKeys: Set<string>,
): TimeEntrySummary {
  const parts = parseCivilDate(row.workDate);
  const periodKey = parts
    ? `${row.project.clientId}:${parts.year}:${parts.month}`
    : "";
  const isBillingPeriodClosed = closedPeriodKeys.has(periodKey);
  const hasActiveBillingItem = row.billingItems.length > 0;
  const isLocked =
    row.status !== "DRAFT" ||
    hasActiveBillingItem ||
    isBillingPeriodClosed ||
    row.deletedAt !== null;

  let startLocalDate: string | null = null;
  let startLocalTime: string | null = null;
  let endLocalDate: string | null = null;
  let endLocalTime: string | null = null;
  let intervalLabelPtBR: string | null = null;

  if (row.mode === "INTERVAL" && row.startAt && row.endAt) {
    const startFmt = formatInstantInTimeZone(row.startAt, timeZone);
    const endFmt = formatInstantInTimeZone(row.endAt, timeZone);
    startLocalDate = startFmt.date;
    startLocalTime = startFmt.time;
    endLocalDate = endFmt.date;
    endLocalTime = endFmt.time;
    intervalLabelPtBR =
      startFmt.date === endFmt.date
        ? `${startFmt.time} – ${endFmt.time}`
        : `${startFmt.dateTimePtBR} – ${endFmt.dateTimePtBR}`;
  }

  return {
    id: row.id,
    projectId: row.projectId,
    workDate: row.workDate,
    mode: row.mode,
    startAt: row.startAt,
    endAt: row.endAt,
    durationMinutes: row.durationMinutes,
    description: row.description,
    hourlyRateCents: row.hourlyRateCents,
    amountCents: row.amountCents,
    billable: row.billable,
    status: row.status,
    deletedAt: row.deletedAt,
    importBatchId: row.importBatchId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    clientId: row.project.client.id,
    clientName: row.project.client.name,
    clientActive: row.project.client.active,
    projectName: row.project.name,
    projectActive: row.project.active,
    hasActiveBillingItem,
    isBillingPeriodClosed,
    canEdit: !isLocked,
    canDelete: !isLocked,
    startLocalDate,
    startLocalTime,
    endLocalDate,
    endLocalTime,
    intervalLabelPtBR,
  };
}

export async function createTimeEntry(
  input: TimeEntryWriteInput,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<TimeEntryRecord> {
  return withSqliteWriteTransaction(db, async (tx) => {
    // 1. Primeira instrução de escrita na transação: promove imediatamente
    // a transação SQLite para lock de escrita (serializando criações concorrentes
    // entre conexões/processos antes de ler intervalos existentes).
    const settings = await tx.settings.upsert({
      where: { id: SETTINGS_ID },
      update: { currency: "BRL" },
      create: { id: SETTINGS_ID },
    });

    const parsed = resolveAndValidateWritePayload(input, settings.timezone);

    const project = await tx.project.findUnique({
      where: { id: parsed.projectId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            active: true,
            hourlyRateCents: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundError("Projeto informado não foi encontrado.", {
        projectId: ["Selecione um projeto cadastrado."],
      });
    }

    if (parsed.clientId && parsed.clientId !== project.clientId) {
      throw new ValidationError(
        "O projeto selecionado não pertence ao cliente informado.",
        {
          projectId: ["Selecione um projeto pertencente ao cliente escolhido."],
        },
      );
    }

    if (!project.client.active || !project.active) {
      throw new ConflictError(
        "Não é possível registrar novos apontamentos em cliente ou projeto inativo.",
        {
          projectId: [
            "Selecione um cliente e um projeto ativos para lançar horas.",
          ],
        },
      );
    }

    await assertBillingPeriodOpen(
      tx,
      project.clientId,
      parsed.modeFields.workDate,
    );

    if (
      parsed.modeFields.mode === "INTERVAL" &&
      parsed.modeFields.startAt &&
      parsed.modeFields.endAt
    ) {
      await assertNoGlobalIntervalOverlap(
        tx,
        parsed.modeFields.startAt,
        parsed.modeFields.endAt,
        settings.timezone,
      );
    }

    const hourlyRateCents =
      parsed.explicitHourlyRateCents !== undefined &&
      parsed.explicitHourlyRateCents !== null
        ? parsed.explicitHourlyRateCents
        : resolveHourlyRate({
            projectRateCents: project.hourlyRateCents,
            clientRateCents: project.client.hourlyRateCents,
            defaultRateCents: settings.defaultHourlyRateCents,
          });

    const amountCents = calculateTimeEntryAmountCents({
      durationMinutes: parsed.modeFields.durationMinutes,
      hourlyRateCents,
      billable: parsed.billable,
    });

    const created = await tx.timeEntry.create({
      data: {
        projectId: project.id,
        workDate: parsed.modeFields.workDate,
        mode: parsed.modeFields.mode,
        startAt: parsed.modeFields.startAt,
        endAt: parsed.modeFields.endAt,
        durationMinutes: parsed.modeFields.durationMinutes,
        description: parsed.description,
        hourlyRateCents,
        amountCents,
        billable: parsed.billable,
        status: "DRAFT",
      },
    });

    await tx.auditLog.create({
      data: {
        entity: "TimeEntry",
        entityId: created.id,
        action: "CREATE",
        before: undefined,
        after: timeEntrySnapshot(created),
        origin: "local",
      },
    });

    return created;
  });
}

export async function updateTimeEntry(
  id: string,
  input: TimeEntryWriteInput,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<TimeEntryRecord> {
  const validId = validateTimeEntryId(id);

  return withSqliteWriteTransaction(db, async (tx) => {
    // Promove a transação para lock de escrita antes das leituras
    const settings = await tx.settings.upsert({
      where: { id: SETTINGS_ID },
      update: { currency: "BRL" },
      create: { id: SETTINGS_ID },
    });

    const before = await tx.timeEntry.findUnique({
      where: { id: validId },
      include: {
        project: {
          select: {
            id: true,
            clientId: true,
          },
        },
        billingItems: {
          where: { releasedAt: null },
          select: { id: true },
        },
      },
    });

    if (!before || before.deletedAt !== null) {
      throw new NotFoundError("Apontamento não encontrado.");
    }

    if (before.status !== "DRAFT" || before.billingItems.length > 0) {
      throw new ConflictError(
        "Não é possível editar um apontamento já faturado.",
      );
    }

    await assertBillingPeriodOpen(
      tx,
      before.project.clientId,
      before.workDate,
    );

    const parsed = resolveAndValidateWritePayload(input, settings.timezone);

    const targetProject = await tx.project.findUnique({
      where: { id: parsed.projectId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            active: true,
            hourlyRateCents: true,
          },
        },
      },
    });

    if (!targetProject) {
      throw new NotFoundError("Projeto informado não foi encontrado.", {
        projectId: ["Selecione um projeto cadastrado."],
      });
    }

    if (parsed.clientId && parsed.clientId !== targetProject.clientId) {
      throw new ValidationError(
        "O projeto selecionado não pertence ao cliente informado.",
        {
          projectId: ["Selecione um projeto pertencente ao cliente escolhido."],
        },
      );
    }

    // Decisão aprovada em 2026-11-05: ao editar rascunho, permite manter o
    // mesmo projeto mesmo que o projeto ou cliente tenha sido desativado depois,
    // mas bloqueia transferir para outro projeto/cliente inativo.
    if (
      targetProject.id !== before.projectId &&
      (!targetProject.active || !targetProject.client.active)
    ) {
      throw new ConflictError(
        "Não é possível transferir o apontamento para um cliente ou projeto inativo.",
        {
          projectId: ["Selecione um cliente e projeto ativos."],
        },
      );
    }

    await assertBillingPeriodOpen(
      tx,
      targetProject.clientId,
      parsed.modeFields.workDate,
    );

    if (
      parsed.modeFields.mode === "INTERVAL" &&
      parsed.modeFields.startAt &&
      parsed.modeFields.endAt
    ) {
      await assertNoGlobalIntervalOverlap(
        tx,
        parsed.modeFields.startAt,
        parsed.modeFields.endAt,
        settings.timezone,
        before.id,
      );
    }

    // Decisão aprovada em 2026-11-05: preserva o snapshot `hourlyRateCents`
    // gravado por padrão, salvo alteração explícita pelo usuário.
    const hourlyRateCents =
      parsed.explicitHourlyRateCents !== undefined &&
      parsed.explicitHourlyRateCents !== null
        ? parsed.explicitHourlyRateCents
        : before.hourlyRateCents;

    const amountCents = calculateTimeEntryAmountCents({
      durationMinutes: parsed.modeFields.durationMinutes,
      hourlyRateCents,
      billable: parsed.billable,
    });

    const after = await tx.timeEntry.update({
      where: { id: before.id },
      data: {
        projectId: targetProject.id,
        workDate: parsed.modeFields.workDate,
        mode: parsed.modeFields.mode,
        startAt: parsed.modeFields.startAt,
        endAt: parsed.modeFields.endAt,
        durationMinutes: parsed.modeFields.durationMinutes,
        description: parsed.description,
        hourlyRateCents,
        amountCents,
        billable: parsed.billable,
      },
    });

    await tx.auditLog.create({
      data: {
        entity: "TimeEntry",
        entityId: after.id,
        action: "UPDATE",
        before: timeEntrySnapshot(before),
        after: timeEntrySnapshot(after),
        origin: "local",
      },
    });

    return after;
  });
}

export async function deleteTimeEntry(
  id: string,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<TimeEntryRecord> {
  const validId = validateTimeEntryId(id);

  return withSqliteWriteTransaction(db, async (tx) => {
    await tx.settings.upsert({
      where: { id: SETTINGS_ID },
      update: { currency: "BRL" },
      create: { id: SETTINGS_ID },
    });

    const before = await tx.timeEntry.findUnique({
      where: { id: validId },
      include: {
        project: {
          select: {
            clientId: true,
          },
        },
        billingItems: {
          where: { releasedAt: null },
          select: { id: true },
        },
      },
    });

    if (!before || before.deletedAt !== null) {
      throw new NotFoundError("Apontamento não encontrado.");
    }

    if (before.status !== "DRAFT" || before.billingItems.length > 0) {
      throw new ConflictError(
        "Não é possível excluir um apontamento já faturado.",
      );
    }

    await assertBillingPeriodOpen(
      tx,
      before.project.clientId,
      before.workDate,
    );

    const after = await tx.timeEntry.update({
      where: { id: before.id },
      data: {
        deletedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        entity: "TimeEntry",
        entityId: after.id,
        action: "DELETE",
        before: timeEntrySnapshot(before),
        after: timeEntrySnapshot(after),
        origin: "local",
      },
    });

    return after;
  });
}

export async function getTimeEntry(
  id: string,
  db: TimeEntryDbClientLike = prisma,
): Promise<TimeEntrySummary> {
  const validId = validateTimeEntryId(id);
  const settings = await getSettings(db);

  const row = await db.timeEntry.findUnique({
    where: { id: validId },
    include: timeEntryWithProjectAndBillingInclude,
  });

  if (!row || row.deletedAt !== null) {
    throw new NotFoundError("Apontamento não encontrado.");
  }

  const parts = parseCivilDate(row.workDate);
  const closedSet = new Set<string>();
  if (parts) {
    const period = await db.billingPeriod.findUnique({
      where: {
        clientId_year_month: {
          clientId: row.project.clientId,
          year: parts.year,
          month: parts.month,
        },
      },
      select: { status: true },
    });
    if (period?.status === "CLOSED") {
      closedSet.add(`${row.project.clientId}:${parts.year}:${parts.month}`);
    }
  }

  return mapTimeEntrySummary(row, settings.timezone, closedSet);
}

export async function listTimeEntries(
  filter?: TimeEntryListFilter,
  db: TimeEntryDbClientLike = prisma,
): Promise<TimeEntryListResult> {
  const normalized = parseTimeEntryListFilter(filter);
  const settings = await getSettings(db);

  const where: {
    deletedAt: null;
    workDate?: { gte?: string; lte?: string };
    projectId?: string;
    project?: { clientId: string };
    billable?: boolean;
    status?: "DRAFT" | "BILLED" | "APPROVED";
  } = {
    deletedAt: null,
  };

  if (normalized.startDate || normalized.endDate) {
    where.workDate = {};
    if (normalized.startDate) {
      where.workDate.gte = normalized.startDate;
    }
    if (normalized.endDate) {
      where.workDate.lte = normalized.endDate;
    }
  }

  if (normalized.projectId) {
    where.projectId = normalized.projectId;
  }

  if (normalized.clientId) {
    where.project = { clientId: normalized.clientId };
  }

  if (normalized.billable === "billable") {
    where.billable = true;
  } else if (normalized.billable === "non_billable") {
    where.billable = false;
  }

  if (normalized.status !== "all") {
    where.status = normalized.status;
  }

  const allMatching = await db.timeEntry.findMany({
    where,
    include: timeEntryWithProjectAndBillingInclude,
    orderBy: [
      { workDate: "desc" },
      { startAt: "desc" },
      { createdAt: "desc" },
    ],
  });

  const closedPeriods = await db.billingPeriod.findMany({
    where: { status: "CLOSED" },
    select: { clientId: true, year: true, month: true },
  });
  const closedSet = new Set(
    closedPeriods.map((p) => `${p.clientId}:${p.year}:${p.month}`),
  );

  const totals = computeTimeEntryTotals(allMatching);
  const totalCount = allMatching.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / normalized.pageSize));
  const currentPage = Math.min(normalized.page, totalPages);
  const startIndex = (currentPage - 1) * normalized.pageSize;
  const pagedRows = allMatching.slice(
    startIndex,
    startIndex + normalized.pageSize,
  );

  return {
    entries: pagedRows.map((row) =>
      mapTimeEntrySummary(row, settings.timezone, closedSet),
    ),
    page: currentPage,
    pageSize: normalized.pageSize,
    totalCount,
    totalPages,
    timezone: settings.timezone,
    totals,
  };
}

export async function getMonthlyCalendar(
  params?: {
    year?: number | string | null;
    month?: number | string | null;
    selectedDate?: string | null;
    clientId?: string | null;
    projectId?: string | null;
    now?: Date;
  },
  db: TimeEntryDbClientLike = prisma,
): Promise<MonthlyCalendarView> {
  const settings = await getSettings(db);
  const todayCivilDate = getTodayCivilDateInTimeZone(
    settings.timezone,
    params?.now,
  );

  const { year, month, selectedDate } = parseCalendarParams({
    year: params?.year,
    month: params?.month,
    date: params?.selectedDate,
    todayCivilDate,
  });

  const daysCount = getDaysInMonth(year, month);
  const monthStart = formatCivilDate(year, month, 1);
  const monthEnd = formatCivilDate(year, month, daysCount);

  const where: {
    deletedAt: null;
    workDate: { gte: string; lte: string };
    projectId?: string;
    project?: { clientId: string };
  } = {
    deletedAt: null,
    workDate: {
      gte: monthStart,
      lte: monthEnd,
    },
  };

  const validProjectId =
    params?.projectId && projectIdSchema.safeParse(params.projectId).success
      ? params.projectId.trim()
      : "";
  const validClientId =
    params?.clientId && clientIdSchema.safeParse(params.clientId).success
      ? params.clientId.trim()
      : "";

  if (validProjectId) {
    where.projectId = validProjectId;
  }
  if (validClientId) {
    where.project = { clientId: validClientId };
  }

  const [rows, closedPeriods] = await Promise.all([
    db.timeEntry.findMany({
      where,
      include: timeEntryWithProjectAndBillingInclude,
      orderBy: [
        { workDate: "asc" },
        { startAt: "asc" },
        { createdAt: "asc" },
      ],
    }),
    db.billingPeriod.findMany({
      where: {
        year,
        month,
        status: "CLOSED",
      },
      select: {
        clientId: true,
        year: true,
        month: true,
      },
    }),
  ]);

  const closedSet = new Set(
    closedPeriods.map((p) => `${p.clientId}:${p.year}:${p.month}`),
  );

  const mappedEntries = rows.map((row) =>
    mapTimeEntrySummary(row, settings.timezone, closedSet),
  );

  const entriesByDate = new Map<string, TimeEntrySummary[]>();
  for (const entry of mappedEntries) {
    const existing = entriesByDate.get(entry.workDate) ?? [];
    existing.push(entry);
    entriesByDate.set(entry.workDate, existing);
  }

  const days: CalendarDaySummary[] = [];

  for (let dayNum = 1; dayNum <= daysCount; dayNum += 1) {
    const date = formatCivilDate(year, month, dayNum);
    const dayOfWeek = getDayOfWeekFromCivilDate(date);
    const isWeekend = isWeekendCivilDate(date);
    const dayEntries = entriesByDate.get(date) ?? [];
    const dayTotals = computeTimeEntryTotals(dayEntries);

    days.push({
      date,
      dayOfMonth: dayNum,
      dayOfWeek,
      isWeekend,
      isToday: date === todayCivilDate,
      totalMinutes: dayTotals.totalMinutes,
      billableMinutes: dayTotals.billableMinutes,
      nonBillableMinutes: dayTotals.nonBillableMinutes,
      totalCents: dayTotals.totalCents,
      entryCount: dayEntries.length,
      entries: dayEntries,
    });
  }

  const selectedDay =
    days.find((d) => d.date === selectedDate) ?? (days[0] as CalendarDaySummary);

  const totals = computeTimeEntryTotals(mappedEntries);

  return {
    year,
    month,
    monthLabelPtBR: formatYearMonthLabelPtBR(year, month),
    todayCivilDate,
    selectedDate: selectedDay.date,
    timezone: settings.timezone,
    leadingEmptyDays: days[0]?.dayOfWeek ?? 0,
    days,
    selectedDay,
    totals,
  };
}
