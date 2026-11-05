import type { RateSource } from "@/lib/rates";

export type ProjectStatusFilter = "all" | "active" | "inactive";

export type ProjectListFilter = {
  query?: string;
  clientId?: string;
  status?: ProjectStatusFilter;
};

export type ProjectRecord = {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  hourlyRateCents: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectSummary = ProjectRecord & {
  clientName: string;
  clientActive: boolean;
  clientHourlyRateCents: number | null;
  effectiveHourlyRateCents: number;
  effectiveRateSource: RateSource;
  eligibleForTimeEntries: boolean;
  timeEntryCount: number;
  billingItemCount: number;
  hasHistory: boolean;
  canDelete: boolean;
  canChangeClient: boolean;
};
