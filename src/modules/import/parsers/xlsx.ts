import ExcelJS from "exceljs";
import { ValidationError } from "@/lib/errors";
import {
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_ROWS,
  MAX_XLSX_UNCOMPRESSED_SIZE,
  type ParsedRawRow,
  type StoredBatchSheetsData,
} from "../types";

/**
 * Inspeciona o contêiner ZIP do XLSX antes de descompactar no ExcelJS:
 * - Confirma assinatura mágica PK\x03\x04
 * - Soma o tamanho descompactado declarado nas entradas para conter zip bombs (máx 25 MiB)
 * - Bloqueia planilhas com macros VBA embutidas (vbaProject.bin)
 */
function validateXlsxZipContainer(rawBuffer: Buffer): void {
  if (
    rawBuffer.length < 4 ||
    rawBuffer[0] !== 0x50 ||
    rawBuffer[1] !== 0x4b ||
    rawBuffer[2] !== 0x03 ||
    rawBuffer[3] !== 0x04
  ) {
    throw new ValidationError(
      "Não foi possível abrir o arquivo XLSX. O conteúdo não possui assinatura de pacote OpenXML válido.",
    );
  }

  let totalUncompressedBytes = 0;
  let entryCount = 0;
  let offset = 0;

  // Percorre Central Directory (0x02014b50) e Local File Headers (0x04034b50)
  while (offset + 30 <= rawBuffer.length) {
    const sig = rawBuffer.readUInt32LE(offset);
    if (sig === 0x04034b50) {
      entryCount += 1;
      if (entryCount > 1000) {
        throw new ValidationError(
          "O arquivo XLSX contém número excessivo de entradas internas (possível zip bomb).",
        );
      }

      const compressedSize = rawBuffer.readUInt32LE(offset + 18);
      const uncompressedSize = rawBuffer.readUInt32LE(offset + 22);
      const fileNameLength = rawBuffer.readUInt16LE(offset + 26);
      const extraFieldLength = rawBuffer.readUInt16LE(offset + 28);

      totalUncompressedBytes += uncompressedSize;
      if (totalUncompressedBytes > MAX_XLSX_UNCOMPRESSED_SIZE) {
        throw new ValidationError(
          `O tamanho descompactado do arquivo XLSX excede o limite de segurança de ${MAX_XLSX_UNCOMPRESSED_SIZE / (1024 * 1024)} MiB.`,
        );
      }

      const nameEnd = offset + 30 + fileNameLength;
      if (nameEnd <= rawBuffer.length) {
        const entryName = rawBuffer
          .subarray(offset + 30, nameEnd)
          .toString("utf-8")
          .toLowerCase();
        if (entryName.includes("vbaproject.bin")) {
          throw new ValidationError(
            "Planilhas contendo macros VBA (vbaProject.bin) não são permitidas por segurança.",
          );
        }
      }

      const nextOffset =
        offset + 30 + fileNameLength + extraFieldLength + compressedSize;
      if (nextOffset <= offset || compressedSize === 0) {
        offset += 1;
      } else {
        offset = nextOffset;
      }
    } else if (sig === 0x02014b50 && offset + 46 <= rawBuffer.length) {
      const uncompressedSize = rawBuffer.readUInt32LE(offset + 24);
      const fileNameLength = rawBuffer.readUInt16LE(offset + 28);
      const extraFieldLength = rawBuffer.readUInt16LE(offset + 30);
      const commentLength = rawBuffer.readUInt16LE(offset + 32);

      if (uncompressedSize > MAX_XLSX_UNCOMPRESSED_SIZE) {
        throw new ValidationError(
          `O tamanho descompactado do arquivo XLSX excede o limite de segurança de ${MAX_XLSX_UNCOMPRESSED_SIZE / (1024 * 1024)} MiB.`,
        );
      }

      const nameEnd = offset + 46 + fileNameLength;
      if (nameEnd <= rawBuffer.length) {
        const entryName = rawBuffer
          .subarray(offset + 46, nameEnd)
          .toString("utf-8")
          .toLowerCase();
        if (entryName.includes("vbaproject.bin")) {
          throw new ValidationError(
            "Planilhas contendo macros VBA (vbaProject.bin) não são permitidas por segurança.",
          );
        }
      }

      offset += 46 + fileNameLength + extraFieldLength + commentLength;
    } else {
      offset += 1;
    }
  }
}

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

function extractWorksheetData(worksheet: ExcelJS.Worksheet): {
  headers: string[];
  rows: ParsedRawRow[];
} | null {
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
    return null;
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

  return { headers, rows };
}

/**
 * Lê e analisa arquivos XLSX com segurança via ExcelJS:
 * - Valida assinatura ZIP, limite de tamanho descompactado (25 MiB) e ausência de macros VBA
 * - Identifica abas (worksheets), armazena dados de todas as abas legíveis e permite selecionar a aba ativa
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
  sheetsData: StoredBatchSheetsData;
}> {
  if (rawBuffer.length > MAX_IMPORT_FILE_SIZE) {
    throw new ValidationError(
      `O arquivo excede o limite máximo permitido de ${MAX_IMPORT_FILE_SIZE / (1024 * 1024)} MiB.`,
    );
  }

  validateXlsxZipContainer(rawBuffer);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(rawBuffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ValidationError(
      "Não foi possível abrir o arquivo XLSX. O arquivo pode estar corrompido ou em formato inválido.",
    );
  }

  if (workbook.worksheets.length === 0) {
    throw new ValidationError(
      "O arquivo XLSX não contém nenhuma planilha (aba) válida.",
    );
  }

  const sheetsData: StoredBatchSheetsData = {};
  const sheets: string[] = [];

  for (const ws of workbook.worksheets) {
    const extracted = extractWorksheetData(ws);
    if (extracted) {
      sheets.push(ws.name);
      sheetsData[ws.name] = extracted;
    }
  }

  if (sheets.length === 0) {
    throw new ValidationError(
      "O arquivo XLSX está vazio ou não contém dados legíveis em nenhuma aba.",
    );
  }

  if (targetSheetName && !sheets.includes(targetSheetName)) {
    throw new ValidationError(
      `A aba "${targetSheetName}" não foi encontrada ou está vazia no arquivo.`,
    );
  }

  const activeSheetName =
    targetSheetName && sheets.includes(targetSheetName)
      ? targetSheetName
      : sheets[0]!;

  const activeData = sheetsData[activeSheetName]!;

  return {
    sheets,
    activeSheet: activeSheetName,
    headers: activeData.headers,
    rows: activeData.rows,
    sheetsData,
  };
}
