import type { RateSource } from "@/lib/rates";

export type ClientStatusFilter = "all" | "active" | "inactive";

export type ClientListFilter = {
  query?: string;
  status?: ClientStatusFilter;
};

export type ClientRecord = {
  id: string;
  name: string;
  description: string | null;
  hourlyRateCents: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientSummary = ClientRecord & {
  projectCount: number;
  activeProjectCount: number;
  billingPeriodCount: number;
  timeEntryCount: number;
  hasHistory: boolean;
  canDelete: boolean;
  effectiveHourlyRateCents: number;
  effectiveRateSource: "client" | "global";
};

export type ClientDetailProjectItem = {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  hourlyRateCents: number | null;
  active: boolean;
  effectiveHourlyRateCents: number;
  effectiveRateSource: RateSource;
  eligibleForTimeEntries: boolean;
  timeEntryCount: number;
  billingItemCount: number;
  hasHistory: boolean;
  canDelete: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientDetail = ClientSummary & {
  defaultHourlyRateCents: number;
  projects: ClientDetailProjectItem[];
};
