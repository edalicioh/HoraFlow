import { z } from "zod";
import { MAX_CENTS, parseBRLToCents } from "@/lib/money";

export const MVP_CURRENCY = "BRL" as const;
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
export const SETTINGS_ID = "singleton";

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Informe um fuso horário.")
  .max(64, "O fuso horário deve ter no máximo 64 caracteres.")
  .refine(isValidTimeZone, "Informe um fuso IANA válido, como America/Sao_Paulo.");

export const settingsUpdateSchema = z.object({
  timezone: timezoneSchema,
  defaultHourlyRateCents: z
    .number()
    .int("A tarifa deve estar em centavos inteiros.")
    .min(0, "A tarifa não pode ser negativa.")
    .max(MAX_CENTS, "A tarifa excede o limite permitido."),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

export const settingsFormSchema = z.object({
  timezone: timezoneSchema,
  defaultHourlyRate: z
    .string()
    .trim()
    .min(1, "Informe a tarifa global.")
    .refine(
      (value) => parseBRLToCents(value) !== null,
      "Informe um valor em reais válido, como 150,00.",
    )
    .transform((value) => parseBRLToCents(value) as number),
});

export type SettingsFormInput = z.infer<typeof settingsFormSchema>;
