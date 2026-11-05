import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { resolveHourlyRateWithSource } from "@/lib/rates";
import {
  clientWithCountsInclude,
  type DbClientLike,
} from "@/modules/client/repository";
import {
  clientIdSchema,
  clientWriteSchema,
  parseClientListFilter,
  type ClientWriteInput,
} from "@/modules/client/schema";
import type {
  ClientDetail,
  ClientListFilter,
  ClientRecord,
  ClientSummary,
} from "@/modules/client/types";
import { getSettings } from "@/modules/settings/service";

function clientSnapshot(client: ClientRecord) {
  return {
    id: client.id,
    name: client.name,
    description: client.description,
    hourlyRateCents: client.hourlyRateCents,
    active: client.active,
  };
}

function validateClientId(id: string): string {
  const parsed = clientIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new ValidationError("Identificador de cliente inválido.", {
      id: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return parsed.data;
}

function validateClientWrite(input: ClientWriteInput) {
  const parsed = clientWriteSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Revise os dados do cliente.",
      z.flattenError(parsed.error).fieldErrors,
    );
  }
  return parsed.data;
}

export async function listClients(
  filter?: ClientListFilter,
  db: DbClientLike = prisma,
): Promise<{
  clients: ClientSummary[];
  defaultHourlyRateCents: number;
}> {
  const normalizedFilter = parseClientListFilter({
    query: filter?.query,
    status: filter?.status,
  });

  const settings = await getSettings(db);

  const where: {
    active?: boolean;
    OR?: Array<{
      name?: { contains: string };
      description?: { contains: string };
    }>;
  } = {};

  if (normalizedFilter.status === "active") {
    where.active = true;
  } else if (normalizedFilter.status === "inactive") {
    where.active = false;
  }

  if (normalizedFilter.query.length > 0) {
    where.OR = [
      { name: { contains: normalizedFilter.query } },
      { description: { contains: normalizedFilter.query } },
    ];
  }

  const rows = await db.client.findMany({
    where,
    include: clientWithCountsInclude,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const clients: ClientSummary[] = rows.map((row) => {
    const activeProjectCount = row.projects.filter(
      (project) => project.active,
    ).length;
    const timeEntryCount = row.projects.reduce(
      (sum, project) => sum + project._count.timeEntries,
      0,
    );
    const projectCount = row._count.projects;
    const billingPeriodCount = row._count.billingPeriods;
    const hasHistory =
      projectCount > 0 || billingPeriodCount > 0 || timeEntryCount > 0;
    const resolvedClientRate = resolveHourlyRateWithSource({
      projectRateCents: null,
      clientRateCents: row.hourlyRateCents,
      defaultRateCents: settings.defaultHourlyRateCents,
    });

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      hourlyRateCents: row.hourlyRateCents,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      projectCount,
      activeProjectCount,
      billingPeriodCount,
      timeEntryCount,
      hasHistory,
      canDelete: !hasHistory,
      effectiveHourlyRateCents: resolvedClientRate.rateCents,
      effectiveRateSource:
        resolvedClientRate.source === "client" ? "client" : "global",
    };
  });

  return {
    clients,
    defaultHourlyRateCents: settings.defaultHourlyRateCents,
  };
}

export async function getClient(
  id: string,
  db: DbClientLike = prisma,
): Promise<ClientDetail> {
  const validId = validateClientId(id);
  const settings = await getSettings(db);

  const row = await db.client.findUnique({
    where: { id: validId },
    include: clientWithCountsInclude,
  });

  if (!row) {
    throw new NotFoundError("Cliente não encontrado.");
  }

  const projects = row.projects.map((project) => {
    const resolved = resolveHourlyRateWithSource({
      projectRateCents: project.hourlyRateCents,
      clientRateCents: row.hourlyRateCents,
      defaultRateCents: settings.defaultHourlyRateCents,
    });
    const timeEntryCount = project._count.timeEntries;
    const billingItemCount = project.timeEntries.reduce(
      (sum, entry) => sum + entry._count.billingItems,
      0,
    );
    const hasHistory = timeEntryCount > 0 || billingItemCount > 0;

    return {
      id: project.id,
      clientId: project.clientId,
      name: project.name,
      description: project.description,
      hourlyRateCents: project.hourlyRateCents,
      active: project.active,
      effectiveHourlyRateCents: resolved.rateCents,
      effectiveRateSource: resolved.source,
      eligibleForTimeEntries: row.active && project.active,
      timeEntryCount,
      billingItemCount,
      hasHistory,
      canDelete: !hasHistory,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  });

  const activeProjectCount = projects.filter((project) => project.active).length;
  const timeEntryCount = projects.reduce(
    (sum, project) => sum + project.timeEntryCount,
    0,
  );
  const projectCount = row._count.projects;
  const billingPeriodCount = row._count.billingPeriods;
  const hasHistory =
    projectCount > 0 || billingPeriodCount > 0 || timeEntryCount > 0;
  const resolvedClientRate = resolveHourlyRateWithSource({
    projectRateCents: null,
    clientRateCents: row.hourlyRateCents,
    defaultRateCents: settings.defaultHourlyRateCents,
  });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    hourlyRateCents: row.hourlyRateCents,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    projectCount,
    activeProjectCount,
    billingPeriodCount,
    timeEntryCount,
    hasHistory,
    canDelete: !hasHistory,
    effectiveHourlyRateCents: resolvedClientRate.rateCents,
    effectiveRateSource:
      resolvedClientRate.source === "client" ? "client" : "global",
    defaultHourlyRateCents: settings.defaultHourlyRateCents,
    projects,
  };
}

export async function createClient(
  input: ClientWriteInput,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<ClientRecord> {
  const data = validateClientWrite(input);

  return db.$transaction(async (transaction) => {
    const created = await transaction.client.create({
      data: {
        name: data.name,
        description: data.description,
        hourlyRateCents: data.hourlyRateCents,
        active: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        entity: "Client",
        entityId: created.id,
        action: "CREATE",
        before: undefined,
        after: clientSnapshot(created),
        origin: "local",
      },
    });

    return created;
  });
}

export async function updateClient(
  id: string,
  input: ClientWriteInput,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<ClientRecord> {
  const validId = validateClientId(id);
  const data = validateClientWrite(input);

  return db.$transaction(async (transaction) => {
    const before = await transaction.client.findUnique({
      where: { id: validId },
    });

    if (!before) {
      throw new NotFoundError("Cliente não encontrado.");
    }

    const after = await transaction.client.update({
      where: { id: validId },
      data: {
        name: data.name,
        description: data.description,
        hourlyRateCents: data.hourlyRateCents,
      },
    });

    await transaction.auditLog.create({
      data: {
        entity: "Client",
        entityId: after.id,
        action: "UPDATE",
        before: clientSnapshot(before),
        after: clientSnapshot(after),
        origin: "local",
      },
    });

    return after;
  });
}

export async function setClientActive(
  id: string,
  active: boolean,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<ClientRecord> {
  const validId = validateClientId(id);
  const activeParsed = z.boolean().safeParse(active);

  if (!activeParsed.success) {
    throw new ValidationError("Status de ativação inválido.");
  }

  return db.$transaction(async (transaction) => {
    const before = await transaction.client.findUnique({
      where: { id: validId },
    });

    if (!before) {
      throw new NotFoundError("Cliente não encontrado.");
    }

    // Decisão de domínio aprovada em 2026-11-05: desativar ou reativar um cliente
    // não altera silenciosamente o campo `active` individual dos seus projetos.
    const after = await transaction.client.update({
      where: { id: validId },
      data: { active: activeParsed.data },
    });

    await transaction.auditLog.create({
      data: {
        entity: "Client",
        entityId: after.id,
        action: activeParsed.data ? "ACTIVATE" : "DEACTIVATE",
        before: clientSnapshot(before),
        after: clientSnapshot(after),
        origin: "local",
      },
    });

    return after;
  });
}

export async function deleteClient(
  id: string,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<void> {
  const validId = validateClientId(id);

  await db.$transaction(async (transaction) => {
    const existing = await transaction.client.findUnique({
      where: { id: validId },
      include: {
        _count: {
          select: {
            projects: true,
            billingPeriods: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError("Cliente não encontrado.");
    }

    if (
      existing._count.projects > 0 ||
      existing._count.billingPeriods > 0
    ) {
      throw new ConflictError(
        "Não é possível excluir um cliente que possui projetos ou histórico vinculado. Desative o cadastro para preservar o histórico.",
      );
    }

    await transaction.client.delete({
      where: { id: validId },
    });

    await transaction.auditLog.create({
      data: {
        entity: "Client",
        entityId: existing.id,
        action: "DELETE",
        before: clientSnapshot(existing),
        after: undefined,
        origin: "local",
      },
    });
  });
}
