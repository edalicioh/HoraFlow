import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultDb } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { calculateTimeEntryAmountCents } from "@/lib/money";
import { resolveHourlyRateWithSource } from "@/lib/rates";
import { withSqliteWriteTransaction } from "@/lib/sqlite-transaction";
import { recordAuditLog } from "@/modules/audit/service";
import { civilDateSchema } from "@/modules/time-entry/schema";
import { parseCsvContent } from "./parsers/csv";
import { parseXlsxContent } from "./parsers/xlsx";
import { parseColumnMapping, parseConfirmationOptions } from "./schema";
import type {
  ColumnMapping,
  DateFormatOption,
  DurationFormatOption,
  ImportConfirmationOptions,
  ImportConfirmationResult,
  ImportFileFormat,
  ImportPreviewResult,
  ParsedRawRow,
  StoredBatchPayload,
  ValidatedImportRow,
} from "./types";

// ==========================================
// 1. Normalização de Datas
// ==========================================

export function excelSerialDateToCivilDate(serial: number): string | null {
  if (serial < 1 || serial > 2958465) {
    return null;
  }

  // No sistema 1900 do Excel, a data base correspondente ao Unix Epoch (1970-01-01) é 25569.
  // Para datas a partir de 1900-03-01 (serial >= 61), o bug de 1900 já está compensado por 25569.
  const adjusted = serial > 60 ? serial : serial + 1;
  const utcMs = Math.round((adjusted - 25569) * 86400 * 1000);
  const target = new Date(utcMs);

  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2, "0");
  const day = String(target.getUTCDate()).padStart(2, "0");
  const candidate = `${year}-${month}-${day}`;

  const parsed = civilDateSchema.safeParse(candidate);
  return parsed.success ? candidate : null;
}

export function normalizeImportDate(
  val: string | number | null | undefined,
  format: DateFormatOption = "auto",
): { date: string | null; error?: string } {
  if (val === null || val === undefined || String(val).trim() === "") {
    return { date: null, error: "Data ausente ou em branco." };
  }

  // Se for número serial do Excel
  if (typeof val === "number") {
    const fromSerial = excelSerialDateToCivilDate(val);
    if (fromSerial) {
      return { date: fromSerial };
    }
    return { date: null, error: `Número de data serial inválido (${val}).` };
  }

  const str = String(val).trim();

  // Se a string já é YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const parsed = civilDateSchema.safeParse(str);
    if (parsed.success) {
      return { date: str };
    }
    return { date: null, error: `Data civil inválida (${str}).` };
  }

  // Se a string é DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dayStr, monthStr, yearStr] = str.split("/");
    const candidate = `${yearStr}-${monthStr}-${dayStr}`;
    const parsed = civilDateSchema.safeParse(candidate);
    if (parsed.success) {
      return { date: candidate };
    }
    return { date: null, error: `Data civil inválida (${str}).` };
  }

  // Tratamento conforme formato explicitamente selecionado
  if (format === "YYYY-MM-DD") {
    return { date: null, error: `Data não corresponde a AAAA-MM-DD (${str}).` };
  }

  if (format === "DD/MM/YYYY") {
    return { date: null, error: `Data não corresponde a DD/MM/AAAA (${str}).` };
  }

  return {
    date: null,
    error: `Formato de data não reconhecido (${str}). Utilize DD/MM/AAAA ou AAAA-MM-DD.`,
  };
}

// ==========================================
// 2. Normalização de Durações
// ==========================================

