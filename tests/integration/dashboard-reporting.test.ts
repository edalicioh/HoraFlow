import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { formatMinutesAsDuration } from "@/lib/duration";
import { formatCentsAsBRL } from "@/lib/money";
import {
  closeBillingPeriod,
  reopenBillingPeriod,
} from "@/modules/billing/service";
import {
  createClient as createCustomer,
  updateClient,
} from "@/modules/client/service";
import { getMonthlyDashboard } from "@/modules/dashboard/service";
import { createPayment, voidPayment } from "@/modules/payment/service";
import { createProject, updateProject } from "@/modules/project/service";
import { exportReportToCsv } from "@/modules/reporting/exporters/csv";
import {
  exportReportToPdf,
  inspectGeneratedPdfBuffer,
} from "@/modules/reporting/exporters/pdf";
import { exportReportToXlsx } from "@/modules/reporting/exporters/xlsx";
import { generateReportDataset } from "@/modules/reporting/service";
import { REPORT_TYPES } from "@/modules/reporting/types";
import { createTimeEntry } from "@/modules/time-entry/service";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

describe("Dashboard mensal, relatórios unificados e exportações CSV/XLSX/PDF (Fase 4)", () => {
  const databases: TestDatabase[] = [];

  afterEach(async () => {
    while (databases.length > 0) {
      const db = databases.pop();
      if (db) {
        await db.cleanup();
      }
    }
  });

  it("conta 1 dia trabalhado para dois lançamentos na mesma data civil e horas não faturáveis somam tempo com cobrança zero", async () => {
    const testDb = createTestDatabase("f4-days-nonbillable");
    databases.push(testDb);
    const { prisma } = testDb;

    const client = await createCustomer(
      {
        name: "Alpha Sistemas",
        description: null,
        hourlyRateCents: 15_000, // R$ 150,00/h
      },
      prisma,
    );

    const project = await createProject(
      {
        clientId: client.id,
        name: "ERP Cloud",
        description: null,
        hourlyRateCents: 15_000,
      },
      prisma,
    );

    // Dois apontamentos faturáveis no mesmo dia civil (2026-10-10)
    await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-10",
        durationText: "02:00", // 120m -> R$ 300,00 (30000 cents)
        description: "Manhã",
        billable: true,
      },
      prisma,
    );

    await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-10",
        durationText: "03:30", // 210m -> R$ 525,00 (52500 cents)
        description: "Tarde",
        billable: true,
      },
      prisma,
    );

    // Um apontamento não faturável no mesmo dia civil (2026-10-10)
    await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-10",
        durationText: "01:30", // 90m -> R$ 0,00
        description: "Treinamento interno",
        billable: false,
      },
      prisma,
    );

    const dashboard = await getMonthlyDashboard(
      { year: 2026, month: 10 },
      prisma,
    );

    expect(dashboard.entryCount).toBe(3);
    expect(dashboard.workedDaysCount).toBe(1);
    expect(dashboard.totalWorkedMinutes).toBe(420); // 7h00
    expect(dashboard.billableMinutes).toBe(330); // 5h30
    expect(dashboard.nonBillableMinutes).toBe(90); // 1h30
    expect(dashboard.accumulatedBillableCents).toBe(82_500); // R$ 825,00
    expect(dashboard.unbilledDraftCents).toBe(82_500);
    expect(dashboard.totalPendingCompetenceCents).toBe(82_500);

    const reportByPeriod = await generateReportDataset(
      {
        reportType: "hours-by-period",
        year: 2026,
        month: 10,
      },
      prisma,
    );

    expect(reportByPeriod.workedDaysCount).toBe(1);
    expect(reportByPeriod.rows).toHaveLength(1);
    expect(reportByPeriod.totalMinutes).toBe(420);
    expect(reportByPeriod.billableMinutes).toBe(330);
    expect(reportByPeriod.totalCents).toBe(82_500);
  });

  it("garante equivalência 1:1 de IDs, minutos e centavos entre tela (/reports) e exportações CSV, XLSX e PDF nos 7 relatórios", async () => {
    const testDb = createTestDatabase("f4-parity-all-reports");
    databases.push(testDb);
    const { prisma } = testDb;

    const clientA = await createCustomer(
      {
        name: "Banco Horizonte",
        description: null,
        hourlyRateCents: 20_000, // R$ 200,00/h
      },
      prisma,
    );
    const projectA = await createProject(
      {
        clientId: clientA.id,
        name: "Core PIX",
        description: null,
        hourlyRateCents: 20_000,
      },
      prisma,
    );

    const clientB = await createCustomer(
      {
        name: "Logística Sul",
        description: null,
        hourlyRateCents: 12_000, // R$ 120,00/h
      },
      prisma,
    );
    const projectB = await createProject(
      {
        clientId: clientB.id,
        name: "Roteirizador",
        description: null,
        hourlyRateCents: 12_000,
      },
      prisma,
    );

    await createTimeEntry(
      {
        mode: "DURATION",
        projectId: projectA.id,
        workDate: "2026-10-05",
        durationText: "04:00", // 240m -> 80000 cents
        description: "Módulo liquidação",
        billable: true,
      },
      prisma,
    );

    await createTimeEntry(
      {
        mode: "DURATION",
        projectId: projectB.id,
        workDate: "2026-10-12",
        durationText: "02:30", // 150m -> 30000 cents
        description: "Otimização de rotas",
        billable: true,
      },
      prisma,
    );

    // Fecha competência do cliente A e registra pagamento parcial
    const closedA = await closeBillingPeriod(
      { clientId: clientA.id, year: 2026, month: 10 },
      prisma,
    );

    await createPayment(
      {
        billingPeriodId: closedA.id,
        amountCents: 50_000,
        paidDate: "2026-10-20",
        method: "PIX",
        note: "1ª parcela PIX",
      },
      prisma,
    );

    for (const reportType of REPORT_TYPES) {
      const dataset = await generateReportDataset(
        {
          reportType,
          year: 2026,
          month: 10,
        },
        prisma,
      );

      expect(dataset.rows.length).toBeGreaterThan(0);
      expect(dataset.matchedRecordIds.length).toBeGreaterThan(0);

      // 1. Verifica CSV
      const csv = exportReportToCsv(dataset);
      expect(csv).toContain(dataset.title);
      if (dataset.totalCents > 0) {
        expect(csv).toContain(formatCentsAsBRL(dataset.totalCents));
      }
      if (dataset.totalMinutes > 0) {
        expect(csv).toContain(formatMinutesAsDuration(dataset.totalMinutes));
      }

      // 2. Verifica XLSX reabrindo via ExcelJS
      const xlsxBuffer = await exportReportToXlsx(dataset);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsxBuffer as unknown as ExcelJS.Buffer);
      const sheet = workbook.getWorksheet("Relatório");
      expect(sheet).toBeDefined();
      if (sheet) {
        // 5 linhas de cabeçalho + N linhas de dados + 1 linha de total
        const expectedDataStartRow = 6;
        const expectedTotalsRowIndex =
          expectedDataStartRow + dataset.rows.length;
        const totalsRow = sheet.getRow(expectedTotalsRowIndex);

        dataset.columns.forEach((col, idx) => {
          const expectedTotalVal = dataset.totalsRow?.[col.key];
          if (col.kind === "money" && typeof expectedTotalVal === "number") {
            expect(totalsRow.getCell(idx + 1).value).toBeCloseTo(
              expectedTotalVal / 100,
              2,
            );
          }
          if (col.kind === "duration" && typeof expectedTotalVal === "number") {
            expect(totalsRow.getCell(idx + 1).value).toBe(
              formatMinutesAsDuration(expectedTotalVal),
            );
          }
        });
      }

      // 3. Verifica PDF
      const pdfBuffer = await exportReportToPdf(dataset);
      const pdfInspection = inspectGeneratedPdfBuffer(pdfBuffer);
      expect(pdfInspection.isValidPdfHeader).toBe(true);
      expect(pdfInspection.pageCount).toBeGreaterThanOrEqual(1);
      expect(pdfInspection.extractedText).toContain(dataset.title);
      if (dataset.totalCents > 0) {
        expect(pdfInspection.extractedText).toContain(
          formatCentsAsBRL(dataset.totalCents).replace(/\u00A0/g, " "),
        );
      }
    }
  });

  it("reflete estorno de pagamento, pagamento em outro mês (competência vs paidAt), reabertura sem dupla contagem e imutabilidade de snapshot após mudança de tarifa", async () => {
    const testDb = createTestDatabase("f4-financial-invariants");
    databases.push(testDb);
    const { prisma } = testDb;

    const client = await createCustomer(
      {
        name: "Vanguarda Digital",
        description: null,
        hourlyRateCents: 10_000, // R$ 100,00/h
      },
      prisma,
    );
    const project = await createProject(
      {
        clientId: client.id,
        name: "App Mobile",
        description: null,
        hourlyRateCents: 10_000,
      },
      prisma,
    );

    await createTimeEntry(
      {
        mode: "DURATION",
        projectId: project.id,
        workDate: "2026-10-08",
        durationText: "05:00", // 300m -> R$ 500,00 (50000 cents)
        description: "Sprint 1",
        billable: true,
      },
      prisma,
    );

    // 1. Fecha competência 10/2026 (Revisão #1: 50000 cents)
    const closedRev1 = await closeBillingPeriod(
      { clientId: client.id, year: 2026, month: 10 },
      prisma,
    );

    // 2. Registra pagamento parcial em NOVEMBRO (2026-11-05) referente à competência 10/2026
    const payment1 = await createPayment(
      {
        billingPeriodId: closedRev1.id,
        amountCents: 20_000,
        paidDate: "2026-11-05",
        method: "PIX",
        note: "Recebido no mês seguinte",
      },
      prisma,
    );

    // Dashboard de 10/2026 usa semântica de competência: deve exibir R$ 200,00 recebidos e R$ 300,00 pendentes
    const dashOctWithPayment = await getMonthlyDashboard(
      { year: 2026, month: 10 },
      prisma,
    );
    expect(dashOctWithPayment.closedBillingsCents).toBe(50_000);
    expect(dashOctWithPayment.receivedCompetenceCents).toBe(20_000);
    expect(dashOctWithPayment.closedBalanceCents).toBe(30_000);
    expect(dashOctWithPayment.unbilledDraftCents).toBe(0);
    expect(dashOctWithPayment.totalPendingCompetenceCents).toBe(30_000);

    // Relatório payments-and-balances:
    // - No modo PAID_AT filtrando 10/2026 -> 0 pagamentos (pois foi pago em 2026-11-05)
    // - No modo PAID_AT filtrando 11/2026 -> 1 pagamento (R$ 200,00)
    // - No modo COMPETENCE filtrando 10/2026 -> 1 pagamento (R$ 200,00)
    const paymentsOctByPaidAt = await generateReportDataset(
      {
        reportType: "payments-and-balances",
        year: 2026,
        month: 10,
        paymentFilterMode: "PAID_AT",
      },
      prisma,
    );
    expect(paymentsOctByPaidAt.rows).toHaveLength(0);
    expect(paymentsOctByPaidAt.totalCents).toBe(0);

    const paymentsNovByPaidAt = await generateReportDataset(
      {
        reportType: "payments-and-balances",
        year: 2026,
        month: 11,
        paymentFilterMode: "PAID_AT",
      },
      prisma,
    );
    expect(paymentsNovByPaidAt.rows).toHaveLength(1);
    expect(paymentsNovByPaidAt.totalCents).toBe(20_000);

    const paymentsOctByCompetence = await generateReportDataset(
      {
        reportType: "payments-and-balances",
        year: 2026,
        month: 10,
        paymentFilterMode: "COMPETENCE",
      },
      prisma,
    );
    expect(paymentsOctByCompetence.rows).toHaveLength(1);
    expect(paymentsOctByCompetence.totalCents).toBe(20_000);

    // 3. Estorna o pagamento -> deixa de contar no recebido e restaura saldo de R$ 500,00
    await voidPayment(
      {
        paymentId: payment1.id,
        reason: "Estorno para reabertura",
      },
      prisma,
    );

    const dashAfterVoid = await getMonthlyDashboard(
      { year: 2026, month: 10 },
      prisma,
    );
    expect(dashAfterVoid.receivedCompetenceCents).toBe(0);
    expect(dashAfterVoid.closedBalanceCents).toBe(50_000);

    const paymentsAfterVoid = await generateReportDataset(
      {
        reportType: "payments-and-balances",
        year: 2026,
        month: 10,
        paymentFilterMode: "COMPETENCE",
        includeVoidedPayments: true,
      },
      prisma,
    );
    // Linha continua visível para trilha histórica, mas totalCents ativo é 0
    expect(paymentsAfterVoid.rows).toHaveLength(1);
    expect(paymentsAfterVoid.totalCents).toBe(0);

    // 4. Reabre competência -> sem dupla contagem (itens liberados não duplicam horas nem valores)
    await reopenBillingPeriod(
      {
        billingPeriodId: closedRev1.id,
        reason: "Inclusão de novo apontamento",
      },
      prisma,
    );

    const dashReopened = await getMonthlyDashboard(
      { year: 2026, month: 10 },
      prisma,
    );
    expect(dashReopened.totalWorkedMinutes).toBe(300);
    expect(dashReopened.accumulatedBillableCents).toBe(50_000);
    expect(dashReopened.unbilledDraftCents).toBe(50_000);
    expect(dashReopened.closedBalanceCents).toBe(0);
    expect(dashReopened.totalPendingCompetenceCents).toBe(50_000);

    // 5. Altera tarifa e nome no catálogo -> apontamento existente mantém R$ 100,00/h; refechamento (Revisão #2) não duplica itens
    await updateClient(
      client.id,
      {
        name: "Vanguarda Digital Renomeada",
        description: null,
        hourlyRateCents: 35_000, // R$ 350,00/h
      },
      prisma,
    );
    await updateProject(
      project.id,
      {
        clientId: client.id,
        name: "App Mobile v2",
        description: null,
        hourlyRateCents: 35_000,
      },
      prisma,
    );

    // Refecha competência (Revisão #2)
    await closeBillingPeriod(
      { clientId: client.id, year: 2026, month: 10 },
      prisma,
    );

    // Após o fechamento, altera novamente o catálogo para confirmar que o snapshot congelado no fechamento não muda
    await updateClient(
      client.id,
      {
        name: "Nome Pós-Fechamento",
        description: null,
        hourlyRateCents: 99_000,
      },
      prisma,
    );

    const detailedAfterCatalogChange = await generateReportDataset(
      {
        reportType: "detailed-entries",
        year: 2026,
        month: 10,
      },
      prisma,
    );

    expect(detailedAfterCatalogChange.rows).toHaveLength(1);
    expect(detailedAfterCatalogChange.totalMinutes).toBe(300);
    expect(detailedAfterCatalogChange.totalCents).toBe(50_000); // Mantém R$ 500,00 (não muda para R$ 1.750,00 nem R$ 4.950,00)
    expect(detailedAfterCatalogChange.rows[0]?.cells.clientName).toBe(
      "Vanguarda Digital Renomeada",
    );
  });
});
