export type DashboardClientDistributionRow = {
  clientId: string;
  clientName: string;
  clientActive: boolean;
  projectCount: number;
  entryCount: number;
  workedMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  amountCents: number;
  sharePercent: number;
};

export type DashboardProjectDistributionRow = {
  projectId: string;
  projectName: string;
  projectActive: boolean;
  clientId: string;
  clientName: string;
  entryCount: number;
  workedMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  amountCents: number;
  sharePercent: number;
};

export type MonthlyDashboardView = {
  year: number;
  month: number;
  competenceLabel: string;
  monthTitlePtBR: string;
  previousMonth: { year: number; month: number };
  nextMonth: { year: number; month: number };
  currentMonth: { year: number; month: number };
  timezone: string;
  entryCount: number;
  workedDaysCount: number;
  totalWorkedMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  accumulatedBillableCents: number;
  /**
   * Valor de apontamentos faturáveis ativos na competência que ainda estão
   * sem fechamento ativo (`status !== "BILLED"` e sem `BillingItem` ativo).
   */
  unbilledDraftCents: number;
  /**
   * Soma de `totalCents` dos fechamentos `CLOSED` da competência.
   */
  closedBillingsCents: number;
  /**
   * Soma dos pagamentos ativos (`voidedAt === null`) vinculados aos fechamentos
   * `CLOSED` da competência selecionada (semântica de competência).
   */
  receivedCompetenceCents: number;
  /**
   * Saldo em aberto dos fechamentos `CLOSED` da competência (`totalCents - paidCents`).
   */
  closedBalanceCents: number;
  /**
   * Pendente total da competência sem dupla contagem:
   * `unbilledDraftCents + closedBalanceCents`.
   */
  totalPendingCompetenceCents: number;
  closedPeriodsCount: number;
  reopenedPeriodsCount: number;
  distributionByClient: DashboardClientDistributionRow[];
  distributionByProject: DashboardProjectDistributionRow[];
};
