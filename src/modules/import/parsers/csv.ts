import { ValidationError } from "@/lib/errors";
import {
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_ROWS,
  type ParsedRawRow,
} from "../types";

export function detectCsvDelimiter(sampleText: string): ";" | "," | "\t" {
  const lines = sampleText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (lines.length === 0) {
    return ";";
  }

  let countSemicolon = 0;
  let countComma = 0;
  let countTab = 0;

  for (const line of lines) {
    countSemicolon += (line.match(/;/g) || []).length;
    countComma += (line.match(/,/g) || []).length;
    countTab += (line.match(/\t/g) || []).length;
  }

  if (countSemicolon >= countComma && countSemicolon >= countTab) {
    return ";";
  }
  if (countTab > countComma) {
    return "\t";
  }
  return ",";
}

/**
 * Analisador CSV RFC 4180 robusto com suporte a:
 * - UTF-8 BOM (\uFEFF)
 * - Campos delimitados por aspas com delimitadores internos e quebras de linha (\r\n / \n)
 * - Aspas duplas escapadas ("")
 * - Delimitador configurável ou autodetectado (; ou , ou \t)
 * - Teto de segurança de MAX_IMPORT_ROWS (5.000 linhas)
 */
export function parseCsvContent(
  rawBuffer: Buffer,
  delimiter?: ";" | "," | "\t",
): { headers: string[]; rows: ParsedRawRow[]; delimiter: string } {
  if (rawBuffer.length > MAX_IMPORT_FILE_SIZE) {
    throw new ValidationError(
      `O arquivo excede o limite máximo permitido de ${MAX_IMPORT_FILE_SIZE / (1024 * 1024)} MiB.`,
    );
  }

  // Rejeita arquivos binários, PDFs ou ZIP/XLSX disfarçados de CSV
  if (
    rawBuffer.length >= 4 &&
    ((rawBuffer[0] === 0x25 &&
      rawBuffer[1] === 0x50 &&
      rawBuffer[2] === 0x44 &&
      rawBuffer[3] === 0x46) || // %PDF
      (rawBuffer[0] === 0x50 &&
        rawBuffer[1] === 0x4b &&
        rawBuffer[2] === 0x03 &&
        rawBuffer[3] === 0x04)) // PK.. (ZIP/XLSX)
  ) {
    throw new ValidationError(
      "O conteúdo do arquivo não corresponde a um CSV textual válido (arquivo binário ou PDF/ZIP detectado).",
    );
  }

  if (rawBuffer.includes(0x00)) {
    throw new ValidationError(
      "O arquivo contém bytes nulos (binário) ou codificação incompatível com UTF-8.",
    );
  }

  let text = rawBuffer.toString("utf-8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const effectiveDelimiter = delimiter ?? detectCsvDelimiter(text);

  const parsedGrid: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          // Aspas duplas escapadas ("")
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Fim do campo entre aspas
          inQuotes = false;
          i += 1;
          continue;
        }
      } else {
        currentField += char;
        i += 1;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i += 1;
        continue;
      } else if (char === effectiveDelimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
        i += 1;
        continue;
      } else if (char === "\r") {
        if (i + 1 < len && text[i + 1] === "\n") {
          i += 1;
        }
        currentRow.push(currentField.trim());
        currentField = "";
        if (currentRow.some((val) => val.length > 0)) {
          parsedGrid.push(currentRow);
        }
        currentRow = [];
        i += 1;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        currentField = "";
        if (currentRow.some((val) => val.length > 0)) {
          parsedGrid.push(currentRow);
        }
        currentRow = [];
        i += 1;
        continue;
      } else {
        currentField += char;
        i += 1;
        continue;
      }
    }
  }

  // Último campo/linha pendente
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((val) => val.length > 0)) {
      parsedGrid.push(currentRow);
    }
  }

  if (parsedGrid.length === 0) {
    throw new ValidationError(
      "O arquivo CSV está vazio ou não contém linhas de dados legíveis.",
    );
  }

  // Linha 1 = Cabeçalhos
  const rawHeaders = parsedGrid[0] ?? [];
  const headers = rawHeaders.map((h, idx) =>
    h.length > 0 ? h : `Coluna ${idx + 1}`,
  );

  const dataRows = parsedGrid.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new ValidationError(
      `O arquivo contém ${dataRows.length} linhas de dados, excedendo o limite seguro de ${MAX_IMPORT_ROWS} linhas por importação.`,
    );
  }

  const rows: ParsedRawRow[] = dataRows.map((rawRow, idx) => {
    const cells: Record<string, string | number | null> = {};
    headers.forEach((header, colIdx) => {
      const val = rawRow[colIdx] ?? null;
      cells[header] = val && val.length > 0 ? val : null;
    });
    return {
      rowNumber: idx + 2, // 1-indexed, linha 1 é cabeçalho
      cells,
    };
  });

  return {
    headers,
    rows,
    delimiter: effectiveDelimiter,
  };
}
