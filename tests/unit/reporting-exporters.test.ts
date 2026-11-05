import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  escapeCsvField,
  exportReportToCsv,
  neutralizeFormulaInjection,
  UTF8_BOM,
} from "@/modules/reporting/exporters/csv";
import {
  exportReportToPdf,
  inspectGeneratedPdfBuffer,
} from "@/modules/reporting/exporters/pdf";
import {
  BRL_EXCEL_NUM_FMT,
  exportReportToXlsx,
} from "@/modules/reporting/exporters/xlsx";
import { parseReportFilter } from "@/modules/reporting/schema";
import type { ReportDataset } from "@/modules/reporting/types";

function makeSampleDataset(
  overrides: Partial<ReportDataset> = {},
): ReportDataset {
  return {
    reportType: "detailed-entries",
    title: "Apontamentos Detalhados",
    subtitle: "Listagem analítica de lançamentos",
    generatedAtIso: "2026-10-31T18:30:00.000Z",
    generatedAtLabel: "2026-10-31 15:30 (America/Sao_Paulo)",
    timezone: "America/Sao_Paulo",
    filter: {
      reportType: "detailed-entries",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      clientId: null,
      projectId: null,
      billable: "ALL",
      entryStatus: "ALL",
      year: 2026,
      month: 10,
      billingPeriodId: null,
      periodStatus: "ALL",
      paymentStatus: "ALL",
      paymentFilterMode: "PAID_AT",
      includeVoidedPayments: true,
    },
    appliedFilterSummary: [
      "Período: 2026-10-01 até 2026-10-31",
      "Competência: 10/2026",
    ],
    columns: [
      { key: "workDate", label: "Data", kind: "date", align: "left" },
      { key: "clientName", label: "Cliente", kind: "text", align: "left" },
      { key: "projectName", label: "Projeto", kind: "text", align: "left" },
      { key: "description", label: "Descrição", kind: "text", align: "left" },
      {
        key: "durationMinutes",
        label: "Duração",
        kind: "duration",
        align: "right",
      },
      { key: "amountCents", label: "Valor", kind: "money", align: "right" },
    ],
    rows: [
      {
        id: "row-1",
        cells: {
          workDate: "2026-10-15",
          clientName: "Conceito & Ação S/A",
          projectName: 'Portal "Alpha"; Fase 1',
          description: "Reunião de alinhamento;\nRevisão de escopo e exceções",
          durationMinutes: 1470, // 24:30 (acima de 24h)
          amountCents: 367500, // R$ 3.675,00
        },
      },
      {
        id: "row-2",
        cells: {
          workDate: "2026-10-16",
          clientName: "=CMD|' /C calc'!A0",
          projectName: " +SUM(A1:A10)",
          description: "@IMPORTXML(A1,A2)",
          durationMinutes: 6000, // 100:00
          amountCents: 1500000, // R$ 15.000,00
        },
      },
    ],
    totalsRow: {
      workDate: "Total (2 apontamento(s))",
      clientName: "",
      projectName: "",
      description: "",
      durationMinutes: 7470, // 124:30
      amountCents: 1867500, // R$ 18.675,00
    },
    summaryMetrics: [
      {
        label: "Apontamentos",
        value: "2",
        kind: "integer",
        rawNumber: 2,
      },
      {
        label: "Horas totais",
        value: "124:30",
        kind: "duration",
        rawNumber: 7470,
      },
      {
        label: "Valor total",
        value: "R$ 18.675,00",
        kind: "money",
        rawNumber: 1867500,
      },
    ],
    matchedRecordIds: ["row-1", "row-2"],
    totalMinutes: 7470,
    billableMinutes: 7470,
    totalCents: 1867500,
    workedDaysCount: 2,
    ...overrides,
  };
}

