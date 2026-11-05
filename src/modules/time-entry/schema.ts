import { z } from "zod";
import {
  isValidCivilDate,
  isValidLocalTimeHHMM,
  parseCivilDate,
} from "@/lib/datetime";
import {
  MAX_DURATION_MINUTES,
  parseDurationToMinutes,
} from "@/lib/duration";
import { MAX_CENTS, parseOptionalBRLToCents } from "@/lib/money";
import { clientIdSchema } from "@/modules/client/schema";
import { projectIdSchema } from "@/modules/project/schema";
import type {
  TimeEntryBillableFilter,
  TimeEntryStatusFilter,
} from "@/modules/time-entry/types";

export const MAX_TIME_ENTRY_DESCRIPTION_LENGTH = 500;
export const DEFAULT_TIME_ENTRY_PAGE_SIZE = 50;
export const MAX_TIME_ENTRY_PAGE_SIZE = 100;

export const timeEntryIdSchema = z
  .string()
  .trim()
  .uuid("Identificador de apontamento inválido.");

export const civilDateSchema = z
  .string()
  .trim()
  .refine(
    isValidCivilDate,
    "Informe uma data civil válida no formato AAAA-MM-DD.",
  );

export const localTimeSchema = z
  .string()
  .trim()
  .refine(
    isValidLocalTimeHHMM,
    "Informe um horário válido no formato HH:mm (00:00 a 23:59, sem segundos).",
  );

export const durationMinutesSchema = z
  .number({
    error: "A duração deve ser um número inteiro de minutos.",
  })
  .int("A duração deve estar em minutos inteiros.")
  .min(1, "A duração deve ser maior que zero.")
  .max(
    MAX_DURATION_MINUTES,
    "A duração excede o limite máximo permitido.",
  );

export const durationTextSchema = z
  .string()
  .trim()
  .min(1, "Informe a duração no formato HH:mm.")
  .refine(
    (value) => parseDurationToMinutes(value) !== null,
    "Informe uma duração válida no formato HH:mm (ex.: 05:30 ou 24:30), maior que 00:00.",
  )
  .transform((value) => parseDurationToMinutes(value) as number);

export const timeEntryDescriptionSchema = z
  .string()
  .trim()
  .max(
    MAX_TIME_ENTRY_DESCRIPTION_LENGTH,
    `A descrição deve ter no máximo ${MAX_TIME_ENTRY_DESCRIPTION_LENGTH} caracteres.`,
  )
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const optionalExplicitRateCentsSchema = z
  .number({
    error: "A tarifa deve ser um número inteiro em centavos.",
  })
  .int("A tarifa deve estar em centavos inteiros.")
  .min(0, "A tarifa não pode ser negativa.")
  .max(MAX_CENTS, "A tarifa excede o limite permitido.")
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const optionalExplicitRateInputSchema = z
  .string()
  .optional()
  .default("")
  .refine(
    (value) => parseOptionalBRLToCents(value).valid,
    "Informe uma tarifa válida em reais, como 150,00, ou deixe em branco para usar a tarifa automática.",
  )
  .transform((value) => {
    const parsed = parseOptionalBRLToCents(value);
    return parsed.valid ? parsed.cents : null;
  });

export type TimeEntryDurationWriteInput = {
  mode: "DURATION";
  projectId: string;
  clientId?: string | null;
  workDate: string;
  durationMinutes?: number;
  durationText?: string;
  description?: string | null;
  billable?: boolean;
  hourlyRateCents?: number | null;
};

export type TimeEntryIntervalLocalWriteInput = {
  mode: "INTERVAL";
  projectId: string;
  clientId?: string | null;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  description?: string | null;
  billable?: boolean;
  hourlyRateCents?: number | null;
};

export type TimeEntryIntervalUtcWriteInput = {
  mode: "INTERVAL";
  projectId: string;
  clientId?: string | null;
  workDate?: string;
  startAt: Date;
  endAt: Date;
  description?: string | null;
  billable?: boolean;
  hourlyRateCents?: number | null;
};

