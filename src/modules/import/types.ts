export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024; // 5 MiB
export const MAX_IMPORT_ROWS = 5_000;
export const MAX_XLSX_UNCOMPRESSED_SIZE = 25 * 1024 * 1024; // 25 MiB

export type ImportFileFormat = "csv" | "xlsx";

export type ImportBatchStatus = "PENDING" | "PREVIEWED" | "IMPORTED" | "FAILED";

export type DateFormatOption = "auto" | "YYYY-MM-DD" | "DD/MM/YYYY";
export type DurationFormatOption = "auto" | "HH:mm" | "decimal_hours";

export type ColumnMapping = {
  dateColumn: string;
  durationColumn: string;
  descriptionColumn?: string | null;
  billableColumn?: string | null;
  dateFormat: DateFormatOption;
  durationFormat: DurationFormatOption;
  sheetName?: string | null;
  defaultClientId: string;
  defaultProjectId: string;
};

export type ParsedRawRow = {
  rowNumber: number;
  cells: Record<string, string | number | null>;
};

export type ValidatedImportRow = {
  rowNumber: number;
  workDate: string | null;
  durationMinutes: number | null;
  description: string | null;
  billable: boolean;
  clientId: string;
  projectId: string;
  clientName: string;
  projectName: string;
  hourlyRateCents: number;
  amountCents: number;
  isValid: boolean;
  validationErrors: string[];
  isDuplicate: boolean;
  duplicateReason?: string;
  fingerprint: string;
};

export type ImportPreviewResult = {
  batchId: string;
  fileName: string;
  fileHash: string;
  format: ImportFileFormat;
  sheets: string[];
  activeSheet: string;
  detectedColumns: string[];
  mapping: ColumnMapping;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  totalMinutes: number;
  totalCents: number;
  rows: ValidatedImportRow[];
  canConfirm: boolean;
};

export type ImportConfirmationOptions = {
  skipInvalidRows?: boolean;
  importDuplicates?: boolean;
};

export type ImportConfirmationResult = {
  batchId: string;
  status: ImportBatchStatus;
  importedCount: number;
  skippedInvalidCount: number;
  skippedDuplicateCount: number;
  totalMinutes: number;
  totalCents: number;
  insertedEntryIds: string[];
};

export type StoredBatchPayload = {
  fileName: string;
  fileHash: string;
  format: ImportFileFormat;
  sheets: string[];
  activeSheet: string;
  detectedColumns: string[];
  rawRows: ParsedRawRow[];
  mapping?: ColumnMapping;
  validatedRows?: ValidatedImportRow[];
};
