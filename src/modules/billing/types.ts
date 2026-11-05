import type {
  BillingItem,
  BillingPeriod,
  BillingPeriodStatus,
  Payment,
  TimeEntryMode,
  TimeEntryStatus,
} from "@/generated/prisma/client";
import type { AuditLogSummary } from "@/modules/audit/types";

export type { BillingPeriodStatus };

/**
 * Estado derivado de pagamento da competência:
 * - `NOT_APPLICABLE`: competência `OPEN` ou `REOPENED` (não conta como dívida fechada ativa)
 * - `UNPAID`: competência `CLOSED` com `totalCents > 0` e `paidCents === 0`
 * - `PARTIAL`: competência `CLOSED` com `0 < paidCents < totalCents`
 * - `PAID`: competência `CLOSED` com `paidCents >= totalCents` (ou `totalCents === 0`)
 */
export type DerivedPaymentStatus =
  | "NOT_APPLICABLE"
  | "UNPAID"
  | "PARTIAL"
  | "PAID";

export function formatPaymentStatusLabel(status: DerivedPaymentStatus): string {
  switch (status) {
    case "PAID":
      return "Quitado";
    case "PARTIAL":
      return "Parcial";
    case "UNPAID":
      return "Sem pagamento";
    case "NOT_APPLICABLE":
      return "Não aplicável";
  }
}

export function formatBillingPeriodStatusLabel(
  status: BillingPeriodStatus,
): string {
  switch (status) {
    case "OPEN":
      return "Aberta";
    case "CLOSED":
      return "Fechada";
    case "REOPENED":
      return "Reaberta";
  }
}

export type BillingItemSnapshot = {
  id: string;
  billingPeriodId: string;
  timeEntryId: string;
  revision: number;
  releasedAt: string | null;
  clientName: string;
  projectName: string;
  description: string | null;
  workDate: string;
  durationMinutes: number;
  hourlyRateCents: number;
  amountCents: number;
  billable: boolean;
  createdAt: string;
};

export type PaymentSummary = {
  id: string;
  billingPeriodId: string;
  revision: number;
  amountCents: number;
  paidAt: string;
  paidDate: string;
  method: string | null;
  note: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingPeriodSummary = {
  id: string;
  clientId: string;
  clientName: string;
  clientNameSnapshot: string | null;
  displayClientName: string;
  year: number;
  month: number;
  competenceLabel: string;
  revision: number;
  status: BillingPeriodStatus;
  totalMinutes: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  paymentStatus: DerivedPaymentStatus;
  activeItemCount: number;
  releasedItemCount: number;
  activePaymentCount: number;
  voidedPaymentCount: number;
  canReopen: boolean;
  reopenBlockedReason: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingPeriodDetail = BillingPeriodSummary & {
  activeItems: BillingItemSnapshot[];
  releasedItems: BillingItemSnapshot[];
  payments: PaymentSummary[];
  auditLogs: AuditLogSummary[];
};

export type MonthlyClosingPreviewItem = {
  timeEntryId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  workDate: string;
  mode: TimeEntryMode;
  durationMinutes: number;
  hourlyRateCents: number;
  amountCents: number;
  description: string | null;
  status: TimeEntryStatus;
  hasActiveBillingItem: boolean;
};

export type MonthlyClosingPreview = {
  clientId: string;
  clientName: string;
  year: number;
  month: number;
  competenceLabel: string;
  existingPeriodId: string | null;
  existingStatus: BillingPeriodStatus | null;
  nextRevision: number;
  items: MonthlyClosingPreviewItem[];
  totalMinutes: number;
  totalCents: number;
  previewSignature: string;
  canClose: boolean;
  blockingReasons: string[];
};

export type PreviewMonthlyClosingInput = {
  clientId: string;
  year: number;
  month: number;
};

export type CloseBillingPeriodInput = {
  clientId: string;
  year: number;
  month: number;
  previewSignature?: string | null;
  origin?: string;
};

export type ReopenBillingPeriodInput = {
  billingPeriodId: string;
  reason: string;
  origin?: string;
};

export type ListBillingPeriodsFilter = {
  clientId?: string;
  year?: number;
  month?: number;
  status?: BillingPeriodStatus | "ALL";
  paymentStatus?: DerivedPaymentStatus | "ALL";
};

export type BillingOverviewTotals = {
  closedCount: number;
  reopenedCount: number;
  totalClosedMinutes: number;
  totalClosedCents: number;
  totalPaidCents: number;
  totalOpenBalanceCents: number;
};

export type BillingPeriodRecord = BillingPeriod;
export type BillingItemRecord = BillingItem;
export type PaymentRecord = Payment;
