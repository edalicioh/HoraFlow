import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import {
  detectCsvDelimiter,
  parseCsvContent,
} from "@/modules/import/parsers/csv";
import { parseXlsxContent } from "@/modules/import/parsers/xlsx";
import {
  computeRowFingerprint,
  excelSerialDateToCivilDate,
  normalizeImportBillable,
  normalizeImportDate,
  normalizeImportDuration,
} from "@/modules/import/service";
import { MAX_IMPORT_ROWS } from "@/modules/import/types";

describe("Módulo de Importação — Analisadores e Normalizadores (Fase 5)", () => {
  describe("CSV Parser e Delimitadores", () => {
    it("detecta delimitadores comuns (; e , e tabulação)", () => {
      expect(detectCsvDelimiter("Data;Duração;Descrição\n2026-10-01;01:00;Teste")).toBe(";");
      expect(detectCsvDelimiter("Data,Duração,Descrição\n2026-10-01,01:00,Teste")).toBe(",");
      expect(detectCsvDelimiter("Data\tDuração\tDescrição\n2026-10-01\t01:00\tTeste")).toBe("\t");
    });

    it("analisa CSV com UTF-8 BOM, quebras de linha dentro de aspas e aspas escapadas", () => {
      const csvString =
        '\uFEFFData;Duração;Descrição;Faturável\r\n' +
        '2026-10-01;02:30;"Reunião com cliente;\nPlanejamento de sprint";Sim\r\n' +
        '2026-10-02;05:00;"Entrega do módulo ""Core""; versão 1.0";Não\r\n';

      const buffer = Buffer.from(csvString, "utf-8");
      const result = parseCsvContent(buffer);

      expect(result.delimiter).toBe(";");
      expect(result.headers).toEqual(["Data", "Duração", "Descrição", "Faturável"]);
      expect(result.rows).toHaveLength(2);

      expect(result.rows[0]?.cells["Data"]).toBe("2026-10-01");
      expect(result.rows[0]?.cells["Duração"]).toBe("02:30");
      expect(result.rows[0]?.cells["Descrição"]).toBe(
        "Reunião com cliente;\nPlanejamento de sprint",
      );
      expect(result.rows[0]?.cells["Faturável"]).toBe("Sim");

      expect(result.rows[1]?.cells["Data"]).toBe("2026-10-02");
      expect(result.rows[1]?.cells["Duração"]).toBe("05:00");
      expect(result.rows[1]?.cells["Descrição"]).toBe(
        'Entrega do módulo "Core"; versão 1.0',
      );
      expect(result.rows[1]?.cells["Faturável"]).toBe("Não");
    });

    it("rejeita arquivo CSV vazio", () => {
      const emptyBuffer = Buffer.from("", "utf-8");
      expect(() => parseCsvContent(emptyBuffer)).toThrow(ValidationError);
    });

    it("rejeita arquivo PDF ou binário disfarçado de CSV", () => {
      const pdfDisguised = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj", "utf-8");
      expect(() => parseCsvContent(pdfDisguised)).toThrow(ValidationError);

      const binaryWithNull = Buffer.from("Data;Duração\0\x002026-10-01;01:00", "utf-8");
      expect(() => parseCsvContent(binaryWithNull)).toThrow(ValidationError);
    });

    it("rejeita arquivo com mais de MAX_IMPORT_ROWS (5.000 linhas)", () => {
      const lines = ["Data;Duração;Descrição"];
      for (let i = 0; i < MAX_IMPORT_ROWS + 10; i++) {
        lines.push(`2026-10-01;01:00;Linha ${i}`);
      }
      const buffer = Buffer.from(lines.join("\n"), "utf-8");
      expect(() => parseCsvContent(buffer)).toThrow(ValidationError);
    });
  });

  describe("XLSX Parser via ExcelJS", () => {
    it("analisa XLSX com abas múltiplas, fórmulas avaliadas e datas nativas", async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet1 = workbook.addWorksheet("Outubro 2026");
      sheet1.addRow(["Data", "Duração", "Descrição", "Fórmula"]);
      sheet1.addRow(["2026-10-05", "04:30", "Desenvolvimento backend", { formula: "2+2", result: 4 }]);
      sheet1.addRow(["2026-10-06", 0.25, "Suporte e arquitetura", "OK"]); // 0.25 dia = 6 horas

      const sheet2 = workbook.addWorksheet("Novembro 2026");
      sheet2.addRow(["Data", "Horas"]);
      sheet2.addRow(["2026-11-01", "02:00"]);

      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

      // Lê a aba ativa padrão (Outubro)
      const parsedSheet1 = await parseXlsxContent(buffer);
      expect(parsedSheet1.sheets).toEqual(["Outubro 2026", "Novembro 2026"]);
      expect(parsedSheet1.activeSheet).toBe("Outubro 2026");
      expect(parsedSheet1.headers).toEqual(["Data", "Duração", "Descrição", "Fórmula"]);
      expect(parsedSheet1.rows).toHaveLength(2);
      expect(parsedSheet1.rows[0]?.cells["Data"]).toBe("2026-10-05");
      expect(parsedSheet1.rows[0]?.cells["Duração"]).toBe("04:30");
      expect(parsedSheet1.rows[0]?.cells["Fórmula"]).toBe(4); // captura resultado avaliado, sem executar código

      // Lê a aba Novembro explicitamente
      const parsedSheet2 = await parseXlsxContent(buffer, "Novembro 2026");
      expect(parsedSheet2.activeSheet).toBe("Novembro 2026");
      expect(parsedSheet2.rows).toHaveLength(1);
      expect(parsedSheet2.rows[0]?.cells["Data"]).toBe("2026-11-01");
      expect(parsedSheet1.sheetsData["Novembro 2026"]?.rows).toHaveLength(1);
    });

    it("rejeita arquivo não-XLSX ou corrompido", async () => {
      const fakeXlsx = Buffer.from("%PDF-1.5 fake xlsx content", "utf-8");
      await expect(parseXlsxContent(fakeXlsx)).rejects.toThrow(ValidationError);
    });
  });

  describe("Normalização de Datas Civis", () => {
    it("converte número serial do Excel para data civil no fuso UTC", () => {
      // 46311 no Excel = 16/10/2026
      const civilDate = excelSerialDateToCivilDate(46311);
      expect(civilDate).toBe("2026-10-16");
    });

    it("normaliza formatos AAAA-MM-DD e DD/MM/AAAA", () => {
      expect(normalizeImportDate("2026-10-25").date).toBe("2026-10-25");
      expect(normalizeImportDate("25/10/2026").date).toBe("2026-10-25");
      expect(normalizeImportDate("29/02/2024").date).toBe("2024-02-29"); // bissexto
      expect(normalizeImportDate("29/02/2023").error).toBeDefined(); // não bissexto
      expect(normalizeImportDate("99/99/9999").error).toBeDefined();
    });
  });

  describe("Normalização de Durações", () => {
    it("normaliza formato HH:mm padrão e durações acima de 24h", () => {
      expect(normalizeImportDuration("05:30").minutes).toBe(330);
      expect(normalizeImportDuration("24:30").minutes).toBe(1470);
      expect(normalizeImportDuration("100:00").minutes).toBe(6000);
      expect(normalizeImportDuration("00:00").error).toBeDefined();
    });

    it("trata fração numérica de dia do Excel (ex: 0.25 = 6 horas)", () => {
      expect(normalizeImportDuration(0.25).minutes).toBe(360);
      // 0.22916666 = 5h30 = 330 min
      expect(normalizeImportDuration(330 / 1440).minutes).toBe(330);
    });

    it("trata horas decimais (ex: 5,5 -> 330m) quando opção decimal é informada", () => {
      expect(normalizeImportDuration("5,5", "decimal_hours").minutes).toBe(330);
      expect(normalizeImportDuration("2,25", "decimal_hours").minutes).toBe(135);
      // Se formato for auto, avisa sobre ambiguidade
      expect(normalizeImportDuration("5,5", "auto").error).toContain("Duração decimal");
    });
  });

  describe("Valores Faturáveis e Fingerprint de Duplicidade", () => {
    it("interpreta valores faturáveis textuais e booleanos", () => {
      expect(normalizeImportBillable("Sim")).toBe(true);
      expect(normalizeImportBillable("SIM")).toBe(true);
      expect(normalizeImportBillable("true")).toBe(true);
      expect(normalizeImportBillable("1")).toBe(true);
      expect(normalizeImportBillable("Não")).toBe(false);
      expect(normalizeImportBillable("nao")).toBe(false);
      expect(normalizeImportBillable("false")).toBe(false);
      expect(normalizeImportBillable("0")).toBe(false);
      expect(normalizeImportBillable(null)).toBe(true); // default faturável
    });

    it("gera o mesmo fingerprint para os mesmos campos e diferencia descrições distintas", () => {
      const fp1 = computeRowFingerprint({
        workDate: "2026-10-15",
        projectId: "proj-1",
        durationMinutes: 120,
        description: "Alinhamento técnico",
        billable: true,
      });

      const fp2 = computeRowFingerprint({
        workDate: "2026-10-15",
        projectId: "proj-1",
        durationMinutes: 120,
        description: "  ALINHAMENTO TÉCNICO  ",
        billable: true,
      });

      const fp3 = computeRowFingerprint({
        workDate: "2026-10-15",
        projectId: "proj-1",
        durationMinutes: 120,
        description: "Outra atividade",
        billable: true,
      });

      expect(fp1).toBe(fp2);
      expect(fp1).not.toBe(fp3);
    });
  });
});
