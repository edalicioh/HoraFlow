import { z } from "zod";
import { MAX_CENTS, parseOptionalBRLToCents } from "@/lib/money";
import type { ClientStatusFilter } from "@/modules/client/types";

export const MAX_CLIENT_NAME_LENGTH = 120;
export const MAX_CLIENT_DESCRIPTION_LENGTH = 500;

export const clientIdSchema = z
  .string()
  .trim()
  .uuid("Identificador de cliente inválido.");

export const clientNameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome do cliente.")
  .max(
    MAX_CLIENT_NAME_LENGTH,
    `O nome do cliente deve ter no máximo ${MAX_CLIENT_NAME_LENGTH} caracteres.`,
  );

export const clientDescriptionSchema = z
  .string()
  .trim()
  .max(
    MAX_CLIENT_DESCRIPTION_LENGTH,
    `A descrição deve ter no máximo ${MAX_CLIENT_DESCRIPTION_LENGTH} caracteres.`,
  )
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const optionalHourlyRateCentsSchema = z
  .number({
    error: "A tarifa deve ser um número inteiro em centavos.",
  })
  .int("A tarifa deve estar em centavos inteiros.")
  .min(0, "A tarifa não pode ser negativa.")
  .max(MAX_CENTS, "A tarifa excede o limite permitido.")
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const clientWriteSchema = z.object({
  name: clientNameSchema,
  description: clientDescriptionSchema,
  hourlyRateCents: optionalHourlyRateCentsSchema,
});

export type ClientWriteInput = {
  name: string;
  description?: string | null;
  hourlyRateCents?: number | null;
};

export const optionalHourlyRateInputSchema = z
  .string()
  .optional()
  .default("")
  .refine(
    (value) => parseOptionalBRLToCents(value).valid,
    "Informe um valor em reais válido, como 150,00, ou deixe em branco.",
  )
  .transform((value) => {
    const parsed = parseOptionalBRLToCents(value);
    return parsed.valid ? parsed.cents : null;
  });

export const clientFormSchema = z.object({
  name: clientNameSchema,
  description: clientDescriptionSchema,
  hourlyRate: optionalHourlyRateInputSchema,
});

export type ClientFormParsed = z.infer<typeof clientFormSchema>;

export const clientStatusFilterSchema = z
  .enum(["all", "active", "inactive"])
  .catch("all");

export function parseClientListFilter(input?: {
  query?: string | null;
  status?: string | null;
}): {
  query: string;
  status: ClientStatusFilter;
} {
  const query = (input?.query ?? "").trim().slice(0, MAX_CLIENT_NAME_LENGTH);
  const status = clientStatusFilterSchema.parse(input?.status ?? "all");

  return {
    query,
    status,
  };
}
