import { z } from "zod";
import { ValidationError } from "@/lib/errors";

export const billingPeriodIdSchema = z
  .string()
  .trim()
  .uuid("Identificador de competência inválido.");

export const billingClientIdSchema = z
  .string()
  .trim()
  .uuid("Selecione um cliente válido.");

export const billingYearSchema = z.coerce
  .number({ message: "Ano inválido." })
  .int("Ano deve ser inteiro.")
  .min(2000, "Ano mínimo permitido é 2000.")
  .max(2100, "Ano máximo permitido é 2100.");

export const billingMonthSchema = z.coerce
  .number({ message: "Mês inválido." })
  .int("Mês deve ser inteiro.")
  .min(1, "Mês deve estar entre 1 e 12.")
  .max(12, "Mês deve estar entre 1 e 12.");

export const billingReasonSchema = z
  .string()
  .trim()
  .min(3, "Informe um motivo com pelo menos 3 caracteres.")
  .max(500, "O motivo deve ter no máximo 500 caracteres.");

export const previewMonthlyClosingSchema = z.object({
  clientId: billingClientIdSchema,
  year: billingYearSchema,
  month: billingMonthSchema,
});

export const closeBillingPeriodSchema = z.object({
  clientId: billingClientIdSchema,
  year: billingYearSchema,
  month: billingMonthSchema,
  previewSignature: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .optional()
    .nullable(),
});

export const reopenBillingPeriodSchema = z.object({
  billingPeriodId: billingPeriodIdSchema,
  reason: billingReasonSchema,
});

export function validateBillingPeriodId(id: string): string {
  const parsed = billingPeriodIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new ValidationError("Identificador de competência inválido.", {
      billingPeriodId: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return parsed.data;
}