export function normalizeImportDuration(
  val: string | number | null | undefined,
  format: DurationFormatOption = "auto",
): { minutes: number | null; error?: string } {
  if (val === null || val === undefined || String(val).trim() === "") {
    return { minutes: null, error: "Duração ausente ou em branco." };
  }

  // Se for número (Excel guarda fração de dia ou minutos inteiros)
  if (typeof val === "number") {
    if (val <= 0) {
      return { minutes: null, error: "Duração deve ser estritamente positiva." };
    }

    // Se é uma fração de dia típica do Excel (ex: 0.22916666 = 5h30 = 330 min)
    if (val < 1 && val > 0) {
      const minutes = Math.round(val * 24 * 60);
      if (minutes > 0) {
        return { minutes };
      }
    }

    // Se for minutos inteiros diretos (ex: 330)
    if (Number.isInteger(val) && val > 0 && val <= 100_000) {
      return { minutes: val };
    }

    // Se for horas decimais (ex: 5.5 horas)
    if (format === "decimal_hours") {
      const minutes = Math.round(val * 60);
      if (minutes > 0) {
        return { minutes };
      }
    }

    // Número fracionário ambíguo
    const fromFraction = Math.round(val * 24 * 60);
    return { minutes: fromFraction > 0 ? fromFraction : null };
  }

  const str = String(val).trim();

  // Formato textual HH:mm (inclusive >24h como 24:30 ou 100:00)
  const hhmmMatch = /^(\d+):([0-5]\d)$/.exec(str);
  if (hhmmMatch) {
    const hours = Number(hhmmMatch[1]);
    const mins = Number(hhmmMatch[2]);
    const totalMinutes = hours * 60 + mins;
    if (totalMinutes <= 0) {
      return {
        minutes: null,
        error: "Duração deve ser maior que 0 minutos.",
      };
    }
    return { minutes: totalMinutes };
  }

  // Formato decimal explícito ou detectado (ex: "5,5" ou "5.5")
  const decimalMatch = /^(\d+)[,.](\d+)$/.exec(str);
  if (decimalMatch) {
    if (format === "decimal_hours") {
      const decimalVal = Number(`${decimalMatch[1]}.${decimalMatch[2]}`);
      const totalMinutes = Math.round(decimalVal * 60);
      if (totalMinutes > 0) {
        return { minutes: totalMinutes };
      }
    }
    return {
      minutes: null,
      error: `Duração decimal "${str}" detectada. Selecione "Horas decimais" no formato de duração para converter (ex: 5,5 -> 05:30).`,
    };
  }

  // Número puro em string (ex: "330")
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    if (num > 0) {
      return { minutes: num };
    }
  }

  return {
    minutes: null,
    error: `Formato de duração inválido ("${str}"). Utilize HH:mm (ex: 05:30 ou 24:30).`,
  };
}

export function normalizeImportBillable(
  val: string | number | boolean | null | undefined,
): boolean {
  if (val === null || val === undefined || String(val).trim() === "") {
    return true; // Padrão: faturável
  }
  if (typeof val === "boolean") {
    return val;
  }
  const str = String(val).trim().toLowerCase();
  if (
    str === "sim" ||
    str === "s" ||
    str === "true" ||
    str === "1" ||
    str === "yes" ||
    str === "y"
  ) {
    return true;
  }
  if (
    str === "não" ||
    str === "nao" ||
    str === "n" ||
    str === "false" ||
    str === "0" ||
    str === "no"
  ) {
    return false;
  }
  return true;
}

export function computeRowFingerprint(input: {
  workDate: string;
  projectId: string;
  durationMinutes: number;
  description: string;
  billable: boolean;
}): string {
  const normDesc = input.description.trim().toLowerCase();
  const raw = `${input.workDate}|${input.projectId}|${input.durationMinutes}|${normDesc}|${input.billable}`;
  return createHash("sha256").update(raw).digest("hex");
}

// ==========================================
// 3. Upload e Inicialização de Lote
// ==========================================

