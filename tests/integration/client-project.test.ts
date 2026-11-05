import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

let database: TestDatabase;
let clientService: typeof import("@/modules/client/service");
let projectService: typeof import("@/modules/project/service");
let settingsService: typeof import("@/modules/settings/service");
let databaseModule: typeof import("@/lib/db");

beforeAll(async () => {
  database = createTestDatabase("client-project");
  process.env.DATABASE_URL = database.url;
  settingsService = await import("@/modules/settings/service");
  clientService = await import("@/modules/client/service");
  projectService = await import("@/modules/project/service");
  databaseModule = await import("@/lib/db");

  await settingsService.updateSettings({
    timezone: "America/Sao_Paulo",
    defaultHourlyRateCents: 8_000,
  });
});

afterAll(async () => {
  await databaseModule.prisma.$disconnect();
  await database.cleanup();
});

describe("Cadastros de clientes, projetos e resolução de tarifas (Fase 1)", () => {
  it("cria clientes e projetos e resolve tarifas com prioridade projeto -> cliente -> global, preservando zero sem fallback", async () => {
    const clientWithRate = await clientService.createClient(
      {
        name: "Acme Consultoria",
        description: "Cliente com tarifa própria",
        hourlyRateCents: 10_000,
      },
      database.prisma,
    );

    const clientWithoutRate = await clientService.createClient(
      {
        name: "Beta Sistemas",
        description: null,
        hourlyRateCents: null,
      },
      database.prisma,
    );

    const projectOwnRate = await projectService.createProject(
      {
        clientId: clientWithRate.id,
        name: "ERP Financeiro",
        description: "Com tarifa própria",
        hourlyRateCents: 12_000,
      },
      database.prisma,
    );

    const projectInheritedClientRate = await projectService.createProject(
      {
        clientId: clientWithRate.id,
        name: "Suporte Mensal",
        description: "Herda tarifa do cliente",
        hourlyRateCents: null,
      },
      database.prisma,
    );

    const projectInheritedGlobalRate = await projectService.createProject(
      {
        clientId: clientWithoutRate.id,
        name: "Portal Institucional",
        description: "Herda tarifa global",
        hourlyRateCents: null,
      },
      database.prisma,
    );

    const projectZeroRate = await projectService.createProject(
      {
        clientId: clientWithRate.id,
        name: "Treinamento Cortesia",
        description: "Tarifa zero definida",
        hourlyRateCents: 0,
      },
      database.prisma,
    );

    const detailOwn = await projectService.getProject(
      projectOwnRate.id,
      database.prisma,
    );
    expect(detailOwn.effectiveHourlyRateCents).toBe(12_000);
    expect(detailOwn.effectiveRateSource).toBe("project");

    const detailClient = await projectService.getProject(
      projectInheritedClientRate.id,
      database.prisma,
    );
    expect(detailClient.effectiveHourlyRateCents).toBe(10_000);
    expect(detailClient.effectiveRateSource).toBe("client");

    const detailGlobal = await projectService.getProject(
      projectInheritedGlobalRate.id,
      database.prisma,
    );
    expect(detailGlobal.effectiveHourlyRateCents).toBe(8_000);
    expect(detailGlobal.effectiveRateSource).toBe("global");

    const detailZero = await projectService.getProject(
      projectZeroRate.id,
      database.prisma,
    );
    expect(detailZero.hourlyRateCents).toBe(0);
    expect(detailZero.effectiveHourlyRateCents).toBe(0);
    expect(detailZero.effectiveRateSource).toBe("project");

    const clientDetail = await clientService.getClient(
      clientWithRate.id,
      database.prisma,
    );
    expect(clientDetail.projectCount).toBe(3);
    expect(clientDetail.canDelete).toBe(false);
    expect(
      clientDetail.projects.find((p) => p.id === projectZeroRate.id)
        ?.effectiveHourlyRateCents,
    ).toBe(0);
  });

  it("rejeita nomes vazios, tarifas negativas/fracionárias e entidades inexistentes sem criar órfãos", async () => {
    const projectCountBefore = await database.prisma.project.count();

    await expect(
      clientService.createClient(
        { name: "   ", hourlyRateCents: 5_000 },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      clientService.createClient(
        { name: "Inválido", hourlyRateCents: -100 },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      clientService.createClient(
        { name: "Fracionário", hourlyRateCents: 100.5 },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const missingId = randomUUID();

    await expect(
      clientService.getClient(missingId, database.prisma),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      projectService.getProject(missingId, database.prisma),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      projectService.createProject(
        {
          clientId: missingId,
          name: "Projeto Órfão",
          hourlyRateCents: 9_000,
        },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await database.prisma.project.count()).toBe(projectCountBefore);
  });

  it("desativa e reativa cliente preservando o status individual dos projetos, mas bloqueando elegibilidade e novos vínculos", async () => {
    const client = await clientService.createClient(
      {
        name: "Cliente Ciclo Status",
        hourlyRateCents: 11_000,
      },
      database.prisma,
    );

    const activeProject = await projectService.createProject(
      {
        clientId: client.id,
        name: "Projeto Ativo do Cliente",
        hourlyRateCents: null,
      },
      database.prisma,
    );

    const inactiveProject = await projectService.createProject(
      {
        clientId: client.id,
        name: "Projeto Inativo do Cliente",
        hourlyRateCents: null,
      },
      database.prisma,
    );
    await projectService.setProjectActive(
      inactiveProject.id,
      false,
      database.prisma,
    );

    await clientService.setClientActive(client.id, false, database.prisma);

    // Não permite criar novo projeto em cliente inativo
    await expect(
      projectService.createProject(
        {
          clientId: client.id,
          name: "Projeto Bloqueado",
          hourlyRateCents: null,
        },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // O projeto que era ativo continua com active=true no banco, mas inelegível para apontamentos
    const projectWhileClientInactive = await projectService.getProject(
      activeProject.id,
      database.prisma,
    );
    expect(projectWhileClientInactive.active).toBe(true);
    expect(projectWhileClientInactive.clientActive).toBe(false);
    expect(projectWhileClientInactive.eligibleForTimeEntries).toBe(false);

    // Ao reativar o cliente, o projeto ativo volta a ser elegível e o projeto inativo permanece inativo
    await clientService.setClientActive(client.id, true, database.prisma);

    const activeAfter = await projectService.getProject(
      activeProject.id,
      database.prisma,
    );
    const inactiveAfter = await projectService.getProject(
      inactiveProject.id,
      database.prisma,
    );

    expect(activeAfter.active).toBe(true);
    expect(activeAfter.eligibleForTimeEntries).toBe(true);
    expect(inactiveAfter.active).toBe(false);
    expect(inactiveAfter.eligibleForTimeEntries).toBe(false);
  });

  it("bloqueia exclusão física de cliente com projetos e de projeto com apontamentos (inclusive excluídos logicamente)", async () => {
    const client = await clientService.createClient(
      { name: "Cliente Protegido", hourlyRateCents: 9_500 },
      database.prisma,
    );

    const projectWithSoftDeletedEntry = await projectService.createProject(
      {
        clientId: client.id,
        name: "Projeto Com Histórico Excluído Logicamente",
        hourlyRateCents: 13_000,
      },
      database.prisma,
    );

    const projectWithoutHistory = await projectService.createProject(
      {
        clientId: client.id,
        name: "Projeto Sem Histórico",
        hourlyRateCents: null,
      },
      database.prisma,
    );

    await database.prisma.timeEntry.create({
      data: {
        projectId: projectWithSoftDeletedEntry.id,
        workDate: "2026-10-15",
        mode: "DURATION",
        durationMinutes: 120,
        hourlyRateCents: 13_000,
        amountCents: 26_000,
        billable: true,
        status: "DRAFT",
        deletedAt: new Date("2026-10-16T12:00:00.000Z"),
      },
    });

    // Tentar excluir cliente que possui projetos falha com CONFLICT e não remove projetos em cascata
    await expect(
      clientService.deleteClient(client.id, database.prisma),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await database.prisma.project.count({ where: { clientId: client.id } }),
    ).toBe(2);

    // Tentar excluir projeto com apontamento excluído logicamente falha com CONFLICT
    await expect(
      projectService.deleteProject(
        projectWithSoftDeletedEntry.id,
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Projeto sem histórico pode ser excluído fisicamente
    await projectService.deleteProject(
      projectWithoutHistory.id,
      database.prisma,
    );
    await expect(
      projectService.getProject(projectWithoutHistory.id, database.prisma),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Cliente sem projetos nem histórico pode ser excluído fisicamente
    const disposableClient = await clientService.createClient(
      { name: "Cliente Descartável", hourlyRateCents: null },
      database.prisma,
    );
    await clientService.deleteClient(disposableClient.id, database.prisma);
    await expect(
      clientService.getClient(disposableClient.id, database.prisma),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("proíbe transferir projeto com histórico para outro cliente, permitindo apenas quando não há histórico", async () => {
    const clientA = await clientService.createClient(
      { name: "Cliente Origem A", hourlyRateCents: 10_000 },
      database.prisma,
    );
    const clientB = await clientService.createClient(
      { name: "Cliente Destino B", hourlyRateCents: 14_000 },
      database.prisma,
    );

    const project = await projectService.createProject(
      {
        clientId: clientA.id,
        name: "Projeto Transferível Antes do Histórico",
        hourlyRateCents: null,
      },
      database.prisma,
    );

    // Sem histórico: pode corrigir o cliente vinculado para outro cliente ativo
    const moved = await projectService.updateProject(
      project.id,
      {
        clientId: clientB.id,
        name: project.name,
        description: "Vínculo corrigido",
        hourlyRateCents: null,
      },
      database.prisma,
    );
    expect(moved.clientId).toBe(clientB.id);

    // Após receber apontamento: tentativa de mudar clientId é bloqueada
    await database.prisma.timeEntry.create({
      data: {
        projectId: project.id,
        workDate: "2026-10-20",
        mode: "DURATION",
        durationMinutes: 60,
        hourlyRateCents: 14_000,
        amountCents: 14_000,
        billable: true,
        status: "DRAFT",
      },
    });

    await expect(
      projectService.updateProject(
        project.id,
        {
          clientId: clientA.id,
          name: project.name,
          description: "Tentativa de transferência com histórico",
          hourlyRateCents: null,
        },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Editar nome/descrição/tarifa mantendo o mesmo clientId continua permitido
    const updatedSameClient = await projectService.updateProject(
      project.id,
      {
        clientId: clientB.id,
        name: "Projeto Renomeado Com Histórico",
        description: "Mantido no Cliente B",
        hourlyRateCents: 16_000,
      },
      database.prisma,
    );
    expect(updatedSameClient.name).toBe("Projeto Renomeado Com Histórico");
    expect(updatedSameClient.hourlyRateCents).toBe(16_000);
  });

  it("audita alterações de tarifas na mesma transação e nunca recalcula apontamentos históricos", async () => {
    const client = await clientService.createClient(
      { name: "Cliente Auditoria", hourlyRateCents: 10_000 },
      database.prisma,
    );
    const project = await projectService.createProject(
      {
        clientId: client.id,
        name: "Projeto Auditoria",
        hourlyRateCents: 12_000,
      },
      database.prisma,
    );

    const historicalEntry = await database.prisma.timeEntry.create({
      data: {
        projectId: project.id,
        workDate: "2026-10-10",
        mode: "DURATION",
        durationMinutes: 90,
        hourlyRateCents: 12_000,
        amountCents: 18_000,
        billable: true,
        status: "DRAFT",
      },
    });

    await clientService.updateClient(
      client.id,
      {
        name: client.name,
        description: "Tarifa reajustada",
        hourlyRateCents: 15_000,
      },
      database.prisma,
    );

    await projectService.updateProject(
      project.id,
      {
        clientId: client.id,
        name: project.name,
        description: "Tarifa do projeto reajustada",
        hourlyRateCents: 20_000,
      },
      database.prisma,
    );

    // O apontamento histórico permanece intacto
    const entryAfter = await database.prisma.timeEntry.findUniqueOrThrow({
      where: { id: historicalEntry.id },
    });
    expect(entryAfter.hourlyRateCents).toBe(12_000);
    expect(entryAfter.amountCents).toBe(18_000);

    // Verifica AuditLog de Client e Project com antes/depois
    const clientAudit = await database.prisma.auditLog.findFirstOrThrow({
      where: {
        entity: "Client",
        entityId: client.id,
        action: "UPDATE",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(clientAudit.before).toEqual(
      expect.objectContaining({ hourlyRateCents: 10_000 }),
    );
    expect(clientAudit.after).toEqual(
      expect.objectContaining({ hourlyRateCents: 15_000 }),
    );

    const projectAudit = await database.prisma.auditLog.findFirstOrThrow({
      where: {
        entity: "Project",
        entityId: project.id,
        action: "UPDATE",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(projectAudit.before).toEqual(
      expect.objectContaining({ hourlyRateCents: 12_000 }),
    );
    expect(projectAudit.after).toEqual(
      expect.objectContaining({ hourlyRateCents: 20_000 }),
    );

    // Verifica atomicidade (rollback se a gravação de AuditLog falhar)
    await database.prisma.$executeRawUnsafe(`
      CREATE TRIGGER "Catalog_audit_failure"
      BEFORE INSERT ON "AuditLog"
      BEGIN
        SELECT RAISE(ABORT, 'audit failure');
      END
    `);

    try {
      await expect(
        projectService.updateProject(
          project.id,
          {
            clientId: client.id,
            name: project.name,
            hourlyRateCents: 99_900,
          },
          database.prisma,
        ),
      ).rejects.toThrow();
    } finally {
      await database.prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS "Catalog_audit_failure"',
      );
    }

    const projectAfterRollback = await projectService.getProject(
      project.id,
      database.prisma,
    );
    expect(projectAfterRollback.hourlyRateCents).toBe(20_000);
  });
});
