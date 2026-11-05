import ExcelJS from "exceljs";
import { formatMinutesAsDuration } from "@/lib/duration";
import { neutralizeFormulaInjection } from "../csv";
import type {
  ReportCellValue,
  ReportColumn,
  ReportDataset,
} from "../../types";

export const BRL_EXCEL_NUM_FMT = '"R$ "#,##0.00';

function applyCellValueAndFormat(
  cell: ExcelJS.Cell,
  rawValue: ReportCellValue,
  column: ReportColumn,
): void {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    cell.value = "";
    return;
  }

  if (column.kind === "money" && typeof rawValue === "number") {
    cell.value = rawValue / 100;
    cell.numFmt = BRL_EXCEL_NUM_FMT;
    cell.alignment = { horizontal: "right" };
    return;
  }

  if (column.kind === "duration" && typeof rawValue === "number") {
    cell.value = formatMinutesAsDuration(rawValue);
    cell.numFmt = "@";
    cell.alignment = { horizontal: "right" };
    return;
  }

  if (column.kind === "integer" && typeof rawValue === "number") {
    cell.value = rawValue;
    cell.numFmt = "#,##0";
    cell.alignment = { horizontal: "right" };
    return;
  }

  if (column.kind === "date") {
    cell.value = neutralizeFormulaInjection(String(rawValue));
    cell.numFmt = "@";
    cell.alignment = { horizontal: "left" };
    return;
  }

  cell.value = neutralizeFormulaInjection(String(rawValue));
  cell.numFmt = "@";
  cell.alignment = {
    horizontal: column.align ?? "left",
  };
}

/**
 * Exporta um `ReportDataset` para buffer XLSX utilizando `ExcelJS`.
 * Valores monetários são exportados como números formatados em BRL (`R$ #,##0.00`),
 * durações como texto `HH:mm` sem redução módulo 24, datas civis sem deslocamento
 * de fuso e textos neutralizados contra injeção de fórmulas.
 */
export async function exportReportToXlsx(
  dataset: ReportDataset,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HoraFlow";
  workbook.created = new Date(dataset.generatedAtIso);

  const sheet = workbook.addWorksheet("Relatório", {
    views: [{ state: "frozen", ySplit: 5 }],
  });

  // Linha 1: Título
  const titleRow = sheet.addRow([
    neutralizeFormulaInjection(dataset.title),
  ]);
  titleRow.font = { bold: true, size: 14 };

  // Linha 2: Data de geração
  const genRow = sheet.addRow([
    `Gerado em: ${neutralizeFormulaInjection(dataset.generatedAtLabel)}`,
  ]);
  genRow.font = { italic: true, size: 10 };

  // Linha 3: Filtros aplicados
  const filterRow = sheet.addRow([
    `Filtros: ${neutralizeFormulaInjection(dataset.appliedFilterSummary.join(" | "))}`,
  ]);
  filterRow.font = { size: 10 };

  // Linha 4: Em branco
  sheet.addRow([]);

  // Linha 5: Cabeçalhos da tabela
  const headerRow = sheet.addRow(
    dataset.columns.map((col) => neutralizeFormulaInjection(col.label)),
  );
  headerRow.font = { bold: true };
  headerRow.eachCell((cell, colNumber) => {
    const colDef = dataset.columns[colNumber - 1];
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
    cell.alignment = {
      horizontal: colDef?.align ?? "left",
      vertical: "middle",
    };
  });

  // Linhas de dados (a partir da linha 6)
  for (const row of dataset.rows) {
    const excelRow = sheet.addRow(dataset.columns.map(() => ""));
    dataset.columns.forEach((col, index) => {
      const cell = excelRow.getCell(index + 1);
      applyCellValueAndFormat(cell, row.cells[col.key] ?? null, col);
    });
  }

  // Linha de totais
  if (dataset.totalsRow) {
    const totalsExcelRow = sheet.addRow(dataset.columns.map(() => ""));
    totalsExcelRow.font = { bold: true };
    dataset.columns.forEach((col, index) => {
      const cell = totalsExcelRow.getCell(index + 1);
      applyCellValueAndFormat(
        cell,
        dataset.totalsRow?.[col.key] ?? null,
        col,
      );
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FF94A3B8" } },
        bottom: { style: "double", color: { argb: "FF94A3B8" } },
      };
    });
  }

  // Ajuste de largura das colunas
  dataset.columns.forEach((col, index) => {
    const columnObj = sheet.getColumn(index + 1);
    const maxLen = Math.max(
      col.label.length + 4,
      col.kind === "money" ? 16 : col.kind === "duration" ? 14 : 20,
    );
    columnObj.width = Math.min(44, maxLen);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