export async function createImportBatchFromFile(
  input: {
    fileName: string;
    fileBuffer: Buffer;
    format?: ImportFileFormat;
  },
  database: PrismaClient = defaultDb,
): Promise<{
  batchId: string;
  format: ImportFileFormat;
  sheets: string[];
  activeSheet: string;
  detectedColumns: string[];
  previewRowsCount: number;
}> {
  const cleanFileName = input.fileName.trim();
  const lowerName = cleanFileName.toLowerCase();

  if (lowerName.endsWith(".xlsm")) {
    throw new ValidationError(
      "Planilhas com macros (.xlsm) não são permitidas por segurança. Exporte como .xlsx ou .csv.",
    );
  }

  const isXlsx = input.format === "xlsx" || lowerName.endsWith(".xlsx");
  const isCsv =
    input.format === "csv" ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".txt");

  if (!isXlsx && !isCsv) {
    throw new ValidationError(
      "Formato de arquivo não suportado. Por favor, envie um arquivo CSV ou XLSX.",
    );
  }

  const format: ImportFileFormat = isXlsx ? "xlsx" : "csv";
  const fileHash = createHash("sha256").update(input.fileBuffer).digest("hex");

  let sheets: string[] = ["Principal"];
  let activeSheet = "Principal";
  let detectedColumns: string[] = [];
  let rawRows: ParsedRawRow[] = [];
  let sheetsData: StoredBatchPayload["sheetsData"];

  if (format === "csv") {
    const parsed = parseCsvContent(input.fileBuffer);
    detectedColumns = parsed.headers;
    rawRows = parsed.rows;
  } else {
    const parsed = await parseXlsxContent(input.fileBuffer);
    sheets = parsed.sheets;
    activeSheet = parsed.activeSheet;
    detectedColumns = parsed.headers;
    rawRows = parsed.rows;
    sheetsData = parsed.sheetsData;
  }

  const payload: StoredBatchPayload = {
    fileName: cleanFileName,
    fileHash,
    format,
    sheets,
    activeSheet,
    detectedColumns,
    rawRows,
    sheetsData,
  };

  const created = await database.importBatch.create({
    data: {
      status: "PENDING",
      fileName: cleanFileName,
      fileHash,
      mapping: payload as unknown as object,
      totalRows: rawRows.length,
      validRows: 0,
      invalidRows: 0,
      importedRows: 0,
      totalMinutes: 0,
      totalCents: 0,
    },
  });

  return {
    batchId: created.id,
    format,
    sheets,
    activeSheet,
    detectedColumns,
    previewRowsCount: rawRows.length,
  };
}

// ==========================================
// 4. Mapeamento e Geração da Prévia
// ==========================================

