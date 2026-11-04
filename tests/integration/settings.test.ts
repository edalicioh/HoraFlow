import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createClient,
  createTestDatabase,
  type TestDatabase,
} from "../helpers/database";

let database: TestDatabase;
let settingsService: typeof import("@/modules/settings/service");
let databaseModule: typeof import("@/lib/db");

beforeAll(async () => {
  database = createTestDatabase("settings");
  process.env.DATABASE_URL = database.url;
  settingsService = await import("@/modules/settings/service");
  databaseModule = await import("@/lib/db");
});

afterAll(async () => {
  await databaseModule.prisma.$disconnect();
  await database.cleanup();
});

describe("Settings singleton", () => {
  it("inicializa o banco vazio com conexões independentes concorrentes", async () => {
    const empty = createTestDatabase("settings-init");
    const clients = [
      empty.prisma,
      createClient(empty.url),
      createClient(empty.url),
      createClient(empty.url),
    ];

    try {
      await Promise.all(
        clients.map((client) => settingsService.getSettings(client)),
      );

      expect(await empty.prisma.settings.count()).toBe(1);
    } finally {
      await Promise.all(
        clients.slice(1).map((client) => client.$disconnect()),
      );
      await empty.cleanup();
    }
  });

  it("inicializa uma única vez com BRL e timezone padrão", async () => {
    const first = await settingsService.getSettings();
    const second = await settingsService.getSettings();

    expect(first.id).toBe("singleton");
    expect(first.currency).toBe("BRL");
    expect(first.timezone).toBe("America/Sao_Paulo");
    expect(first.defaultHourlyRateCents).toBe(0);
    expect(second.id).toBe(first.id);

    await Promise.all(
      Array.from({ length: 10 }, () => settingsService.getSettings()),
    );

    expect(await database.prisma.settings.count()).toBe(1);
  });

  it("persiste alterações e grava auditoria antes/depois", async () => {
    const updated = await settingsService.updateSettings({
      timezone: "America/Manaus",
      defaultHourlyRateCents: 15_000,
    });

    expect(updated.timezone).toBe("America/Manaus");
    expect(updated.defaultHourlyRateCents).toBe(15_000);
    expect(updated.currency).toBe("BRL");

    const persisted = await database.prisma.settings.findUniqueOrThrow({
      where: { id: "singleton" },
    });
    expect(persisted.timezone).toBe("America/Manaus");
    expect(persisted.defaultHourlyRateCents).toBe(15_000);

    const audit = await database.prisma.auditLog.findFirstOrThrow({
      where: { entity: "Settings", entityId: "singleton" },
      orderBy: { createdAt: "desc" },
    });

    expect(audit.action).toBe("UPDATE");
    expect(audit.origin).toBe("local");
    expect(audit.before).toEqual(
      expect.objectContaining({
        timezone: "America/Sao_Paulo",
        currency: "BRL",
        defaultHourlyRateCents: 0,
      }),
    );
    expect(audit.after).toEqual(
      expect.objectContaining({
        timezone: "America/Manaus",
        currency: "BRL",
        defaultHourlyRateCents: 15_000,
      }),
    );
  });

  it("lê o valor persistido por outra conexão", async () => {
    const settings = await database.prisma.settings.findUniqueOrThrow({
      where: { id: "singleton" },
    });

    expect(settings.defaultHourlyRateCents).toBe(15_000);
    expect(settings.timezone).toBe("America/Manaus");
  });

  it("rejeita fuso e tarifa inválidos sem alterar o registro", async () => {
    await expect(
      settingsService.updateSettings({
        timezone: "Fuso/Inventado",
        defaultHourlyRateCents: 20_000,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      settingsService.updateSettings({
        timezone: "America/Sao_Paulo",
        defaultHourlyRateCents: -1,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const persisted = await database.prisma.settings.findUniqueOrThrow({
      where: { id: "singleton" },
    });
    expect(persisted.defaultHourlyRateCents).toBe(15_000);
    expect(persisted.timezone).toBe("America/Manaus");
  });

  it("não permite alterar a moeda BRL diretamente no banco", async () => {
    await expect(
      database.prisma.settings.update({
        where: { id: "singleton" },
        data: { currency: "USD" },
      }),
    ).rejects.toThrow();

    const persisted = await database.prisma.settings.findUniqueOrThrow({
      where: { id: "singleton" },
    });
    expect(persisted.currency).toBe("BRL");
  });

  it("faz rollback integral das configurações quando a auditoria falha", async () => {
    await settingsService.updateSettings({
      timezone: "America/Sao_Paulo",
      defaultHourlyRateCents: 12_345,
    });

    const auditBefore = await database.prisma.auditLog.count({
      where: { entity: "Settings", entityId: "singleton" },
    });

    await database.prisma.$executeRawUnsafe(`
      CREATE TRIGGER "Settings_audit_failure"
      BEFORE INSERT ON "AuditLog"
      BEGIN
        SELECT RAISE(ABORT, 'audit failure');
      END
    `);

    try {
      await expect(
        settingsService.updateSettings({
          timezone: "Europe/Lisbon",
          defaultHourlyRateCents: 99_900,
        }),
      ).rejects.toThrow();
    } finally {
      await database.prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS "Settings_audit_failure"',
      );
    }

    const persisted = await database.prisma.settings.findUniqueOrThrow({
      where: { id: "singleton" },
    });
    const auditAfter = await database.prisma.auditLog.count({
      where: { entity: "Settings", entityId: "singleton" },
    });

    expect(persisted.timezone).toBe("America/Sao_Paulo");
    expect(persisted.defaultHourlyRateCents).toBe(12_345);
    expect(auditAfter).toBe(auditBefore);
  });
});
