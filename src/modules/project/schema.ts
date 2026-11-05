import { z } from "zod";
import {
  clientIdSchema,
  optionalHourlyRateCentsSchema,
  optionalHourlyRateInputSchema,
} from "@/modules/client/schema";
import type { ProjectStatusFilter } from "@/modules/project/types";

export const MAX_PROJECT_NAME_LENGTH = 120;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 500;

export const projectIdSchema = z
  .string()
  .trim()
  .uuid("Identificador de projeto inválido.");

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome do projeto.")
  .max(
    MAX_PROJECT_NAME_LENGTH,
    `O nome do projeto deve ter no máximo ${MAX_PROJECT_NAME_LENGTH} caracteres.`,
  );

export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(
    MAX_PROJECT_DESCRIPTION_LENGTH,
    `A descrição deve ter no máximo ${MAX_PROJECT_DESCRIPTION_LENGTH} caracteres.`,
  )
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const projectWriteSchema = z.object({
  clientId: clientIdSchema,
  name: projectNameSchema,
  description: projectDescriptionSchema,
  hourlyRateCents: optionalHourlyRateCentsSchema,
});

export type ProjectWriteInput = {
  clientId: string;
  name: string;
  description?: string | null;
  hourlyRateCents?: number | null;
};

export const projectFormSchema = z.object({
  clientId: clientIdSchema,
  name: projectNameSchema,
  description: projectDescriptionSchema,
  hourlyRate: optionalHourlyRateInputSchema,
});

export type ProjectFormParsed = z.infer<typeof projectFormSchema>;

export const projectStatusFilterSchema = z
  .enum(["all", "active", "inactive"])
  .catch("all");

export function parseProjectListFilter(input?: {
  query?: string | null;
  clientId?: string | null;
  status?: string | null;
}): {
  query: string;
  clientId: string;
  status: ProjectStatusFilter;
} {
  const query = (input?.query ?? "").trim().slice(0, MAX_PROJECT_NAME_LENGTH);
  const rawClientId = (input?.clientId ?? "").trim();
  const clientId = clientIdSchema.safeParse(rawClientId).success
    ? rawClientId
    : "";
  const status = projectStatusFilterSchema.parse(input?.status ?? "all");

  return {
    query,
    clientId,
    status,
  };
}
