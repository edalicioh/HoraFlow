import ExcelJS from "exceljs";
import { ValidationError } from "@/lib/errors";
import {
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_ROWS,
  type ParsedRawRow,
} from "../types";

function extractCellValue(cell: ExcelJS.Cell): string | number | null {
  const value = cell.value;
  if (value === null || value === undefined || value === "") {
    return null;
  }

  // Célula com fórmula: extrai apenas o resultado avaliado (cell.result)
  if (typeof value === "object" && "formula" in value) {
    const result = (value as { result?: unknown }).result;
    if (result === null || result === undefined || result === "") {
      return null;
    }
    if (result instanceof Date) {
      return result.toISOString().slice(0, 10);
    }
    if (typeof result === "number" || typeof result === "string") {
      return result;
    }
    return String(result);
  }

  // Célula Date nativa do ExcelJS
  if (value instanceof Date) {
    // Se a célula foi formatada como data pura no Excel, o Date vem em UTC
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  // Rich text
  if (typeof value === "object" && "richText" in value) {
    const rich = (value as { richText?: Array<{ text: string }> }).richText;
    const text = (rich ?? []).map((r) => r.text).join("").trim();
    return text.length > 0 ? text : null;
  }

  return String(value).trim();
}

/**
 * Lê e analisa arquivos XLSX com segurança via ExcelJS:
 * - Identifica abas (worksheets) e permite selecionar a aba ativa
 * - Extrai cabeçalhos da primeira linha preenchida
 * - Ignora fórmulas executáveis (captura apenas valores avaliados)
 * - Valida limite de tamanho (5 MiB) e limite de linhas (5.000)
 */
export async function parseXlsxContent(
  rawBuffer: Buffer,
  targetSheetName?: string | null,
): Promise<{
  sheets: string[];
  activeSheet: string;
  headers: string[];
  rows: ParsedRawRow[];
}> {
  if (rawBuffer.length > MAX_IMPORT_FILE_SIZE) {
    throw new ValidationError(
      `O arquivo excede o limite máximo permitido de ${MAX_IMPORT_FILE_SIZE / (1024 * 1024)} MiB.`,
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(rawBuffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ValidationError(
      "Não foi possível abrir o arquivo XLSX. O arquivo pode estar corrompido ou em formato inválido.",
    );
  }

  const sheets = workbook.worksheets.map((ws) => ws.name);
  if (sheets.length === 0) {
    throw new ValidationError(
      "O arquivo XLSX não contém nenhuma planilha (aba) válida.",
    );
  }

  const activeSheetName =
    targetSheetName && sheets.includes(targetSheetName)
      ? targetSheetName
      : sheets[0]!;

  const worksheet = workbook.getWorksheet(activeSheetName);
  if (!worksheet) {
    throw new ValidationError(
      `A aba "${activeSheetName}" não foi encontrada no arquivo.`,
    );
  }

  let headerRowIndex = 0;
  let headers: string[] = [];

  // Localiza a primeira linha não vazia para os cabeçalhos
  worksheet.eachRow((row, rowNumber) => {
    if (headerRowIndex === 0) {
      const rowValues = (row.values as unknown[]) ?? [];
      const hasContent = rowValues.some(
        (v) => v !== null && v !== undefined && String(v).trim() !== "",
      );
      if (hasContent) {
        headerRowIndex = rowNumber;
        headers = rowValues
          .slice(1) // ExcelJS é 1-indexed
          .map((v, idx) => {
            const str = v ? String(v).trim() : "";
            return str.length > 0 ? str : `Coluna ${idx + 1}`;
          });
      }
    }
  });

  if (headerRowIndex === 0 || headers.length === 0) {
    throw new ValidationError(
      `A aba "${activeSheetName}" está vazia ou não contém dados legíveis.`,
    );
  }

  const rows: ParsedRawRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIndex) {
      return;
    }

    if (rows.length >= MAX_IMPORT_ROWS) {
      throw new ValidationError(
        `O arquivo contém mais de ${MAX_IMPORT_ROWS} linhas, excedendo o limite seguro por importação.`,
      );
    }

    const cells: Record<string, string | number | null> = {};
    let rowHasData = false;

    headers.forEach((header, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      const val = extractCellValue(cell);
      cells[header] = val;
      if (val !== null) {
        rowHasData = true;
      }
    });

    if (rowHasData) {
      rows.push({
        rowNumber,
        cells,
      });
    }
  });

  return {
    sheets,
    activeSheet: activeSheetName,
    headers,
    rows,
  };
}
