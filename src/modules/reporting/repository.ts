import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { billingPeriodDetailInclude } from "@/modules/billing/repository";
import type { ReportFilterState } from "./types";

export function resolveEffectiveDateBounds(filter: ReportFilterState): {
  startDate: string | null;
  endDate: string | null;
} {
  let startDate = filter.startDate;
  let endDate = filter.endDate;

  if (filter.year !== null && filter.month !== null) {
    const paddedMonth = String(filter.month).padStart(2, "0");
    const monthStart = `${filter.year}-${paddedMonth}-01`;
    const monthEnd = `${filter.year}-${paddedMonth}-31`;
    if (!startDate || monthStart > startDate) {
      startDate = monthStart;
    }
    if (!endDate || monthEnd < endDate) {
      endDate = monthEnd;
    }
  } else if (filter.year !== null) {
    const yearStart = `${filter.year}-01-01`;
    const yearEnd = `${filter.year}-12-31`;
    if (!startDate || yearStart > startDate) {
      startDate = yearStart;
    }
    if (!endDate || yearEnd < endDate) {
      endDate = yearEnd;
    }
  }

  return { startDate, endDate };
}

export async function queryReportTimeEntries(
  database: PrismaClient,
  filter: ReportFilterState,
) {
  const { startDate, endDate } = resolveEffectiveDateBounds(filter);
  const where: Prisma.TimeEntryWhereInput = {
    deletedAt: null,
  };

  if (startDate || endDate) {
    where.workDate = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  if (filter.projectId) {
    where.projectId = filter.projectId;
  }

  if (filter.clientId) {
    where.project = {
      clientId: filter.clientId,
    };
  }

  if (filter.billable === "BILLABLE") {
    where.billable = true;
  } else if (filter.billable === "NON_BILLABLE") {
    where.billable = false;
  }

  if (filter.entryStatus !== "ALL") {
    where.status = filter.entryStatus;
  }

  return database.timeEntry.findMany({
    where,
    include: {
      project: {
        select: {
          id: true,
          name: true,
          clientId: true,
          client: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      billingItems: {
        where: {
          releasedAt: null,
        },
        select: {
          id: true,
          billingPeriodId: true,
          revision: true,
          clientName: true,
          projectName: true,
          description: true,
          hourlyRateCents: true,
          amountCents: true,
        },
      },
    },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
}

export async function queryReportBillingPeriods(
  database: PrismaClient,
  filter: ReportFilterState,
) {
  const where: Prisma.BillingPeriodWhereInput = {};

  if (filter.billingPeriodId) {
    where.id = filter.billingPeriodId;
  }

  if (filter.clientId) {
    where.clientId = filter.clientId;
  }

  if (filter.year !== null) {
    where.year = filter.year;
  }

  if (filter.month !== null) {
    where.month = filter.month;
  }

  if (filter.periodStatus !== "ALL") {
    where.status = filter.periodStatus;
  }

  return database.billingPeriod.findMany({
    where,
    include: billingPeriodDetailInclude,
    orderBy: [{ year: "desc" }, { month: "desc" }, { updatedAt: "desc" }],
  });
}

export async function queryReportPayments(
  database: PrismaClient,
  filter: ReportFilterState,
) {
  const where: Prisma.PaymentWhereInput = {};

  if (!filter.includeVoidedPayments) {
    where.voidedAt = null;
  }

  if (filter.billingPeriodId) {
    where.billingPeriodId = filter.billingPeriodId;
  }

  const periodFilter: Prisma.BillingPeriodWhereInput = {};
  if (filter.clientId) {
    periodFilter.clientId = filter.clientId;
  }

  if (filter.paymentFilterMode === "COMPETENCE") {
    if (filter.year !== null) {
      periodFilter.year = filter.year;
    }
    if (filter.month !== null) {
      periodFilter.month = filter.month;
    }
  }

  if (Object.keys(periodFilter).length > 0) {
    where.billingPeriod = periodFilter;
  }

  return database.payment.findMany({
    where,
    include: {
      billingPeriod: {
        include: {
          client: {
            select: {
              id: true,
              name: true,
            },
          },
          payments: {
            where: {
              voidedAt: null,
            },
            select: {
              id: true,
              revision: true,
              amountCents: true,
            },
          },
        },
      },
    },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
}
