import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatMinutesAsDuration } from "@/lib/duration";
import {
  createClient,
  createTestDatabase,
  type TestDatabase,
} from "../helpers/database";

let database: TestDatabase;
let clientService: typeof import("@/modules/client/service");
let projectService: typeof import("@/modules/project/service");
let settingsService: typeof import("@/modules/settings/service");
let timeEntryService: typeof import("@/modules/time-entry/service");
let databaseModule: typeof import("@/lib/db");

beforeAll(async () => {
  database = createTestDatabase("time-entry");
  process.env.DATABASE_URL = database.url;
  settingsService = await import("@/modules/settings/service");
  clientService = await import("@/modules/client/service");
  projectService = await import("@/modules/project/service");
  timeEntryService = await import("@/modules/time-entry/service");
  databaseModule = await import("@/lib/db");

  await settingsService.updateSettings({
    timezone: "America/Sao_Paulo",
    defaultHourlyRateCents: 7_500,
  });
});

afterAll(async () => {
  await databaseModule.prisma.$disconnect();
  await database.cleanup();
});

describe("Gestão de horas, intervalos, concorrência e calendário (Fase 2)", () => {
  it("calcula 05:30 e 08:00–13:30 como 330 minutos (41250 centavos a 7500/h) e half-up de 1 min a 30/h = 1 centavo", async () => {
    const client = await clientService.createClient(
      { name: "Cliente Horas Base", hourlyRateCents: null },
      database.prisma,
    );
    const project = await projectService.createProject(
      {
        clientId: client.id,
        name: "Projeto Base 75/h",
        hourlyRateCents: null,
      },
      database.prisma,
    );

    const byDuration = await timeEntryService.createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-05",
        durationText: "05:30",
        description: "Lançamento por duração",
        billable: true,
      },
      database.prisma,
    );

    expect(byDuration.durationMinutes).toBe(330);
    expect(byDuration.hourlyRateCents).toBe(7_500);
    expect(byDuration.amountCents).toBe(41_250);
    expect(byDuration.status).toBe("DRAFT");

    const byInterval = await timeEntryService.createTimeEntry(
      {
        mode: "INTERVAL",
        projectId: project.id,
        startDate: "2026-10-05",
        startTime: "08:00",
        endDate: "2026-10-05",
        endTime: "13:30",
        description: "Lançamento por intervalo",
        billable: true,
      },
      database.prisma,
    );

    expect(byInterval.durationMinutes).toBe(330);
    expect(byInterval.hourlyRateCents).toBe(7_500);
    expect(byInterval.amountCents).toBe(41_250);

    // 1 minuto a 30 centavos/h -> 0,5 centavo -> half-up para 1 centavo
    const halfUpEntry = await timeEntryService.createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-05",
        durationMinutes: 1,
        hourlyRateCents: 30,
        billable: true,
      },
      database.prisma,
    );
    expect(halfUpEntry.amountCents).toBe(1);

    // Não faturável no mesmo dia: soma horas e gera 0 centavos
    const nonBillableEntry = await timeEntryService.createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-05",
        durationText: "02:00",
        billable: false,
      },
      database.prisma,
    );
    expect(nonBillableEntry.durationMinutes).toBe(120);
    expect(nonBillableEntry.hourlyRateCents).toBe(7_500);
    expect(nonBillableEntry.amountCents).toBe(0);

    // Múltiplos lançamentos no mesmo dia (2026-10-05) somam horas e contam 1 dia trabalhado
    const calendar = await timeEntryService.getMonthlyCalendar(
      {
        year: 2026,
        month: 10,
        selectedDate: "2026-10-05",
        projectId: project.id,
      },
      database.prisma,
    );

    expect(calendar.days).toHaveLength(31);
    expect(calendar.selectedDay.date).toBe("2026-10-05");
    expect(calendar.selectedDay.entryCount).toBe(4);
    expect(calendar.selectedDay.totalMinutes).toBe(330 + 330 + 1 + 120);
    expect(calendar.selectedDay.totalCents).toBe(41_250 + 41_250 + 1);
    expect(calendar.totals.workedDaysCount).toBe(1);
    expect(calendar.totals.billableMinutes).toBe(661);
    expect(calendar.totals.nonBillableMinutes).toBe(120);
  });

  it("valida intervalos iguais, contidos, cruzados, adjacentes e edição do próprio registro", async () => {
    const clientA = await clientService.createClient(
      { name: "Cliente Intervalo A", hourlyRateCents: 10_000 },
      database.prisma,
    );
    const clientB = await clientService.createClient(
      { name: "Cliente Intervalo B", hourlyRateCents: 12_000 },
      database.prisma,
    );
    const projectA = await projectService.createProject(
      { clientId: clientA.id, name: "Projeto A" },
      database.prisma,
    );
    const projectB = await projectService.createProject(
      { clientId: clientB.id, name: "Projeto B" },
      database.prisma,
    );

    // Cria janela 08:00–09:00 em 2026-10-12 no Projeto A
    const first = await timeEntryService.createTimeEntry(
      {
        mode: "INTERVAL",
        projectId: projectA.id,
        startDate: "2026-10-12",
        startTime: "08:00",
        endDate: "2026-10-12",
        endTime: "09:00",
      },
      database.prisma,
    );

    // Adjacente 09:00–10:00 em outro cliente/projeto é permitido
    const adjacent = await timeEntryService.createTimeEntry(
      {
        mode: "INTERVAL",
        projectId: projectB.id,
        startDate: "2026-10-12",
        startTime: "09:00",
        endDate: "2026-10-12",
        endTime: "10:00",
      },
      database.prisma,
    );
    expect(adjacent.durationMinutes).toBe(60);

    // Igual (08:00–09:00) -> bloqueado globalmente mesmo em outro projeto
    await expect(
      timeEntryService.createTimeEntry(
        {
          mode: "INTERVAL",
          projectId: projectB.id,
          startDate: "2026-10-12",
          startTime: "08:00",
          endDate: "2026-10-12",
          endTime: "09:00",
        },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Contido (08:15–08:45) -> bloqueado
    await expect(
      timeEntryService.createTimeEntry(
        {
          mode: "INTERVAL",
          projectId: projectB.id,
          startDate: "2026-10-12",
          startTime: "08:15",
          endDate: "2026-10-12",
          endTime: "08:45",
        },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Cruzado (08:30–09:30) -> bloqueado
    await expect(
      timeEntryService.createTimeEntry(
        {
          mode: "INTERVAL",
          projectId: projectA.id,
          startDate: "2026-10-12",
          startTime: "08:30",
          endDate: "2026-10-12",
          endTime: "09:30",
        },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Edição do próprio registro `first` (07:30–09:00) não conflita consigo mesmo
    const updatedFirst = await timeEntryService.updateTimeEntry(
      first.id,
      {
        mode: "INTERVAL",
        projectId: projectA.id,
        startDate: "2026-10-12",
        startTime: "07:30",
        endDate: "2026-10-12",
        endTime: "09:00",
        description: "Expandido para 07:30–09:00",
      },
      database.prisma,
    );
    expect(updatedFirst.durationMinutes).toBe(90);

    // Após excluir logicamente `adjacent` (09:00–10:00), a janela 09:00–10:00 fica livre
    await timeEntryService.deleteTimeEntry(adjacent.id, database.prisma);
    const recreated = await timeEntryService.createTimeEntry(
      {
        mode: "INTERVAL",
        projectId: projectB.id,
        startDate: "2026-10-12",
        startTime: "09:00",
        endDate: "2026-10-12",
        endTime: "10:00",
      },
      database.prisma,
    );
    expect(recreated.durationMinutes).toBe(60);
  });

  it("impede que duas criações concorrentes sobrepostas em conexões SQLite independentes sejam ambas aceitas", async () => {
    const client = await clientService.createClient(
      { name: "Cliente Concorrência", hourlyRateCents: 10_000 },
      database.prisma,
    );
    const project = await projectService.createProject(
      { clientId: client.id, name: "Projeto Concorrência" },
      database.prisma,
    );

    const connA = createClient(database.url);
    const connB = createClient(database.url);

    try {
      const results = await Promise.allSettled([
        timeEntryService.createTimeEntry(
          {
            mode: "INTERVAL",
            projectId: project.id,
            startDate: "2026-10-18",
            startTime: "14:00",
            endDate: "2026-10-18",
            endTime: "16:00",
            description: "Concorrente A",
          },
          connA,
        ),
        timeEntryService.createTimeEntry(
          {
            mode: "INTERVAL",
            projectId: project.id,
            startDate: "2026-10-18",
            startTime: "15:00",
            endDate: "2026-10-18",
            endTime: "17:00",
            description: "Concorrente B",
          },
          connB,
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject({ code: "CONFLICT" });

      const activeInWindow = await database.prisma.timeEntry.count({
        where: {
          projectId: project.id,
          workDate: "2026-10-18",
          deletedAt: null,
        },
      });
      expect(activeInWindow).toBe(1);
    } finally {
      await Promise.all([connA.$disconnect(), connB.$disconnect()]);
    }
  });

  it("preserva snapshot de tarifa após mudança no catálogo, permite editar rascunho de cadastro inativado e respeita competência na virada de mês/bissexto/acima de 24h", async () => {
    const client = await clientService.createClient(
      { name: "Cliente Histórico Fase 2", hourlyRateCents: 9_000 },
      database.prisma,
    );
    const project = await projectService.createProject(
      {
        clientId: client.id,
        name: "Projeto Histórico Fase 2",
        hourlyRateCents: 12_000,
      },
      database.prisma,
    );

    // 1. Apontamento acima de 24h (100:00 = 6000 min) em fevereiro bissexto (2024-02-29)
    const leapEntry = await timeEntryService.createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2024-02-29",
        durationText: "100:00",
        description: "Pacote 100h em ano bissexto",
      },
      database.prisma,
    );
    expect(leapEntry.durationMinutes).toBe(6_000);
    expect(formatMinutesAsDuration(leapEntry.durationMinutes)).toBe("100:00");
    expect(leapEntry.hourlyRateCents).toBe(12_000);
    expect(leapEntry.amountCents).toBe(1_200_000);

    // 2. Intervalo atravessando virada de mês (outubro -> novembro): tudo atribuído a 2026-10-31
    const crossMonthEntry = await timeEntryService.createTimeEntry(
      {
        mode: "INTERVAL",
        projectId: project.id,
        startDate: "2026-10-31",
        startTime: "23:00",
        endDate: "2026-11-01",
        endTime: "01:30",
        description: "Virada de mês",
      },
      database.prisma,
    );
    expect(crossMonthEntry.workDate).toBe("2026-10-31");
    expect(crossMonthEntry.durationMinutes).toBe(150);

    // 3. Muda tarifa do projeto no catálogo e fuso horário global -> registros históricos não mudam tarifa nem workDate
    await projectService.updateProject(
      project.id,
      {
        clientId: client.id,
        name: project.name,
        hourlyRateCents: 25_000,
      },
      database.prisma,
    );
    await settingsService.updateSettings({
      timezone: "America/Manaus",
      defaultHourlyRateCents: 7_500,
    });

    const crossAfterSettingsChange = await timeEntryService.getTimeEntry(
      crossMonthEntry.id,
      database.prisma,
    );
    expect(crossAfterSettingsChange.workDate).toBe("2026-10-31");
    expect(crossAfterSettingsChange.hourlyRateCents).toBe(12_000);

    // Restaura America/Sao_Paulo
    await settingsService.updateSettings({
      timezone: "America/Sao_Paulo",
      defaultHourlyRateCents: 7_500,
    });

    // 4. Desativa o projeto: novos lançamentos são bloqueados, mas edição do rascunho existente preserva projeto e tarifa gravada
    await projectService.setProjectActive(project.id, false, database.prisma);

    await expect(
      timeEntryService.createTimeEntry(
        {
          mode: "DURATION",
          projectId: project.id,
          workDate: "2026-10-20",
          durationText: "01:00",
        },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const editedExisting = await timeEntryService.updateTimeEntry(
      leapEntry.id,
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2024-02-29",
        durationText: "24:30",
        description: "Ajustado mantendo snapshot de tarifa 120,00/h",
      },
      database.prisma,
    );
    expect(editedExisting.durationMinutes).toBe(1_470);
    expect(editedExisting.hourlyRateCents).toBe(12_000);
    expect(editedExisting.amountCents).toBe(294_000);
  });

  it("bloqueia criação, edição e exclusão em competência fechada (CLOSED) e edição/exclusão de registro faturado (BILLED)", async () => {
    const client = await clientService.createClient(
      { name: "Cliente Guarda Financeira", hourlyRateCents: 10_000 },
      database.prisma,
    );
    const project = await projectService.createProject(
      { clientId: client.id, name: "Projeto Guarda Financeira" },
      database.prisma,
    );

    const draftEntry = await timeEntryService.createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-09-10",
        durationText: "04:00",
      },
      database.prisma,
    );

    const billedEntry = await timeEntryService.createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-08-10",
        durationText: "03:00",
      },
      database.prisma,
    );

    await database.prisma.timeEntry.update({
      where: { id: billedEntry.id },
      data: { status: "BILLED" },
    });

    // Registro BILLED não pode ser editado nem excluído por chamada direta
    await expect(
      timeEntryService.updateTimeEntry(
        billedEntry.id,
        {
          mode: "DURATION",
          projectId: project.id,
          workDate: "2026-08-10",
          durationText: "05:00",
        },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      timeEntryService.deleteTimeEntry(billedEntry.id, database.prisma),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Fecha a competência 09/2026 do cliente
    await database.prisma.billingPeriod.create({
      data: {
        clientId: client.id,
        year: 2026,
        month: 9,
        revision: 1,
        status: "CLOSED",
        clientNameSnapshot: client.name,
        totalMinutes: 240,
        totalCents: 40_000,
        closedAt: new Date(),
      },
    });

    // Não permite criar, editar ou excluir em 09/2026 enquanto CLOSED
    await expect(
      timeEntryService.createTimeEntry(
        {
          mode: "DURATION",
          projectId: project.id,
          workDate: "2026-09-15",
          durationText: "02:00",
        },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      timeEntryService.updateTimeEntry(
        draftEntry.id,
        {
          mode: "DURATION",
          projectId: project.id,
          workDate: "2026-09-10",
          durationText: "06:00",
        },
        database.prisma,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      timeEntryService.deleteTimeEntry(draftEntry.id, database.prisma),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
