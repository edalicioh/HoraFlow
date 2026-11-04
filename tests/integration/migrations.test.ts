import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  deployMigrations,
  type TestDatabase,
} from "../helpers/database";

let database: TestDatabase;

beforeAll(() => {
  database = createTestDatabase("migrations");
});

afterAll(async () => {
  await database.cleanup();
});

describe("migrations SQLite", () => {
  it("aplica todas as migrations e a segunda execução é no-op", async () => {
    const secondRun = deployMigrations(database.url);

    expect(secondRun).toContain("No pending migrations");

    const tables = await database.prisma.$queryRawUnsafe<
      Array<{ name: string }>
    >("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    const names = tables.map((table) => table.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "AuditLog",
        "BillingItem",
        "BillingPeriod",
        "Client",
        "ImportBatch",
        "Payment",
        "Project",
        "Settings",
        "TimeEntry",
      ]),
    );
  });

  it("aplica os valores efetivos de configuração do SQLite", async () => {
    const foreignKeys = await database.prisma.$queryRawUnsafe<
      Array<{ foreign_keys: bigint }>
    >("PRAGMA foreign_keys");
    const journal = await database.prisma.$queryRawUnsafe<
      Array<{ journal_mode: string }>
    >("PRAGMA journal_mode");
    const busyTimeout = await database.prisma.$queryRawUnsafe<
      Array<{ timeout: bigint }>
    >("PRAGMA busy_timeout");

    expect(Number(foreignKeys[0]?.foreign_keys)).toBe(1);
    expect(journal[0]?.journal_mode).toBe("wal");
    expect(Number(busyTimeout[0]?.timeout)).toBeGreaterThan(0);
  });

  it("mantém o índice único parcial para itens ativos", async () => {
    const index = await database.prisma.$queryRawUnsafe<
      Array<{ sql: string }>
    >(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'BillingItem_timeEntryId_active_key'",
    );

    expect(index[0]?.sql).toContain("WHERE \"releasedAt\" IS NULL");

    const client = await database.prisma.client.create({
      data: { name: "Cliente migração" },
    });
    const project = await database.prisma.project.create({
      data: { clientId: client.id, name: "Projeto migração" },
    });
    const entry = await database.prisma.timeEntry.create({
      data: {
        projectId: project.id,
        workDate: "2026-10-01",
        mode: "DURATION",
        durationMinutes: 60,
        hourlyRateCents: 10_000,
        amountCents: 10_000,
      },
    });
    const period = await database.prisma.billingPeriod.create({
      data: {
        clientId: client.id,
        year: 2026,
        month: 10,
        revision: 1,
        status: "CLOSED",
        clientNameSnapshot: client.name,
        totalMinutes: 60,
        totalCents: 10_000,
      },
    });
    const itemData = {
      billingPeriodId: period.id,
      timeEntryId: entry.id,
      revision: 1,
      clientName: client.name,
      projectName: project.name,
      description: "Item migração",
      workDate: entry.workDate,
      durationMinutes: 60,
      hourlyRateCents: 10_000,
      amountCents: 10_000,
    };

    const first = await database.prisma.billingItem.create({
      data: itemData,
    });

    await expect(
      database.prisma.billingItem.create({
        data: {
          ...itemData,
          revision: 2,
          description: "Segundo item ativo",
        },
      }),
    ).rejects.toThrow();

    await database.prisma.billingItem.update({
      where: { id: first.id },
      data: { releasedAt: new Date() },
    });

    const replacement = await database.prisma.billingItem.create({
      data: {
        ...itemData,
        revision: 2,
        description: "Item após liberação",
      },
    });

    expect(replacement.revision).toBe(2);
    expect(replacement.releasedAt).toBeNull();
  });

  it("aplica unicidade de competência por cliente", async () => {
    const client = await database.prisma.client.create({
      data: { name: "Cliente competência" },
    });

    await database.prisma.billingPeriod.create({
      data: { clientId: client.id, year: 2026, month: 11 },
    });

    await expect(
      database.prisma.billingPeriod.create({
        data: { clientId: client.id, year: 2026, month: 11 },
      }),
    ).rejects.toThrow();
  });

  it("impede exclusão de cliente com projeto (FK restritiva)", async () => {
    const client = await database.prisma.client.create({
      data: { name: "Cliente protegido" },
    });
    await database.prisma.project.create({
      data: { clientId: client.id, name: "Projeto protegido" },
    });

    await expect(
      database.prisma.client.delete({ where: { id: client.id } }),
    ).rejects.toThrow();
  });

  it("aplica checks negativos de pagamentos, revisões e singleton", async () => {
    const client = await database.prisma.client.create({
      data: { name: "Cliente negativos" },
    });
    const period = await database.prisma.billingPeriod.create({
      data: { clientId: client.id, year: 2026, month: 12 },
    });

    await expect(
      database.prisma.payment.create({
        data: {
          billingPeriodId: period.id,
          revision: 1,
          amountCents: 0,
          paidAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    await expect(
      database.prisma.payment.create({
        data: {
          billingPeriodId: period.id,
          revision: 0,
          amountCents: 100,
          paidAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    await expect(
      database.prisma.billingPeriod.create({
        data: { clientId: client.id, year: 2026, month: 1, revision: 0 },
      }),
    ).rejects.toThrow();

    await expect(
      database.prisma.settings.create({ data: { id: "outro" } }),
    ).rejects.toThrow();
  });

  it("aplica FKs restritivas nas relações principais", async () => {
    await expect(
      database.prisma.project.create({
        data: { clientId: "cliente-inexistente", name: "Projeto órfão" },
      }),
    ).rejects.toThrow();

    await expect(
      database.prisma.timeEntry.create({
        data: {
          projectId: "projeto-inexistente",
          workDate: "2026-10-03",
          mode: "DURATION",
          durationMinutes: 30,
          hourlyRateCents: 1_000,
          amountCents: 500,
        },
      }),
    ).rejects.toThrow();

    await expect(
      database.prisma.billingPeriod.create({
        data: { clientId: "cliente-inexistente", year: 2026, month: 2 },
      }),
    ).rejects.toThrow();

    await expect(
      database.prisma.payment.create({
        data: {
          billingPeriodId: "periodo-inexistente",
          revision: 1,
          amountCents: 100,
          paidAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    await expect(
      database.prisma.billingItem.create({
        data: {
          billingPeriodId: "periodo-inexistente",
          timeEntryId: "apontamento-inexistente",
          revision: 1,
          clientName: "Cliente",
          projectName: "Projeto",
          workDate: "2026-10-03",
          durationMinutes: 30,
          hourlyRateCents: 1_000,
          amountCents: 500,
        },
      }),
    ).rejects.toThrow();
  });

  it("aplica checks de duração e moeda no banco", async () => {
    const client = await database.prisma.client.create({
      data: { name: "Cliente checks" },
    });
    const project = await database.prisma.project.create({
      data: { clientId: client.id, name: "Projeto checks" },
    });

    await expect(
      database.prisma.timeEntry.create({
        data: {
          projectId: project.id,
          workDate: "2026-10-02",
          mode: "DURATION",
          durationMinutes: 0,
          hourlyRateCents: 10_000,
          amountCents: 0,
        },
      }),
    ).rejects.toThrow();

    await database.prisma.settings.create({
      data: { id: "singleton" },
    });

    await expect(
      database.prisma.settings.update({
        where: { id: "singleton" },
        data: { currency: "USD" },
      }),
    ).rejects.toThrow();
  });
});
