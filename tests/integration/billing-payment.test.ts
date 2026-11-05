import { afterEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/lib/errors";
import {
  closeBillingPeriod,
  computeBillingOverviewTotals,
  getBillingPeriodDetail,
  listBillingPeriods,
  previewMonthlyClosing,
  reopenBillingPeriod,
} from "@/modules/billing/service";
import {
  createClient as createCustomer,
  updateClient,
} from "@/modules/client/service";
import { createPayment, voidPayment } from "@/modules/payment/service";
import { createProject, updateProject } from "@/modules/project/service";
import {
  createTimeEntry,
  deleteTimeEntry,
  updateTimeEntry,
} from "@/modules/time-entry/service";
import {
  createClient as createSqliteConnection,
  createTestDatabase,
  type TestDatabase,
} from "../helpers/database";

describe("Fechamentos, pagamentos, estornos, reabertura e concorrência SQLite (Fase 3)", () => {
  const databases: TestDatabase[] = [];

  afterEach(async () => {
    while (databases.length > 0) {
      const db = databases.pop();
      if (db) {
        await db.cleanup();
      }
    }
  });

  it("fecha competência, congela snapshots imutáveis, bloqueia edição de BILLED e diferencia vazio de tarifa zero", async () => {
    const testDb = createTestDatabase("f3-close");
    databases.push(testDb);
    const { prisma } = testDb;

    const client = await createCustomer(
      {
        name: "Acme Corp",
        description: "Cliente corporativo",
        hourlyRateCents: 10_000,
      },
      prisma,
    );

    const project = await createProject(
      {
        clientId: client.id,
        name: "Portal B2B",
        description: "Front-end",
        hourlyRateCents: 10_000,
      },
      prisma,
    );

    // Competência vazia deve bloquear fechamento
    const emptyPreview = await previewMonthlyClosing(
      { clientId: client.id, year: 2026, month: 10 },
      prisma,
    );
    expect(emptyPreview.canClose).toBe(false);
    expect(emptyPreview.items).toHaveLength(0);

    await expect(
      closeBillingPeriod(
        { clientId: client.id, year: 2026, month: 10 },
        prisma,
      ),
    ).rejects.toThrow(ConflictError);

    // Cria 2 apontamentos faturáveis + 1 não faturável em 10/2026
    const entry1 = await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-05",
        durationText: "05:30", // 330 min * 100,00 = 550,00 (55000 cents)
        description: "Arquitetura inicial",
        billable: true,
      },
      prisma,
    );

    const entry2 = await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-12",
        durationText: "02:00", // 120 min * 100,00 = 200,00 (20000 cents)
        description: "Integração de API",
        billable: true,
      },
      prisma,
    );

    const nonBillableEntry = await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-15",
        durationText: "01:30",
        description: "Reunião interna sem cobrança",
        billable: false,
      },
      prisma,
    );

    const preview = await previewMonthlyClosing(
      { clientId: client.id, year: 2026, month: 10 },
      prisma,
    );
    expect(preview.canClose).toBe(true);
    expect(preview.items).toHaveLength(2);
    expect(preview.totalMinutes).toBe(450);
    expect(preview.totalCents).toBe(75_000);

    const closed = await closeBillingPeriod(
      {
        clientId: client.id,
        year: 2026,
        month: 10,
        previewSignature: preview.previewSignature,
      },
      prisma,
    );

    expect(closed.status).toBe("CLOSED");
    expect(closed.revision).toBe(1);
    expect(closed.totalMinutes).toBe(450);
    expect(closed.totalCents).toBe(75_000);
    expect(closed.paidCents).toBe(0);
    expect(closed.balanceCents).toBe(75_000);
    expect(closed.paymentStatus).toBe("UNPAID");
    expect(closed.activeItems).toHaveLength(2);
    expect(closed.auditLogs.some((log) => log.action === "CLOSE")).toBe(true);

    // O registro não faturável não entra em BillingItem, mas a competência fechada bloqueia novas edições nele também
    const reloadedEntry1 = await prisma.timeEntry.findUniqueOrThrow({
      where: { id: entry1.id },
    });
    const reloadedEntry2 = await prisma.timeEntry.findUniqueOrThrow({
      where: { id: entry2.id },
    });
    expect(reloadedEntry1.status).toBe("BILLED");
    expect(reloadedEntry2.status).toBe("BILLED");

    // Altera nome e tarifa do cliente/projeto após fechar -> snapshot permanece imutável
    await updateClient(
      client.id,
      {
        name: "Acme Corp Renomeada",
        description: "Nova razão",
        hourlyRateCents: 25_000,
      },
      prisma,
    );
    await updateProject(
      project.id,
      {
        clientId: client.id,
        name: "Portal B2B v2",
        description: "Novo nome",
        hourlyRateCents: 30_000,
      },
      prisma,
    );

    const detailAfterCatalogChange = await getBillingPeriodDetail(
      closed.id,
      prisma,
    );
    expect(detailAfterCatalogChange.clientNameSnapshot).toBe("Acme Corp");
    expect(detailAfterCatalogChange.displayClientName).toBe("Acme Corp");
    expect(detailAfterCatalogChange.totalCents).toBe(75_000);
    const firstActiveItem = detailAfterCatalogChange.activeItems[0];
    expect(firstActiveItem).toBeDefined();
    expect(firstActiveItem?.clientName).toBe("Acme Corp");
    expect(firstActiveItem?.projectName).toBe("Portal B2B");
    expect(firstActiveItem?.hourlyRateCents).toBe(10_000);

    // Bloqueia edição/exclusão direta de apontamento BILLED e criação na competência fechada
    await expect(
      updateTimeEntry(
        entry1.id,
        {
          mode: "DURATION",
          projectId: project.id,
          workDate: "2026-10-05",
          durationText: "06:00",
          description: "Tentativa de fraude",
          billable: true,
        },
        prisma,
      ),
    ).rejects.toThrow(ConflictError);

    await expect(deleteTimeEntry(entry1.id, prisma)).rejects.toThrow(
      ConflictError,
    );

    await expect(
      deleteTimeEntry(nonBillableEntry.id, prisma),
    ).rejects.toThrow(ConflictError);

    await expect(
      createTimeEntry(
        {
          mode: "DURATION",
          projectId: project.id,
          workDate: "2026-10-20",
          durationText: "01:00",
          description: "Novo em competência fechada",
          billable: true,
        },
        prisma,
      ),
    ).rejects.toThrow(ConflictError);

    // Competência com apontamento elegível de tarifa zero (R$ 0,00) pode ser fechada
    await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-11-03",
        durationText: "02:00",
        hourlyRateCents: 0,
        description: "Cortesia contratual faturável a R$ 0,00",
        billable: true,
      },
      prisma,
    );

    const zeroClosed = await closeBillingPeriod(
      { clientId: client.id, year: 2026, month: 11 },
      prisma,
    );
    expect(zeroClosed.status).toBe("CLOSED");
    expect(zeroClosed.totalMinutes).toBe(120);
    expect(zeroClosed.totalCents).toBe(0);
    expect(zeroClosed.paymentStatus).toBe("PAID");
  });

  it("executa o ciclo completo: pagamento parcial, idempotência, bloqueio de sobrepagamento, estorno, reabertura e refechamento na revisão #2", async () => {
    const testDb = createTestDatabase("f3-cycle");
    databases.push(testDb);
    const { prisma } = testDb;

    const client = await createCustomer(
      { name: "Beta Logística", hourlyRateCents: 8_000 },
      prisma,
    );
    const project = await createProject(
      { clientId: client.id, name: "WMS Core", hourlyRateCents: 8_000 },
      prisma,
    );

    const entry1 = await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-08",
        durationText: "10:00", // 600 min * 80,00 = 800,00 (80000 cents)
        description: "Módulo de expedição",
        billable: true,
      },
      prisma,
    );

    const closedV1 = await closeBillingPeriod(
      { clientId: client.id, year: 2026, month: 10 },
      prisma,
    );
    expect(closedV1.totalCents).toBe(80_000);
    expect(closedV1.revision).toBe(1);

    // Pagamento parcial 1 com operationId idempotente
    const opId = "11111111-2222-4333-8444-555555555555";
    const pay1 = await createPayment(
      {
        billingPeriodId: closedV1.id,
        amountBRL: "300,00",
        paidDate: "2026-10-15",
        method: "PIX",
        note: "1ª parcela",
        operationId: opId,
      },
      prisma,
    );
    expect(pay1.amountCents).toBe(30_000);
    expect(pay1.paidDate).toBe("2026-10-15");

    // Reenvio duplicado com mesmo operationId não duplica o pagamento
    const pay1Duplicate = await createPayment(
      {
        billingPeriodId: closedV1.id,
        amountBRL: "300,00",
        paidDate: "2026-10-15",
        method: "PIX",
        note: "1ª parcela",
        operationId: opId,
      },
      prisma,
    );
    expect(pay1Duplicate.id).toBe(pay1.id);

    const detailAfterPartial = await getBillingPeriodDetail(
      closedV1.id,
      prisma,
    );
    expect(detailAfterPartial.paidCents).toBe(30_000);
    expect(detailAfterPartial.balanceCents).toBe(50_000);
    expect(detailAfterPartial.paymentStatus).toBe("PARTIAL");
    expect(detailAfterPartial.canReopen).toBe(false);

    // Tentar pagar acima do saldo em aberto (500,01) deve falhar sem efeitos
    await expect(
      createPayment(
        {
          billingPeriodId: closedV1.id,
          amountBRL: "500,01",
          paidDate: "2026-10-16",
          method: "PIX",
        },
        prisma,
      ),
    ).rejects.toThrow(ConflictError);

    // Tentar reabrir com pagamento ativo deve falhar
    await expect(
      reopenBillingPeriod(
        {
          billingPeriodId: closedV1.id,
          reason: "Tentativa indevida com pagamento ativo",
        },
        prisma,
      ),
    ).rejects.toThrow(ConflictError);

    // Estorna o pagamento ativo
    const voided = await voidPayment(
      {
        paymentId: pay1.id,
        reason: "Estorno para correção de horas na competência",
      },
      prisma,
    );
    expect(voided.voidedAt).not.toBeNull();
    expect(voided.amountCents).toBe(30_000);
    expect(voided.paidDate).toBe("2026-10-15");

    // Estorno repetido deve ser rejeitado sem criar segundo evento de auditoria
    await expect(
      voidPayment(
        {
          paymentId: pay1.id,
          reason: "Segundo estorno repetido",
        },
        prisma,
      ),
    ).rejects.toThrow(ConflictError);

    // Agora a reabertura é permitida e preserva histórico
    const reopened = await reopenBillingPeriod(
      {
        billingPeriodId: closedV1.id,
        reason: "Inclusão de horas extras de outubro",
      },
      prisma,
    );
    expect(reopened.status).toBe("REOPENED");
    expect(reopened.revision).toBe(1);
    expect(reopened.activeItems).toHaveLength(0);
    expect(reopened.releasedItems).toHaveLength(1);
    expect(reopened.releasedItems[0]?.revision).toBe(1);
    expect(reopened.payments).toHaveLength(1);
    expect(reopened.payments[0]?.voidedAt).not.toBeNull();
    expect(reopened.paidCents).toBe(0);
    expect(reopened.balanceCents).toBe(0);
    expect(reopened.paymentStatus).toBe("NOT_APPLICABLE");

    // Relatórios/saldos de cobrança ativa não contam período reaberto como dívida fechada atual
    const allSummaries = await listBillingPeriods({}, prisma);
    const overview = computeBillingOverviewTotals(allSummaries);
    expect(overview.closedCount).toBe(0);
    expect(overview.reopenedCount).toBe(1);
    expect(overview.totalOpenBalanceCents).toBe(0);

    // O apontamento original voltou para DRAFT e pode ser editado; adicionamos outro apontamento
    const draftEntry = await prisma.timeEntry.findUniqueOrThrow({
      where: { id: entry1.id },
    });
    expect(draftEntry.status).toBe("DRAFT");

    await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-20",
        durationText: "02:30", // 150 min * 80,00 = 200,00 (20000 cents)
        description: "Deploy assistido",
        billable: true,
      },
      prisma,
    );

    // Refecha a competência -> revisão #2, sem duplicar BillingPeriod e mantendo itens liberados da #1
    const closedV2 = await closeBillingPeriod(
      { clientId: client.id, year: 2026, month: 10 },
      prisma,
    );
    expect(closedV2.id).toBe(closedV1.id);
    expect(closedV2.status).toBe("CLOSED");
    expect(closedV2.revision).toBe(2);
    expect(closedV2.totalMinutes).toBe(750);
    expect(closedV2.totalCents).toBe(100_000);
    expect(closedV2.activeItems).toHaveLength(2);
    expect(closedV2.activeItems.every((i) => i.revision === 2)).toBe(true);
    expect(closedV2.releasedItems).toHaveLength(1);
    expect(closedV2.releasedItems[0]?.revision).toBe(1);

    // Quita integralmente na revisão #2
    await createPayment(
      {
        billingPeriodId: closedV2.id,
        amountBRL: "1000,00",
        paidDate: "2026-10-28",
        method: "Transferência / TED",
        note: "Quitação integral revisão #2",
      },
      prisma,
    );

    const finalDetail = await getBillingPeriodDetail(closedV2.id, prisma);
    expect(finalDetail.paidCents).toBe(100_000);
    expect(finalDetail.balanceCents).toBe(0);
    expect(finalDetail.paymentStatus).toBe("PAID");
    expect(finalDetail.auditLogs.map((l) => l.action)).toEqual([
      "CREATE",
      "RECLOSE",
      "REOPEN",
      "VOID",
      "CREATE",
      "CLOSE",
    ]);
  });

  it("serializa fechamentos concorrentes, pagamentos concorrentes acima do saldo e disputa pagar vs. reabrir em conexões SQLite independentes", async () => {
    const testDb = createTestDatabase("f3-concurrency");
    databases.push(testDb);
    const connA = createSqliteConnection(testDb.url);
    const connB = createSqliteConnection(testDb.url);

    try {
      const client = await createCustomer(
        { name: "Concorrência S/A", hourlyRateCents: 10_000 },
        connA,
      );
      const project = await createProject(
        {
          clientId: client.id,
          name: "Core Transacional",
          hourlyRateCents: 10_000,
        },
        connA,
      );

      await createTimeEntry(
        {
          mode: "DURATION",
          projectId: project.id,
          workDate: "2026-10-10",
          durationText: "08:00", // 480 min * 100,00 = 800,00 (80000 cents)
          description: "Trabalho base",
          billable: true,
        },
        connA,
      );

      // 1. Fechar duas vezes concorrentemente em conexões independentes
      const closeResults = await Promise.allSettled([
        closeBillingPeriod(
          { clientId: client.id, year: 2026, month: 10 },
          connA,
        ),
        closeBillingPeriod(
          { clientId: client.id, year: 2026, month: 10 },
          connB,
        ),
      ]);

      const closeFulfilled = closeResults.filter(
        (r) => r.status === "fulfilled",
      );
      const closeRejected = closeResults.filter(
        (r) => r.status === "rejected",
      );
      expect(closeFulfilled).toHaveLength(1);
      expect(closeRejected).toHaveLength(1);

      const periodId = (
        closeFulfilled[0] as PromiseFulfilledResult<
          Awaited<ReturnType<typeof closeBillingPeriod>>
        >
      ).value.id;

      // 2. Dois pagamentos concorrentes de R$ 500,00 cada num saldo de R$ 800,00 -> apenas um pode ser aceito
      const paymentResults = await Promise.allSettled([
        createPayment(
          {
            billingPeriodId: periodId,
            amountBRL: "500,00",
            paidDate: "2026-10-15",
            method: "PIX",
            note: "Concorrente A",
          },
          connA,
        ),
        createPayment(
          {
            billingPeriodId: periodId,
            amountBRL: "500,00",
            paidDate: "2026-10-15",
            method: "PIX",
            note: "Concorrente B",
          },
          connB,
        ),
      ]);

      const payFulfilled = paymentResults.filter(
        (r) => r.status === "fulfilled",
      );
      const payRejected = paymentResults.filter(
        (r) => r.status === "rejected",
      );
      expect(payFulfilled).toHaveLength(1);
      expect(payRejected).toHaveLength(1);

      const survivingPaymentId = (
        payFulfilled[0] as PromiseFulfilledResult<
          Awaited<ReturnType<typeof createPayment>>
        >
      ).value.id;

      // Estorna o pagamento vencedor para testar disputa Pagar vs. Reabrir
      await voidPayment(
        {
          paymentId: survivingPaymentId,
          reason: "Preparando disputa pagar vs reabrir",
        },
        connA,
      );

      // 3. Pagar enquanto tenta reabrir concorrentemente
      const racePayVsReopen = await Promise.allSettled([
        createPayment(
          {
            billingPeriodId: periodId,
            amountBRL: "200,00",
            paidDate: "2026-10-18",
            method: "Boleto",
          },
          connA,
        ),
        reopenBillingPeriod(
          {
            billingPeriodId: periodId,
            reason: "Reabertura concorrente ao pagamento",
          },
          connB,
        ),
      ]);

      const raceFulfilled = racePayVsReopen.filter(
        (r) => r.status === "fulfilled",
      );
      const raceRejected = racePayVsReopen.filter(
        (r) => r.status === "rejected",
      );
      expect(raceFulfilled).toHaveLength(1);
      expect(raceRejected).toHaveLength(1);

      const stateAfterRace = await getBillingPeriodDetail(periodId, connA);
      if (stateAfterRace.status === "REOPENED") {
        // Nunca pode estar REOPENED com pagamento ativo
        expect(stateAfterRace.activePaymentCount).toBe(0);
      } else {
        expect(stateAfterRace.status).toBe("CLOSED");
        expect(stateAfterRace.activePaymentCount).toBe(1);
      }
    } finally {
      await connA.$disconnect();
      await connB.$disconnect();
    }
  });

  it("impede fechamento com prévia defasada quando apontamento é inserido no intervalo e garante rollback integral se a auditoria falhar", async () => {
    const testDb = createTestDatabase("f3-rollback");
    databases.push(testDb);
    const { prisma } = testDb;

    const client = await createCustomer(
      { name: "Delta Auditoria", hourlyRateCents: 9_000 },
      prisma,
    );
    const project = await createProject(
      { clientId: client.id, name: "Audit Project", hourlyRateCents: 9_000 },
      prisma,
    );

    const entry1 = await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-02",
        durationText: "04:00",
        description: "Item 1",
        billable: true,
      },
      prisma,
    );

    const preview = await previewMonthlyClosing(
      { clientId: client.id, year: 2026, month: 10 },
      prisma,
    );

    // Novo apontamento inserido após a geração da prévia invalida previewSignature
    await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-03",
        durationText: "02:00",
        description: "Item 2 inserido antes da confirmação",
        billable: true,
      },
      prisma,
    );

    await expect(
      closeBillingPeriod(
        {
          clientId: client.id,
          year: 2026,
          month: 10,
          previewSignature: preview.previewSignature,
        },
        prisma,
      ),
    ).rejects.toThrow(ConflictError);

    // Simula falha forçada na tabela AuditLog para comprovar rollback integral da transação de fechamento
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_billing_audit
      BEFORE INSERT ON "AuditLog"
      WHEN NEW."entity" = 'BillingPeriod'
      BEGIN
        SELECT RAISE(ABORT, 'Simulated audit failure');
      END;
    `);

    await expect(
      closeBillingPeriod(
        { clientId: client.id, year: 2026, month: 10 },
        prisma,
      ),
    ).rejects.toThrow();

    // Verifica que nenhum BillingPeriod, BillingItem ou status BILLED escapou do rollback
    const periodsCount = await prisma.billingPeriod.count();
    const itemsCount = await prisma.billingItem.count();
    const checkEntry1 = await prisma.timeEntry.findUniqueOrThrow({
      where: { id: entry1.id },
    });

    expect(periodsCount).toBe(0);
    expect(itemsCount).toBe(0);
    expect(checkEntry1.status).toBe("DRAFT");

    await prisma.$executeRawUnsafe(`DROP TRIGGER fail_billing_audit;`);
  });
});