describe("Exportadores de relatórios (CSV, XLSX e PDF)", () => {
  describe("Filtro de relatório (parseReportFilter)", () => {
    it("rejeita mês de competência informado isoladamente sem o ano", () => {
      expect(() =>
        parseReportFilter({ reportType: "hours-by-period", month: 10 }),
      ).toThrow("Informe o ano ao filtrar por mês de competência.");
    });
  });

  describe("CSV Exporter e neutralização de fórmula", () => {
    it("neutraliza fórmulas iniciadas por =, +, -, @, tabulação ou precedidas por espaços", () => {
      expect(neutralizeFormulaInjection("=1+1")).toBe("'=1+1");
      expect(neutralizeFormulaInjection("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
      expect(neutralizeFormulaInjection("-2+3")).toBe("'-2+3");
      expect(neutralizeFormulaInjection("@HYPERLINK")).toBe("'@HYPERLINK");
      expect(neutralizeFormulaInjection("   =CMD()")).toBe("'   =CMD()");
      expect(neutralizeFormulaInjection("\t=1")).toBe("'\t=1");
      expect(neutralizeFormulaInjection("Texto normal com ç e ã")).toBe(
        "Texto normal com ç e ã",
      );
    });

    it("escapa aspas, ponto e vírgula e quebras de linha preservando UTF-8 BOM", () => {
      expect(escapeCsvField('Texto "com" aspas; e ponto e vírgula')).toBe(
        '"Texto ""com"" aspas; e ponto e vírgula"',
      );

      const dataset = makeSampleDataset();
      const csv = exportReportToCsv(dataset);

      expect(csv.startsWith(UTF8_BOM)).toBe(true);
      expect(csv).toContain("Data;Cliente;Projeto;Descrição;Duração;Valor");
      expect(csv).toContain("Conceito & Ação S/A");
      expect(csv).toContain('"Portal ""Alpha""; Fase 1"');
      expect(csv).toContain(
        '"Reunião de alinhamento;\nRevisão de escopo e exceções"',
      );
      expect(csv).toContain("24:30");
      expect(csv).toContain("100:00");
      expect(csv).toContain("124:30");
      // Neutralização das fórmulas do usuário
      expect(csv).toContain("'=CMD|' /C calc'!A0");
      expect(csv).toContain("' +SUM(A1:A10)");
      expect(csv).toContain("'@IMPORTXML(A1,A2)");
    });
  });

  describe("XLSX Exporter (ExcelJS)", () => {
    it("gera arquivo XLSX válido e reabre com ExcelJS conferindo cabeçalhos, números BRL, durações acima de 24h e neutralização", async () => {
      const dataset = makeSampleDataset();
      const buffer = await exportReportToXlsx(dataset);

      expect(buffer.byteLength).toBeGreaterThan(1000);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

      const sheet = workbook.getWorksheet("Relatório");
      expect(sheet).toBeDefined();
      if (!sheet) return;

      // Linha 1: Título
      expect(sheet.getRow(1).getCell(1).value).toBe("Apontamentos Detalhados");

      // Linha 5: Cabeçalhos
      const headerRow = sheet.getRow(5);
      expect(headerRow.getCell(1).value).toBe("Data");
      expect(headerRow.getCell(2).value).toBe("Cliente");
      expect(headerRow.getCell(5).value).toBe("Duração");
      expect(headerRow.getCell(6).value).toBe("Valor");

      // Linha 6: Primeiro registro (24:30 e R$ 3.675,00 numérico)
      const dataRow1 = sheet.getRow(6);
      expect(dataRow1.getCell(1).value).toBe("2026-10-15");
      expect(dataRow1.getCell(2).value).toBe("Conceito & Ação S/A");
      expect(dataRow1.getCell(5).value).toBe("24:30");
      expect(dataRow1.getCell(5).numFmt).toBe("@");
      expect(dataRow1.getCell(6).value).toBe(3675);
      expect(dataRow1.getCell(6).numFmt).toBe(BRL_EXCEL_NUM_FMT);

      // Linha 7: Segundo registro (fórmulas neutralizadas como texto literal, sem cell.formula)
      const dataRow2 = sheet.getRow(7);
      expect(dataRow2.getCell(2).value).toBe("'=CMD|' /C calc'!A0");
      expect(dataRow2.getCell(2).formula).toBeUndefined();
      expect(dataRow2.getCell(3).value).toBe("' +SUM(A1:A10)");
      expect(dataRow2.getCell(4).value).toBe("'@IMPORTXML(A1,A2)");
      expect(dataRow2.getCell(5).value).toBe("100:00");
      expect(dataRow2.getCell(6).value).toBe(15000);

      // Linha 8: Totais
      const totalsRow = sheet.getRow(8);
      expect(totalsRow.getCell(1).value).toBe("Total (2 apontamento(s))");
      expect(totalsRow.getCell(5).value).toBe("124:30");
      expect(totalsRow.getCell(6).value).toBe(18675);
    });
  });

  describe("PDF Exporter (@react-pdf/renderer)", () => {
    it("gera PDF válido para tabela de múltiplas páginas, textos longos, acentuação pt-BR e totais exatos", async () => {
      const manyRows = Array.from({ length: 65 }, (_, index) => ({
        id: `entry-${index + 1}`,
        cells: {
          workDate: `2026-10-${String((index % 28) + 1).padStart(2, "0")}`,
          clientName: `Organização Conceito & Soluções #${index + 1}`,
          projectName: `Implementação de Arquitetura Crítica v${index + 1}`,
          description: `Descrição detalhada com acentuação (ç, ã, õ, é, í, ú) para validação de quebra automática de linha e paginação contínua no item #${index + 1}.`,
          durationMinutes: 90,
          amountCents: 22500,
        },
      }));

      const multiPageDataset = makeSampleDataset({
        rows: manyRows,
        totalsRow: {
          workDate: "Total (65 apontamento(s))",
          clientName: "",
          projectName: "",
          description: "",
          durationMinutes: 65 * 90,
          amountCents: 65 * 22500,
        },
        totalMinutes: 65 * 90,
        totalCents: 65 * 22500,
      });

      const pdfBuffer = await exportReportToPdf(multiPageDataset);
      const inspection = inspectGeneratedPdfBuffer(pdfBuffer);

      expect(inspection.isValidPdfHeader).toBe(true);
      expect(inspection.pageCount).toBeGreaterThan(1);
      expect(inspection.extractedText).toContain("Apontamentos Detalhados");
      expect(inspection.extractedText).toContain(
        "Organização Conceito & Soluções #1",
      );
      expect(inspection.extractedText).toContain(
        "Organização Conceito & Soluções #65",
      );
      expect(inspection.extractedText).toContain(
        "Descrição detalhada com acentuação (ç, ã, õ, é, í, ú)",
      );
      expect(inspection.extractedText).toContain("Total (65 apontamento(s))");
      expect(inspection.extractedText).toContain("97:30");
      expect(inspection.extractedText).toContain("R$ 14.625,00");
      expect(inspection.extractedText).toContain("Página 1 de ");
      expect(inspection.extractedText).toContain("Página 2 de ");
    });

    it("gera PDF válido no estado vazio (sem linhas de dados)", async () => {
      const emptyDataset = makeSampleDataset({
        rows: [],
        totalsRow: null,
        totalMinutes: 0,
        billableMinutes: 0,
        totalCents: 0,
        workedDaysCount: 0,
        matchedRecordIds: [],
      });

      const pdfBuffer = await exportReportToPdf(emptyDataset);
      const inspection = inspectGeneratedPdfBuffer(pdfBuffer);

      expect(inspection.isValidPdfHeader).toBe(true);
      expect(inspection.pageCount).toBe(1);
      expect(inspection.extractedText).toContain(
        "Nenhum registro encontrado para os filtros informados.",
      );
      expect(inspection.extractedText).toContain("Página 1 de 1");
    });
  });
});
