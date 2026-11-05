export type TimeEntryModeValue = "DURATION" | "INTERVAL";
export type TimeEntryStatusValue = "DRAFT" | "BILLED" | "APPROVED";

export type TimeEntryBillableFilter = "all" | "billable" | "non_billable";
export type TimeEntryStatusFilter = "all" | TimeEntryStatusValue;

export type TimeEntryRecord = {
  id: string;
  projectId: string;
  workDate: string;
  mode: TimeEntryModeValue;
  startAt: Date | null;
  endAt: Date | null;
  durationMinutes: number;
  description: string | null;
  hourlyRateCents: number;
  amountCents: number;
  billable: boolean;
  status: TimeEntryStatusValue;
  deletedAt: Date | null;
  importBatchId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TimeEntrySummary = TimeEntryRecord & {
  clientId: string;
  clientName: string;
  clientActive: boolean;
  projectName: string;
  projectActive: boolean;
  hasActiveBillingItem: boolean;
  isBillingPeriodClosed: boolean;
  canEdit: boolean;
  canDelete: boolean;
  startLocalDate: string | null;
  startLocalTime: string | null;
  endLocalDate: string | null;
  endLocalTime: string | null;
  intervalLabelPtBR: string | null;
};

export type CalendarDaySummary = {
  date: string;
  dayOfMonth: number;
  dayOfWeek: number;
  isWeekend: boolean;
  isToday: boolean;
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  totalCents: number;
  entryCount: number;
  entries: TimeEntrySummary[];
};

export type TimeEntryTotals = {
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  totalCents: number;
  workedDaysCount: number;
  entryCount: number;
};

export type MonthlyCalendarView = {
  year: number;
  month: number;
  monthLabelPtBR: string;
  todayCivilDate: string;
  selectedDate: string;
  timezone: string;
  leadingEmptyDays: number;
  days: CalendarDaySummary[];
  selectedDay: CalendarDaySummary;
  totals: TimeEntryTotals;
};

export type TimeEntryListFilter = {
  startDate?: string;
  endDate?: string;
  clientId?: string;
  projectId?: string;
  billable?: TimeEntryBillableFilter;
  status?: TimeEntryStatusFilter;
  page?: number;
  pageSize?: number;
};

export type TimeEntryListResult = {
  entries: TimeEntrySummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  timezone: string;
  totals: TimeEntryTotals;
};
