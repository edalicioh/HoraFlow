import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { resolveHourlyRateWithSource } from "@/lib/rates";
import {
  projectWithClientAndCountsInclude,
  type ProjectDbClientLike,
} from "@/modules/project/repository";
import {
  parseProjectListFilter,
  projectIdSchema,
  projectWriteSchema,
  type ProjectWriteInput,
} from "@/modules/project/schema";
import type {
  ProjectListFilter,
  ProjectRecord,
  ProjectSummary,
} from "@/modules/project/types";
import { getSettings } from "@/modules/settings/service";

function projectSnapshot(project: ProjectRecord) {
  return {
    id: project.id,
    clientId: project.clientId,
    name: project.name,
    description: project.description,
    hourlyRateCents: project.hourlyRateCents,
    active: project.active,
  };
}

function validateProjectId(id: string): string {
  const parsed = projectIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new ValidationError("Identificador de projeto inválido.", {
      id: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return parsed.data;
}

function validateProjectWrite(input: ProjectWriteInput) {
  const parsed = projectWriteSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Revise os dados do projeto.",
      z.flattenError(parsed.error).fieldErrors,
    );
  }
  return parsed.data;
}

function mapProjectSummary(
  row: {
    id: string;
    clientId: string;
    name: string;
    description: string | null;
    hourlyRateCents: number | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    client: {
      id: string;
      name: string;
      active: boolean;
      hourlyRateCents: number | null;
    };
    _count: {
      timeEntries: number;
    };
    timeEntries: Array<{
      _count: {
        billingItems: number;
      };
    }>;
  },
  defaultHourlyRateCents: number,
): ProjectSummary {
  const resolved = resolveHourlyRateWithSource({
    projectRateCents: row.hourlyRateCents,
    clientRateCents: row.client.hourlyRateCents,
    defaultRateCents: defaultHourlyRateCents,
  });

  const timeEntryCount = row._count.timeEntries;
  const billingItemCount = row.timeEntries.reduce(
    (sum, entry) => sum + entry._count.billingItems,
    0,
  );
  const hasHistory = timeEntryCount > 0 || billingItemCount > 0;

  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    description: row.description,
    hourlyRateCents: row.hourlyRateCents,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    clientName: row.client.name,
    clientActive: row.client.active,
    clientHourlyRateCents: row.client.hourlyRateCents,
    effectiveHourlyRateCents: resolved.rateCents,
    effectiveRateSource: resolved.source,
    eligibleForTimeEntries: row.active && row.client.active,
    timeEntryCount,
    billingItemCount,
    hasHistory,
    canDelete: !hasHistory,
    canChangeClient: !hasHistory,
  };
}

export async function listProjects(
  filter?: ProjectListFilter,
  db: ProjectDbClientLike = prisma,
): Promise<{
  projects: ProjectSummary[];
  defaultHourlyRateCents: number;
}> {
  const normalizedFilter = parseProjectListFilter({
    query: filter?.query,
    clientId: filter?.clientId,
    status: filter?.status,
  });

  const settings = await getSettings(db);

  const where: {
    clientId?: string;
    active?: boolean;
    OR?: Array<{
      name?: { contains: string };
      description?: { contains: string };
      client?: { name: { contains: string } };
    }>;
  } = {};

  if (normalizedFilter.clientId.length > 0) {
    where.clientId = normalizedFilter.clientId;
  }

  if (normalizedFilter.status === "active") {
    where.active = true;
  } else if (normalizedFilter.status === "inactive") {
    where.active = false;
  }

  if (normalizedFilter.query.length > 0) {
    where.OR = [
      { name: { contains: normalizedFilter.query } },
      { description: { contains: normalizedFilter.query } },
      { client: { name: { contains: normalizedFilter.query } } },
    ];
  }

  const rows = await db.project.findMany({
    where,
    include: projectWithClientAndCountsInclude,
    orderBy: [
      { active: "desc" },
      { client: { name: "asc" } },
      { name: "asc" },
    ],
  });

  return {
    projects: rows.map((row) =>
      mapProjectSummary(row, settings.defaultHourlyRateCents),
    ),
    defaultHourlyRateCents: settings.defaultHourlyRateCents,
  };
}

export async function getProject(
  id: string,
  db: ProjectDbClientLike = prisma,
): Promise<ProjectSummary> {
  const validId = validateProjectId(id);
  const settings = await getSettings(db);

  const row = await db.project.findUnique({
    where: { id: validId },
    include: projectWithClientAndCountsInclude,
  });

  if (!row) {
    throw new NotFoundError("Projeto não encontrado.");
  }

  return mapProjectSummary(row, settings.defaultHourlyRateCents);
}