export async function previewImportBatch(
  input: {
    batchId: string;
    mapping: ColumnMapping;
  },
  database: PrismaClient = defaultDb,
): Promise<ImportPreviewResult> {
  const mapping = parseColumnMapping(input.mapping);

  const batch = await database.importBatch.findUnique({
    where: { id: input.batchId },
  });

  if (!batch) {
    throw new NotFoundError("Lote de importação não encontrado.");
  }

  if (batch.status === "IMPORTED") {
    throw new ConflictError(
      "Este lote já foi confirmado e importado com sucesso. Não é possível alterar a prévia.",
    );
  }

  const payload = batch.mapping as unknown as StoredBatchPayload;
  if (!payload || !Array.isArray(payload.rawRows)) {
    throw new ValidationError(
      "Dados originais do lote corrompidos ou indisponíveis.",
    );
  }

  // Se o arquivo for XLSX multi-abas e o usuário selecionou outra aba:
  if (mapping.sheetName && payload.sheetsData) {
    const targetSheetData = payload.sheetsData[mapping.sheetName];
    if (!targetSheetData) {
      throw new ValidationError(
        `A aba "${mapping.sheetName}" não foi encontrada na planilha.`,
      );
    }

    const sheetChanged = payload.activeSheet !== mapping.sheetName;
    payload.activeSheet = mapping.sheetName;
    payload.detectedColumns = targetSheetData.headers;
    payload.rawRows = targetSheetData.rows;

    if (sheetChanged) {
      if (!payload.detectedColumns.includes(mapping.dateColumn)) {
        mapping.dateColumn =
          payload.detectedColumns.find((c) => /data|date|dia/i.test(c)) ??
          payload.detectedColumns[0] ??
          mapping.dateColumn;
      }
      if (!payload.detectedColumns.includes(mapping.durationColumn)) {
        mapping.durationColumn =
          payload.detectedColumns.find((c) =>
            /dura[çc]|horas|tempo|duration|hours/i.test(c),
          ) ??
          payload.detectedColumns[1] ??
          mapping.durationColumn;
      }
      if (
        mapping.descriptionColumn &&
        !payload.detectedColumns.includes(mapping.descriptionColumn)
      ) {
        mapping.descriptionColumn =
          payload.detectedColumns.find((c) =>
            /descri|tarefa|atividade|memo|note/i.test(c),
          ) ?? null;
      }
      if (
        mapping.billableColumn &&
        !payload.detectedColumns.includes(mapping.billableColumn)
      ) {
        mapping.billableColumn =
          payload.detectedColumns.find((c) => /fatur|billable/i.test(c)) ??
          null;
      }
    }
  }

  if (!payload.detectedColumns.includes(mapping.dateColumn)) {
    throw new ValidationError(
      `A coluna de data "${mapping.dateColumn}" não existe na aba "${payload.activeSheet}".`,
      { dateColumn: ["Selecione uma coluna de data existente na aba."] },
    );
  }

  if (!payload.detectedColumns.includes(mapping.durationColumn)) {
    throw new ValidationError(
      `A coluna de duração "${mapping.durationColumn}" não existe na aba "${payload.activeSheet}".`,
      { durationColumn: ["Selecione uma coluna de duração existente na aba."] },
    );
  }

  // Valida cliente e projeto
  const project = await database.project.findUnique({
    where: { id: mapping.defaultProjectId },
    include: {
      client: true,
    },
  });

  if (!project) {
    throw new NotFoundError("Projeto selecionado não encontrado.");
  }

  if (project.clientId !== mapping.defaultClientId) {
    throw new ValidationError(
      "O projeto selecionado não pertence ao cliente informado.",
    );
  }

  if (!project.active || !project.client.active) {
    throw new ValidationError(
      "O cliente e o projeto selecionados devem estar ativos para importar apontamentos.",
    );
  }

  // Busca competências fechadas (BillingPeriod.status = CLOSED) deste cliente
  const closedPeriods = await database.billingPeriod.findMany({
    where: {
      clientId: project.client.id,
      status: "CLOSED",
    },
    select: {
      year: true,
      month: true,
    },
  });
  const closedCompetencies = new Set(
    closedPeriods.map(
      (bp) => `${bp.year}-${String(bp.month).padStart(2, "0")}`,
    ),
  );

  const settings = await database.settings.findFirst();
  const defaultRateCents = settings?.defaultHourlyRateCents ?? 0;
  const resolvedRate = resolveHourlyRateWithSource({
    projectRateCents: project.hourlyRateCents,
    clientRateCents: project.client.hourlyRateCents,
    defaultRateCents,
  });
  const hourlyRateCents = resolvedRate.rateCents;

  // Busca apontamentos existentes no banco para detecção de duplicidades
  const existingEntries = await database.timeEntry.findMany({
    where: {
      projectId: project.id,
      deletedAt: null,
    },
    select: {
      id: true,
      workDate: true,
      durationMinutes: true,
      description: true,
      billable: true,
    },
  });

  const existingFingerprints = new Set(
    existingEntries.map((e) =>
      computeRowFingerprint({
        workDate: e.workDate,
        projectId: project.id,
        durationMinutes: e.durationMinutes,
        description: e.description ?? "",
        billable: e.billable,
      }),
    ),
  );

  const batchFingerprintsSeen = new Map<string, number>();

  let totalMinutesBig = 0n;
  let totalCentsBig = 0n;
  let validRowsCount = 0;
  let invalidRowsCount = 0;
  let duplicateRowsCount = 0;

  const validatedRows: ValidatedImportRow[] = payload.rawRows.map((rawRow) => {
    const rawDate = rawRow.cells[mapping.dateColumn];
    const rawDuration = rawRow.cells[mapping.durationColumn];
    const rawDesc = mapping.descriptionColumn
      ? rawRow.cells[mapping.descriptionColumn]
      : null;
    const rawBillable = mapping.billableColumn
      ? rawRow.cells[mapping.billableColumn]
      : null;

    const validationErrors: string[] = [];

    const dateResult = normalizeImportDate(rawDate, mapping.dateFormat);
    if (dateResult.error) {
      validationErrors.push(dateResult.error);
    }

    const durationResult = normalizeImportDuration(
      rawDuration,
      mapping.durationFormat,
    );
    if (durationResult.error) {
      validationErrors.push(durationResult.error);
    }

    const workDate = dateResult.date;
    if (workDate) {
      const yearMonth = workDate.slice(0, 7);
      if (closedCompetencies.has(yearMonth)) {
        const [yearStr, monthStr] = yearMonth.split("-");
        validationErrors.push(
          `A competência ${monthStr}/${yearStr} deste cliente está fechada. Reabra o fechamento mensal antes de importar lançamentos nesta competência.`,
        );
      }
    }

    const durationMinutes = durationResult.minutes;
    const description =
      rawDesc !== null && rawDesc !== undefined
        ? String(rawDesc).trim().slice(0, 500)
        : null;
    const billable = normalizeImportBillable(rawBillable);

    let amountCents = 0;
    if (durationMinutes && durationMinutes > 0) {
      amountCents = calculateTimeEntryAmountCents({
        durationMinutes,
        hourlyRateCents,
        billable,
      });
    }

    const isValid = validationErrors.length === 0;

    let isDuplicate = false;
    let duplicateReason: string | undefined;
    let fingerprint = "";

    if (isValid && workDate && durationMinutes) {
      fingerprint = computeRowFingerprint({
        workDate,
        projectId: project.id,
        durationMinutes,
        description: description ?? "",
        billable,
      });

      if (batchFingerprintsSeen.has(fingerprint)) {
        isDuplicate = true;
        const firstRow = batchFingerprintsSeen.get(fingerprint);
        duplicateReason = `Possível duplicata da linha ${firstRow} neste mesmo arquivo.`;
        duplicateRowsCount += 1;
      } else if (existingFingerprints.has(fingerprint)) {
        isDuplicate = true;
        duplicateReason =
          "Já existe um apontamento com a mesma data, projeto, duração e descrição registrado no sistema.";
        duplicateRowsCount += 1;
      } else {
        batchFingerprintsSeen.set(fingerprint, rawRow.rowNumber);
      }

      validRowsCount += 1;
      totalMinutesBig += BigInt(durationMinutes);
      totalCentsBig += BigInt(amountCents);
    } else {
      invalidRowsCount += 1;
    }

    return {
      rowNumber: rawRow.rowNumber,
      workDate,
      durationMinutes,
      description,
      billable,
      clientId: project.client.id,
      projectId: project.id,
      clientName: project.client.name,
      projectName: project.name,
      hourlyRateCents,
      amountCents,
      isValid,
      validationErrors,
      isDuplicate,
      duplicateReason,
      fingerprint,
    };
  });

  const totalMinutes = Number(totalMinutesBig);
  const totalCents = Number(totalCentsBig);
  const canConfirm = validRowsCount > 0;

  // Atualiza lote no banco para PREVIEWED
  payload.mapping = mapping;
  payload.validatedRows = validatedRows;

  await database.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "PREVIEWED",
      mapping: payload as unknown as object,
      totalRows: payload.rawRows.length,
      validRows: validRowsCount,
      invalidRows: invalidRowsCount,
      totalMinutes,
      totalCents,
    },
  });

  return {
    batchId: batch.id,
    fileName: payload.fileName,
    fileHash: payload.fileHash,
    format: payload.format,
    sheets: payload.sheets,
    activeSheet: payload.activeSheet,
    detectedColumns: payload.detectedColumns,
    mapping,
    totalRows: payload.rawRows.length,
    validRows: validRowsCount,
    invalidRows: invalidRowsCount,
    duplicateRows: duplicateRowsCount,
    totalMinutes,
    totalCents,
    rows: validatedRows,
    canConfirm,
  };
}

