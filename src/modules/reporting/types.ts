import type {
  BillingPeriodStatus,
  TimeEntryStatus,
} from "@/generated/prisma/client";
import type { DerivedPaymentStatus } from "@/modules/billing/types";

export const REPORT_TYPES = [
  "hours-by-period",
  "hours-by-client",
  "hours-by-project",
  "detailed-entries",
  "billable-values",
  "monthly-closings",
  "payments-and-balances",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const PAYMENT_FILTER_MODES = ["PAID_AT", "COMPETENCE"] as const;
export type PaymentFilterMode = (typeof PAYMENT_FILTER_MODES)[number];

export const MAX_EXPORT_ROWS = 10_000;

export type ReportColumnKind =
  | "text"
  | "date"
  | "duration"
  | "money"
  | "integer"
  | "badge";

export type ReportColumn = {
  key: string;
  label: string;
  kind: ReportColumnKind;
  align?: "left" | "right" | "center";
};

export type ReportCellValue = string | number | null;

export type ReportRow = {
  id: string;
  cells: Record<string, ReportCellValue>;
};

export type ReportSummaryMetric = {
  label: string;
  value: string;
  kind: "duration" | "money" | "integer" | "text";
  rawNumber?: number;
};

export type ReportFilterState = {
  reportType: ReportType;
  startDate: string | null;
  endDate: string | null;
  clientId: string | null;
  projectId: string | null;
  billable: "ALL" | "BILLABLE" | "NON_BILLABLE";
  entryStatus: "ALL" | TimeEntryStatus;
  year: number | null;
  month: number | null;
  billingPeriodId: string | null;
  periodStatus: "ALL" | BillingPeriodStatus;
  paymentStatus: "ALL" | DerivedPaymentStatus;
  paymentFilterMode: PaymentFilterMode;
  includeVoidedPayments: boolean;
};

export type ReportDataset = {
  reportType: ReportType;
  title: string;
  subtitle: string;
  generatedAtIso: string;
  generatedAtLabel: string;
  timezone: string;
  filter: ReportFilterState;
  appliedFilterSummary: string[];
  columns: ReportColumn[];
  rows: ReportRow[];
  totalsRow: Record<string, ReportCellValue> | null;
  summaryMetrics: ReportSummaryMetric[];
  /**
   * Identificadores exatos dos registros base incluídos na consulta,
   * permitindo comprovar equivalência 1:1 entre consulta, tela, CSV, XLSX e PDF.
   */
  matchedRecordIds: string[];
  totalMinutes: number;
  billableMinutes: number;
  totalCents: number;
  workedDaysCount: number;
};

export const REPORT_TYPE_METADATA: Record<
  ReportType,
  { title: string; description: string }
> = {
  "hours-by-period": {
    title: "Horas por período",
    description:
      "Totais diários de horas trabalhadas, horas faturáveis, não faturáveis e valores por data civil.",
  },
  "hours-by-client": {
    title: "Horas por cliente",
    description:
      "Agrupamento consolidado por cliente com projetos ativos no período, dias trabalhados, horas e valores.",
  },
  "hours-by-project": {
    title: "Horas por projeto",
    description:
      "Agrupamento por cliente e projeto com dias trabalhados, horas totais, horas faturáveis e valor acumulado.",
  },
  "detailed-entries": {
    title: "Apontamentos detalhados",
    description:
      "Relação completa de cada apontamento ativo com data, cliente, projeto, modalidade, descrição, duração, tarifa e valor.",
  },
  "billable-values": {
    title: "Valores faturáveis",
    description:
      "Consolidação de horas faturáveis, valor acumulado, valor a faturar (em rascunho) e valor fechado por cliente/competência.",
  },
  "monthly-closings": {
    title: "Fechamentos mensais",
    description:
      "Demonstrativo de competências fechadas/reabertas a partir dos snapshots congelados por revisão, recebido e saldo.",
  },
  "payments-and-balances": {
    title: "Pagamentos e pendências",
    description:
      "Histórico de recebimentos ativos e estornos com filtro explícito por data do pagamento (paidAt) ou competência do fechamento.",
  },
};