export async function createProject(
  input: ProjectWriteInput,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<ProjectRecord> {
  const data = validateProjectWrite(input);

  return db.$transaction(async (transaction) => {
    const client = await transaction.client.findUnique({
      where: { id: data.clientId },
      select: { id: true, active: true },
    });

    if (!client) {
      throw new NotFoundError("Cliente informado não foi encontrado.", {
        clientId: ["Selecione um cliente cadastrado."],
      });
    }

    if (!client.active) {
      throw new ConflictError(
        "Não é possível criar projeto vinculado a um cliente inativo.",
        {
          clientId: ["Selecione um cliente ativo para vincular o projeto."],
        },
      );
    }

    const created = await transaction.project.create({
      data: {
        clientId: data.clientId,
        name: data.name,
        description: data.description,
        hourlyRateCents: data.hourlyRateCents,
        active: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        entity: "Project",
        entityId: created.id,
        action: "CREATE",
        before: undefined,
        after: projectSnapshot(created),
        origin: "local",
      },
    });

    return created;
  });
}

export async function updateProject(
  id: string,
  input: ProjectWriteInput,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<ProjectRecord> {
  const validId = validateProjectId(id);
  const data = validateProjectWrite(input);

  return db.$transaction(async (transaction) => {
    const before = await transaction.project.findUnique({
      where: { id: validId },
      include: {
        _count: {
          select: {
            timeEntries: true,
          },
        },
        timeEntries: {
          select: {
            _count: {
              select: {
                billingItems: true,
              },
            },
          },
        },
      },
    });

    if (!before) {
      throw new NotFoundError("Projeto não encontrado.");
    }

    const targetClient = await transaction.client.findUnique({
      where: { id: data.clientId },
      select: { id: true, active: true },
    });

    if (!targetClient) {
      throw new NotFoundError("Cliente informado não foi encontrado.", {
        clientId: ["Selecione um cliente cadastrado."],
      });
    }

    if (data.clientId !== before.clientId) {
      const billingItemCount = before.timeEntries.reduce(
        (sum, entry) => sum + entry._count.billingItems,
        0,
      );
      const hasHistory =
        before._count.timeEntries > 0 || billingItemCount > 0;

      if (hasHistory) {
        throw new ConflictError(
          "Não é possível alterar o cliente de um projeto que já possui histórico de horas ou faturamento.",
          {
            clientId: [
              "O cliente não pode ser alterado porque o projeto já possui apontamentos registrados.",
            ],
          },
        );
      }

      if (!targetClient.active) {
        throw new ConflictError(
          "Não é possível transferir o projeto para um cliente inativo.",
          {
            clientId: ["Selecione um cliente ativo para vincular o projeto."],
          },
        );
      }
    }

    const after = await transaction.project.update({
      where: { id: validId },
      data: {
        clientId: data.clientId,
        name: data.name,
        description: data.description,
        hourlyRateCents: data.hourlyRateCents,
      },
    });

    await transaction.auditLog.create({
      data: {
        entity: "Project",
        entityId: after.id,
        action: "UPDATE",
        before: projectSnapshot(before),
        after: projectSnapshot(after),
        origin: "local",
      },
    });

    return after;
  });
}

export async function setProjectActive(
  id: string,
  active: boolean,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<ProjectRecord> {
  const validId = validateProjectId(id);
  const activeParsed = z.boolean().safeParse(active);

  if (!activeParsed.success) {
    throw new ValidationError("Status de ativação inválido.");
  }

  return db.$transaction(async (transaction) => {
    const before = await transaction.project.findUnique({
      where: { id: validId },
    });

    if (!before) {
      throw new NotFoundError("Projeto não encontrado.");
    }

    const after = await transaction.project.update({
      where: { id: validId },
      data: { active: activeParsed.data },
    });

    await transaction.auditLog.create({
      data: {
        entity: "Project",
        entityId: after.id,
        action: activeParsed.data ? "ACTIVATE" : "DEACTIVATE",
        before: projectSnapshot(before),
        after: projectSnapshot(after),
        origin: "local",
      },
    });

    return after;
  });
}

export async function deleteProject(
  id: string,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<void> {
  const validId = validateProjectId(id);

  await db.$transaction(async (transaction) => {
    const existing = await transaction.project.findUnique({
      where: { id: validId },
      include: {
        _count: {
          select: {
            timeEntries: true,
          },
        },
        timeEntries: {
          select: {
            _count: {
              select: {
                billingItems: true,
              },
            },
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError("Projeto não encontrado.");
    }

    const billingItemCount = existing.timeEntries.reduce(
      (sum, entry) => sum + entry._count.billingItems,
      0,
    );

    // _count.timeEntries inclui todos os registros (inclusive com deletedAt preenchido).
    if (existing._count.timeEntries > 0 || billingItemCount > 0) {
      throw new ConflictError(
        "Não é possível excluir um projeto que possui apontamentos ou histórico vinculado. Desative o projeto para preservar o histórico.",
      );
    }

    await transaction.project.delete({
      where: { id: validId },
    });

    await transaction.auditLog.create({
      data: {
        entity: "Project",
        entityId: existing.id,
        action: "DELETE",
        before: projectSnapshot(existing),
        after: undefined,
        origin: "local",
      },
    });
  });
}
