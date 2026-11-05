import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { clientIdSchema } from "@/modules/client/schema";
import { projectIdSchema } from "@/modules/project/schema";
import type { ColumnMapping, ImportConfirmationOptions } from "./types";

export const importBatchIdSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Identificador do lote de importação inválido.",
  );

export const columnMappingSchema = z.object({
  dateColumn: z.string().trim().min(1, "Selecione a coluna de data."),
  durationColumn: z.string().trim().min(1, "Selecione a coluna de duração."),
  descriptionColumn: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  billableColumn: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  dateFormat: z
    .enum(["auto", "YYYY-MM-DD", "DD/MM/YYYY"])
    .default("auto"),
  durationFormat: z
    .enum(["auto", "HH:mm", "decimal_hours"])
    .default("auto"),
  sheetName: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  defaultClientId: clientIdSchema,
  defaultProjectId: projectIdSchema,
});

export const importConfirmationOptionsSchema = z.object({
  skipInvalidRows: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => val === true || val === "true" || val === "1"),
  importDuplicates: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => val === true || val === "true" || val === "1"),
});

export function parseColumnMapping(input: unknown): ColumnMapping {
  const result = columnMappingSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Mapeamento de colunas inválido.", {
      ...result.error.flatten().fieldErrors,
    });
  }
  return result.data;
}

export function parseConfirmationOptions(
  input: unknown,
): ImportConfirmationOptions {
  const result = importConfirmationOptionsSchema.safeParse(input);
  if (!result.success) {
    return { skipInvalidRows: false, importDuplicates: false };
  }
  return result.data;
}