export type TimeEntryWriteInput =
  | TimeEntryDurationWriteInput
  | TimeEntryIntervalLocalWriteInput
  | TimeEntryIntervalUtcWriteInput;

export const timeEntryFormRawSchema = z.object({
  mode: z.enum(["DURATION", "INTERVAL"], {
    error: "Selecione a modalidade de registro (Duração ou Intervalo).",
  }),
  clientId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  projectId: projectIdSchema,
  workDate: z.string().trim().optional().default(""),
  durationText: z.string().trim().optional().default(""),
  startDate: z.string().trim().optional().default(""),
  startTime: z.string().trim().optional().default(""),
  endDate: z.string().trim().optional().default(""),
  endTime: z.string().trim().optional().default(""),
  description: timeEntryDescriptionSchema,
  billable: z.boolean().default(true),
  hourlyRate: optionalExplicitRateInputSchema,
});

const billableFilterSchema = z
  .enum(["all", "billable", "non_billable"])
  .catch("all");

const statusFilterSchema = z
  .enum(["all", "DRAFT", "BILLED", "APPROVED"])
  .catch("all");

export function parseCalendarParams(input: {
  year?: string | number | null;
  month?: string | number | null;
  date?: string | null;
  todayCivilDate: string;
}): {
  year: number;
  month: number;
  selectedDate: string;
} {
  const todayParts = parseCivilDate(input.todayCivilDate) ?? {
    year: 2026,
    month: 10,
    day: 1,
  };

  const explicitDateParts = input.date ? parseCivilDate(input.date) : null;

  const rawYear = Number(input.year);
  const rawMonth = Number(input.month);

  const year =
    Number.isInteger(rawYear) && rawYear >= 1970 && rawYear <= 2100
      ? rawYear
      : (explicitDateParts?.year ?? todayParts.year);

  const month =
    Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12
      ? rawMonth
      : (explicitDateParts?.month ?? todayParts.month);

  let selectedDate: string;
  if (
    explicitDateParts &&
    explicitDateParts.year === year &&
    explicitDateParts.month === month
  ) {
    selectedDate = input.date!.trim();
  } else if (todayParts.year === year && todayParts.month === month) {
    selectedDate = input.todayCivilDate;
  } else {
    selectedDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  }

  return {
    year,
    month,
    selectedDate,
  };
}

export function parseTimeEntryListFilter(input?: {
  startDate?: string | null;
  endDate?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  billable?: string | null;
  status?: string | null;
  page?: string | number | null;
  pageSize?: string | number | null;
}): {
  startDate: string;
  endDate: string;
  clientId: string;
  projectId: string;
  billable: TimeEntryBillableFilter;
  status: TimeEntryStatusFilter;
  page: number;
  pageSize: number;
} {
  const rawStart = (input?.startDate ?? "").trim();
  const rawEnd = (input?.endDate ?? "").trim();
  const startDate = isValidCivilDate(rawStart) ? rawStart : "";
  const endDate = isValidCivilDate(rawEnd) ? rawEnd : "";

  const rawClientId = (input?.clientId ?? "").trim();
  const clientId = clientIdSchema.safeParse(rawClientId).success
    ? rawClientId
    : "";

  const rawProjectId = (input?.projectId ?? "").trim();
  const projectId = projectIdSchema.safeParse(rawProjectId).success
    ? rawProjectId
    : "";

  const billable = billableFilterSchema.parse(input?.billable ?? "all");
  const status = statusFilterSchema.parse(input?.status ?? "all");

  const rawPage = Number(input?.page ?? 1);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawPageSize = Number(input?.pageSize ?? DEFAULT_TIME_ENTRY_PAGE_SIZE);
  const pageSize =
    Number.isInteger(rawPageSize) &&
    rawPageSize >= 1 &&
    rawPageSize <= MAX_TIME_ENTRY_PAGE_SIZE
      ? rawPageSize
      : DEFAULT_TIME_ENTRY_PAGE_SIZE;

  return {
    startDate,
    endDate,
    clientId,
    projectId,
    billable,
    status,
    page,
    pageSize,
  };
}
