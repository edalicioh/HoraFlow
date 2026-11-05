import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { civilDateSchema } from "@/modules/time-entry/schema";
import {
  EXPORT_FORMATS,
  PAYMENT_FILTER_MODES,
  REPORT_TYPES,
  type ExportFormat,
  type ReportFilterState,
  type ReportType,
} from "./types";

const optionalUuidSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((val) => (val && val.length > 0 ? val : null))
  .refine(
    (val) =>
      val === null ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        val,
      ),
    "Identificador UUID inválido.",
  );

const optionalCivilDateSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((val) => (val && val.length > 0 ? val : null))
  .superRefine((val, ctx) => {
    if (val === null) return;
    const parsed = civilDateSchema.safeParse(val);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
        });
      }
    }
  });

const optionalYearSchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((val) => {
    if (val === undefined || val === null || String(val).trim() === "") {
      return null;
    }
    return Number(val);
  })
  .refine(
    (val) =>
      val === null || (Number.isInteger(val) && val >= 2000 && val <= 2100),
    "Ano deve estar entre 2000 e 2100.",
  );

const optionalMonthSchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((val) => {
    if (val === undefined || val === null || String(val).trim() === "") {
      return null;
    }
    return Number(val);
  })
  .refine(
    (val) => val === null || (Number.isInteger(val) && val >= 1 && val <= 12),
    "Mês deve estar entre 1 e 12.",
  );

export const reportTypeSchema = z.enum(REPORT_TYPES, {
  message: "Tipo de relatório inválido.",
});

export const exportFormatSchema = z.enum(EXPORT_FORMATS, {
  message: "Formato de exportação inválido (use csv, xlsx ou pdf).",
});

export type RawReportFilterInput = {
  reportType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  billable?: string | null;
  entryStatus?: string | null;
  year?: string | number | null;
  month?: string | number | null;
  billingPeriodId?: string | null;
  periodStatus?: string | null;
  paymentStatus?: string | null;
  paymentFilterMode?: string | null;
  includeVoidedPayments?: string | boolean | null;
};

