import { formatMinutesAsDuration } from "@/lib/duration";
import { formatCentsAsBRL } from "@/lib/money";
import type {
  ReportCellValue,
  ReportColumn,
  ReportDataset,
} from "../../types";

export const UTF8_BOM = "\uFEFF";

/**
 * Neutraliza tentativas de injeção de fórmulas em planilhas (CSV / Excel)
 * prefixando campos textuais iniciados por `=`, `+`, `-`, `@` ou caracteres
 * de controle/tabulação (inclusive precedidos por espaços) com apóstrofo `'`.
 */
export function neutralizeFormulaInjection(value: string): string {
  if (value.length === 0) {
    return "";
  }

  if (
    /^[\s\u0000-\u001F]*[=+\-@]/.test(value) ||
    /^[\t\r\n]/.test(value)
  ) {
    return `'${value}`;
  }

  return value;
}

export function escapeCsvField(rawValue: string): string {
  const needsQuotes =
    rawValue.includes(";") ||
    rawValue.includes('"') ||
    rawValue.includes("\n") ||
    rawValue.includes("\r");

  if (!needsQuotes) {
    return rawValue;
  }

  const escaped = rawValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function formatReportCellForDisplay(
  value: ReportCellValue,
  column: ReportColumn,
): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (column.kind === "duration" && typeof value === "number") {
    return formatMinutesAsDuration(value);
  }

  if (column.kind === "money" && typeof value === "number") {
    return formatCentsAsBRL(value);
  }

  if (column.kind === "integer" && typeof value === "number") {
    return String(value);
  }

  return String(value);
}

export function formatReportCellForCsv(
  value: ReportCellValue,
  column: ReportColumn,
): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (column.kind === "duration" && typeof value === "number") {
    return escapeCsvField(formatMinutesAsDuration(value));
  }

  if (column.kind === "money" && typeof value === "number") {
    return escapeCsvField(formatCentsAsBRL(value));
  }

  if (column.kind === "integer" && typeof value === "number") {
    return escapeCsvField(String(value));
  }

  const safeText = neutralizeFormulaInjection(String(value));
  return escapeCsvField(safeText);
}

/**
 * Exporta um `ReportDataset` para CSV UTF-8 com BOM (`\uFEFF`) e separador `;`.
 */
export function exportReportToCsv(dataset: ReportDataset): string {
  const lines: string[] = [];

  // Metadados do cabeçalho do relatório
  lines.push(
    [
      escapeCsvField(neutralizeFormulaInjection(dataset.title)),
      escapeCsvField(neutralizeFormulaInjection(dataset.generatedAtLabel)),
    ].join(";"),
  );
  lines.push(
    [
      escapeCsvField("Filtros aplicados"),
      escapeCsvField(
        neutralizeFormulaInjection(dataset.appliedFilterSummary.join(" | ")),
      ),
    ].join(";"),
  );
  lines.push("");

  // Cabeçalho das colunas
  lines.push(
    dataset.columns
      .map((col) => escapeCsvField(neutralizeFormulaInjection(col.label)))
      .join(";"),
  );

  // Linhas de dados
  for (const row of dataset.rows) {
    const rowCells = dataset.columns.map((col) =>
      formatReportCellForCsv(row.cells[col.key] ?? null, col),
    );
    lines.push(rowCells.join(";"));
  }

  // Linha de totais
  if (dataset.totalsRow) {
    const totalCells = dataset.columns.map((col) =>
      formatReportCellForCsv(dataset.totalsRow?.[col.key] ?? null, col),
    );
    lines.push(totalCells.join(";"));
  }

  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}