// ==========================================
// 5. Confirmação Transacional e Idempotência
// ==========================================

export async function confirmImportBatch(
  input: {
    batchId: string;
    options?: ImportConfirmationOptions;
  },
  database: PrismaClient = defaultDb,
): Promise<ImportConfirmationResult> {
  const options = parseConfirmationOptions(input.options);

  return withSqliteWriteTransaction(database, async (tx) => {
    const batch = await tx.importBatch.findUnique({
      where: { id: input.batchId },
    });

    if (!batch) {
      throw new NotFoundError("Lote de importação não encontrado.");
    }

    // Idempotência: se já importado, retorna o resultado prévio
    if (batch.status === "IMPORTED") {
      const existingEntries = await tx.timeEntry.findMany({
        where: { importBatchId: batch.id },
        select: { id: true },
      });
      return {
        batchId: batch.id,
        status: "IMPORTED",
        importedCount: batch.importedRows,
        skippedInvalidCount: batch.invalidRows,
        skippedDuplicateCount: 0,
        totalMinutes: batch.totalMinutes,
        totalCents: batch.totalCents,
        insertedEntryIds: existingEntries.map((e) => e.id),
      };
    }

    if (batch.status !== "PREVIEWED") {
      throw new ConflictError(
        "O lote não está em estado pré-visualizado para confirmação. Gere a prévia novamente.",
      );
    }

    const payload = batch.mapping as unknown as StoredBatchPayload;
    const validatedRows = payload?.validatedRows;

    if (!Array.isArray(validatedRows) || validatedRows.length === 0) {
      throw new ValidationError("Nenhuma linha validada disponível para importação.");
    }

    // Regra RF10: Se há linhas inválidas e skipInvalidRows não foi marcado, bloqueia
    const invalidRowsCount = validatedRows.filter((r) => !r.isValid).length;
    if (invalidRowsCount > 0 && !options.skipInvalidRows) {
      throw new ConflictError(
        `O arquivo contém ${invalidRowsCount} linha(s) inválida(s). Corrija as linhas no arquivo ou marque a opção "Ignorar linhas inválidas e importar apenas as válidas".`,
      );
    }

    // Filtra linhas a importar
    const rowsToImport = validatedRows.filter((row) => {
      if (!row.isValid) {
        return false;
      }
      if (row.isDuplicate && !options.importDuplicates) {
        return false;
      }
      return true;
    });

    if (rowsToImport.length === 0) {
      throw new ConflictError(
        "Nenhum apontamento selecionado para importação (todas as linhas são inválidas ou foram ignoradas como duplicatas).",
      );
    }

    // Revalida dentro da transação SQLite se o cliente e o projeto permanecem ativos
    const targetProjectId = rowsToImport[0]!.projectId;
    const project = await tx.project.findUnique({
      where: { id: targetProjectId },
      include: { client: true },
    });

    if (!project || !project.active || !project.client.active) {
      throw new ConflictError(
        "O cliente ou projeto de destino foi desativado antes da confirmação do lote.",
      );
    }

    // Revalida dentro da transação SQLite se alguma competência das linhas foi fechada concorrentemente
    const closedPeriods = await tx.billingPeriod.findMany({
      where: {
        clientId: project.client.id,
        status: "CLOSED",
      },
      select: {
        year: true,
        month: true,
      },
    });
    const closedCompetencies = new Set(
      closedPeriods.map(
        (bp) => `${bp.year}-${String(bp.month).padStart(2, "0")}`,
      ),
    );

    for (const row of rowsToImport) {
      const ym = row.workDate!.slice(0, 7);
      if (closedCompetencies.has(ym)) {
        const [yearStr, monthStr] = ym.split("-");
        throw new ConflictError(
          `A competência ${monthStr}/${yearStr} do cliente "${project.client.name}" está fechada. Reabra o fechamento mensal antes de confirmar a importação.`,
        );
      }
    }

    // Insere apontamentos vinculados ao lote
    const insertedIds: string[] = [];
    let importedMinutesBig = 0n;
    let importedCentsBig = 0n;

    for (const row of rowsToImport) {
      const created = await tx.timeEntry.create({
        data: {
          projectId: row.projectId,
          workDate: row.workDate!,
          mode: "DURATION",
          durationMinutes: row.durationMinutes!,
          description: row.description,
          hourlyRateCents: row.hourlyRateCents,
          amountCents: row.amountCents,
          billable: row.billable,
          status: "DRAFT",
          importBatchId: batch.id,
        },
        select: { id: true },
      });
      insertedIds.push(created.id);
      importedMinutesBig += BigInt(row.durationMinutes!);
      importedCentsBig += BigInt(row.amountCents);
    }

    const importedMinutes = Number(importedMinutesBig);
    const importedCents = Number(importedCentsBig);

    // Atualiza lote para IMPORTED
    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "IMPORTED",
        importedRows: rowsToImport.length,
        totalMinutes: importedMinutes,
        totalCents: importedCents,
      },
    });

    // Registra auditoria
    await recordAuditLog(
      tx,
      {
        entity: "ImportBatch",
        entityId: batch.id,
        action: "IMPORT",
        before: { status: "PREVIEWED" },
        after: {
          status: "IMPORTED",
          importedRows: rowsToImport.length,
          totalMinutes: importedMinutes,
          totalCents: importedCents,
        },
        origin: "local",
      },
    );

    const skippedDuplicateCount = validatedRows.filter(
      (r) => r.isValid && r.isDuplicate && !options.importDuplicates,
    ).length;

    return {
      batchId: batch.id,
      status: "IMPORTED",
      importedCount: rowsToImport.length,
      skippedInvalidCount: invalidRowsCount,
      skippedDuplicateCount,
      totalMinutes: importedMinutes,
      totalCents: importedCents,
      insertedEntryIds: insertedIds,
    };
  });
}

export async function getImportBatchDetail(
  batchId: string,
  database: PrismaClient = defaultDb,
): Promise<ImportPreviewResult | null> {
  const batch = await database.importBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) return null;

  const payload = batch.mapping as unknown as StoredBatchPayload;
  if (!payload) return null;

  const duplicateRows = (payload.validatedRows ?? []).filter(
    (r) => r.isDuplicate,
  ).length;

  return {
    batchId: batch.id,
    fileName: payload.fileName ?? batch.fileName ?? "arquivo",
    fileHash: payload.fileHash ?? batch.fileHash ?? "",
    format: payload.format ?? "csv",
    sheets: payload.sheets ?? ["Principal"],
    activeSheet: payload.activeSheet ?? "Principal",
    detectedColumns: payload.detectedColumns ?? [],
    mapping: payload.mapping ?? {
      dateColumn: "",
      durationColumn: "",
      dateFormat: "auto",
      durationFormat: "auto",
      defaultClientId: "",
      defaultProjectId: "",
    },
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    duplicateRows,
    totalMinutes: batch.totalMinutes,
    totalCents: batch.totalCents,
    rows: payload.validatedRows ?? [],
    canConfirm: batch.status === "PREVIEWED" && batch.validRows > 0,
  };
}