export function parseReportFilter(
  raw: RawReportFilterInput = {},
): ReportFilterState {
  const reportTypeParsed = reportTypeSchema.safeParse(
    raw.reportType && raw.reportType.trim() !== ""
      ? raw.reportType.trim()
      : "hours-by-period",
  );
  if (!reportTypeParsed.success) {
    throw new ValidationError("Tipo de relatório inválido.", {
      reportType: ["Selecione um tipo de relatório válido."],
    });
  }

  const startParsed = optionalCivilDateSchema.safeParse(raw.startDate);
  if (!startParsed.success) {
    throw new ValidationError("Data inicial inválida.", {
      startDate: startParsed.error.issues.map((i) => i.message),
    });
  }

  const endParsed = optionalCivilDateSchema.safeParse(raw.endDate);
  if (!endParsed.success) {
    throw new ValidationError("Data final inválida.", {
      endDate: endParsed.error.issues.map((i) => i.message),
    });
  }

  const startDate = startParsed.data;
  const endDate = endParsed.data;

  if (startDate && endDate && startDate > endDate) {
    throw new ValidationError(
      "A data inicial não pode ser posterior à data final.",
      {
        startDate: ["A data inicial não pode ser posterior à data final."],
      },
    );
  }

  const clientParsed = optionalUuidSchema.safeParse(raw.clientId);
  if (!clientParsed.success) {
    throw new ValidationError("Cliente inválido.", {
      clientId: clientParsed.error.issues.map((i) => i.message),
    });
  }

  const projectParsed = optionalUuidSchema.safeParse(raw.projectId);
  if (!projectParsed.success) {
    throw new ValidationError("Projeto inválido.", {
      projectId: projectParsed.error.issues.map((i) => i.message),
    });
  }

  const billingPeriodParsed = optionalUuidSchema.safeParse(raw.billingPeriodId);
  if (!billingPeriodParsed.success) {
    throw new ValidationError("Competência selecionada inválida.", {
      billingPeriodId: billingPeriodParsed.error.issues.map((i) => i.message),
    });
  }

  const yearParsed = optionalYearSchema.safeParse(raw.year);
  if (!yearParsed.success) {
    throw new ValidationError("Ano inválido.", {
      year: yearParsed.error.issues.map((i) => i.message),
    });
  }

  const monthParsed = optionalMonthSchema.safeParse(raw.month);
  if (!monthParsed.success) {
    throw new ValidationError("Mês inválido.", {
      month: monthParsed.error.issues.map((i) => i.message),
    });
  }

  if (monthParsed.data !== null && yearParsed.data === null) {
    throw new ValidationError(
      "Informe o ano ao filtrar por mês de competência.",
      {
        year: ["Informe o ano ao filtrar por mês de competência."],
      },
    );
  }

  const billableRaw = (raw.billable ?? "ALL").trim().toUpperCase();
  const billable: ReportFilterState["billable"] =
    billableRaw === "BILLABLE" || billableRaw === "TRUE"
      ? "BILLABLE"
      : billableRaw === "NON_BILLABLE" || billableRaw === "FALSE"
        ? "NON_BILLABLE"
        : "ALL";

  const entryStatusRaw = (raw.entryStatus ?? "ALL").trim().toUpperCase();
  const entryStatus: ReportFilterState["entryStatus"] =
    entryStatusRaw === "DRAFT" ||
    entryStatusRaw === "BILLED" ||
    entryStatusRaw === "APPROVED"
      ? entryStatusRaw
      : "ALL";

  const periodStatusRaw = (raw.periodStatus ?? "ALL").trim().toUpperCase();
  const periodStatus: ReportFilterState["periodStatus"] =
    periodStatusRaw === "OPEN" ||
    periodStatusRaw === "CLOSED" ||
    periodStatusRaw === "REOPENED"
      ? periodStatusRaw
      : "ALL";

  const paymentStatusRaw = (raw.paymentStatus ?? "ALL").trim().toUpperCase();
  const paymentStatus: ReportFilterState["paymentStatus"] =
    paymentStatusRaw === "UNPAID" ||
    paymentStatusRaw === "PARTIAL" ||
    paymentStatusRaw === "PAID" ||
    paymentStatusRaw === "NOT_APPLICABLE"
      ? paymentStatusRaw
      : "ALL";

  const modeRaw = (raw.paymentFilterMode ?? "PAID_AT").trim().toUpperCase();
  const paymentFilterMode = PAYMENT_FILTER_MODES.includes(
    modeRaw as (typeof PAYMENT_FILTER_MODES)[number],
  )
    ? (modeRaw as ReportFilterState["paymentFilterMode"])
    : "PAID_AT";

  const includeVoidedPayments =
    raw.includeVoidedPayments === undefined ||
    raw.includeVoidedPayments === null
      ? true
      : raw.includeVoidedPayments === true ||
        String(raw.includeVoidedPayments).toLowerCase() === "true" ||
        String(raw.includeVoidedPayments) === "1";

  return {
    reportType: reportTypeParsed.data as ReportType,
    startDate,
    endDate,
    clientId: clientParsed.data,
    projectId: projectParsed.data,
    billable,
    entryStatus,
    year: yearParsed.data,
    month: monthParsed.data,
    billingPeriodId: billingPeriodParsed.data,
    periodStatus,
    paymentStatus,
    paymentFilterMode,
    includeVoidedPayments,
  };
}

export function parseExportFormat(raw: string | null | undefined): ExportFormat {
  const normalized = (raw ?? "").trim().toLowerCase();
  const parsed = exportFormatSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new ValidationError(
      "Formato de exportação inválido. Utilize csv, xlsx ou pdf.",
      {
        format: ["Formato de exportação inválido."],
      },
    );
  }
  return parsed.data;
}
