import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  formatInstantInTimeZone,
  formatYearMonthLabelPtBR,
} from "@/lib/datetime";
import { prisma as defaultDb } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { getCompetenceDateBounds } from "@/modules/billing/repository";
import {
  billingMonthSchema,
  billingYearSchema,
} from "@/modules/billing/schema";
import { getSettings } from "@/modules/settings/service";
import type {
  DashboardClientDistributionRow,
  DashboardProjectDistributionRow,
  MonthlyDashboardView,
} from "./types";

function getAdjacentYearMonth(
  year: number,
  month: number,
  deltaMonths: number,
): { year: number; month: number } {
  const totalMonths = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return { year: nextYear, month: nextMonth };
}

export async function getMonthlyDashboard(
  input: { year?: number; month?: number } = {},
  database: PrismaClient = defaultDb,
): Promise<MonthlyDashboardView> {
  const settings = await getSettings(database);
  const todayInZone = formatInstantInTimeZone(new Date(), settings.timezone);
  const [todayYearStr, todayMonthStr] = todayInZone.date.split("-");
  const currentYear = Number(todayYearStr);
  const currentMonth = Number(todayMonthStr);

  const rawYear = input.year ?? currentYear;
  const rawMonth = input.month ?? currentMonth;

  const yearParsed = billingYearSchema.safeParse(rawYear);
  const monthParsed = billingMonthSchema.safeParse(rawMonth);

  if (!yearParsed.success || !monthParsed.success) {
    throw new ValidationError("Competência do dashboard inválida.", {
      ...(yearParsed.success
        ? {}
        : { year: yearParsed.error.issues.map((i) => i.message) }),
      ...(monthParsed.success
        ? {}
        : { month: monthParsed.error.issues.map((i) => i.message) }),
    });
  }

  const year = yearParsed.data;
  const month = monthParsed.data;
  const { startDate, endDate, competenceLabel } = getCompetenceDateBounds(
    year,
    month,
  );

  const [entries, billingPeriods] = await Promise.all([
    database.timeEntry.findMany({
      where: {
        deletedAt: null,
        workDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            active: true,
            clientId: true,
            client: {
              select: {
                id: true,
                name: true,
                active: true,
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
            amountCents: true,
            clientName: true,
            projectName: true,
          },
        },
      },
      orderBy: [{ workDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    database.billingPeriod.findMany({
      where: {
        year,
        month,
      },
      include: {
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
    }),
  ]);

  const distinctWorkDates = new Set<string>();
  let totalWorkedMinutesBig = 0n;
  let billableMinutesBig = 0n;
  let accumulatedBillableCentsBig = 0n;
  let unbilledDraftCentsBig = 0n;

  const clientMap = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      clientActive: boolean;
      projectIds: Set<string>;
      entryCount: number;
      workedMinutes: number;
      billableMinutes: number;
      amountCents: number;
    }
  >();

  const projectMap = new Map<
    string,
    {
      projectId: string;
      projectName: string;
      projectActive: boolean;
      clientId: string;
      clientName: string;
      entryCount: number;
      workedMinutes: number;
      billableMinutes: number;
      amountCents: number;
    }
  >();

  for (const entry of entries) {
    distinctWorkDates.add(entry.workDate);
    totalWorkedMinutesBig += BigInt(entry.durationMinutes);

    const snapshotItem = entry.billingItems[0];
    const effectiveCents = snapshotItem
      ? snapshotItem.amountCents
      : entry.amountCents;
    const effectiveClientName = snapshotItem
      ? snapshotItem.clientName
      : entry.project.client.name;
    const effectiveProjectName = snapshotItem
      ? snapshotItem.projectName
      : entry.project.name;

    const isBillable = entry.billable;
    if (isBillable) {
      billableMinutesBig += BigInt(entry.durationMinutes);
      accumulatedBillableCentsBig += BigInt(effectiveCents);

      const hasActiveClosingItem =
        entry.status === "BILLED" || entry.billingItems.length > 0;
      if (!hasActiveClosingItem) {
        unbilledDraftCentsBig += BigInt(effectiveCents);
      }
    }

    const client = entry.project.client;
    const existingClient = clientMap.get(client.id) ?? {
      clientId: client.id,
      clientName: effectiveClientName,
      clientActive: client.active,
      projectIds: new Set<string>(),
      entryCount: 0,
      workedMinutes: 0,
      billableMinutes: 0,
      amountCents: 0,
    };
    existingClient.projectIds.add(entry.project.id);
    existingClient.entryCount += 1;
    existingClient.workedMinutes += entry.durationMinutes;
    if (isBillable) {
      existingClient.billableMinutes += entry.durationMinutes;
      existingClient.amountCents += effectiveCents;
    }
    clientMap.set(client.id, existingClient);

    const existingProject = projectMap.get(entry.project.id) ?? {
      projectId: entry.project.id,
      projectName: effectiveProjectName,
      projectActive: entry.project.active,
      clientId: client.id,
      clientName: effectiveClientName,
      entryCount: 0,
      workedMinutes: 0,
      billableMinutes: 0,
      amountCents: 0,
    };
    existingProject.entryCount += 1;
    existingProject.workedMinutes += entry.durationMinutes;
    if (isBillable) {
      existingProject.billableMinutes += entry.durationMinutes;
      existingProject.amountCents += effectiveCents;
    }
    projectMap.set(entry.project.id, existingProject);
  }

  let closedPeriodsCount = 0;
  let reopenedPeriodsCount = 0;
  let closedBillingsCentsBig = 0n;
  let receivedCompetenceCentsBig = 0n;
  let closedBalanceCentsBig = 0n;

  for (const period of billingPeriods) {
    if (period.status === "CLOSED") {
      closedPeriodsCount += 1;
      closedBillingsCentsBig += BigInt(period.totalCents);

      const activePaymentsInCurrentRevision = period.payments.filter(
        (payment) => payment.revision === period.revision,
      );
      const paidForPeriodBig = activePaymentsInCurrentRevision.reduce(
        (acc, p) => acc + BigInt(p.amountCents),
        0n,
      );
      receivedCompetenceCentsBig += paidForPeriodBig;

      const periodBalanceBig =
        BigInt(period.totalCents) > paidForPeriodBig
          ? BigInt(period.totalCents) - paidForPeriodBig
          : 0n;
      closedBalanceCentsBig += periodBalanceBig;
    } else if (period.status === "REOPENED") {
      reopenedPeriodsCount += 1;
    }
  }

  const totalWorkedMinutes = Number(totalWorkedMinutesBig);
  const billableMinutes = Number(billableMinutesBig);
  const nonBillableMinutes = totalWorkedMinutes - billableMinutes;
  const accumulatedBillableCents = Number(accumulatedBillableCentsBig);
  const unbilledDraftCents = Number(unbilledDraftCentsBig);
  const closedBillingsCents = Number(closedBillingsCentsBig);
  const receivedCompetenceCents = Number(receivedCompetenceCentsBig);
  const closedBalanceCents = Number(closedBalanceCentsBig);
  const totalPendingCompetenceCents = Number(
    unbilledDraftCentsBig + closedBalanceCentsBig,
  );

  const distributionByClient: DashboardClientDistributionRow[] = Array.from(
    clientMap.values(),
  )
    .map((item) => ({
      clientId: item.clientId,
      clientName: item.clientName,
      clientActive: item.clientActive,
      projectCount: item.projectIds.size,
      entryCount: item.entryCount,
      workedMinutes: item.workedMinutes,
      billableMinutes: item.billableMinutes,
      nonBillableMinutes: item.workedMinutes - item.billableMinutes,
      amountCents: item.amountCents,
      sharePercent:
        totalWorkedMinutes > 0
          ? Math.round((item.workedMinutes * 10_000) / totalWorkedMinutes) / 100
          : 0,
    }))
    .sort(
      (a, b) =>
        b.workedMinutes - a.workedMinutes ||
        a.clientName.localeCompare(b.clientName, "pt-BR"),
    );

  const distributionByProject: DashboardProjectDistributionRow[] = Array.from(
    projectMap.values(),
  )
    .map((item) => ({
      projectId: item.projectId,
      projectName: item.projectName,
      projectActive: item.projectActive,
      clientId: item.clientId,
      clientName: item.clientName,
      entryCount: item.entryCount,
      workedMinutes: item.workedMinutes,
      billableMinutes: item.billableMinutes,
      nonBillableMinutes: item.workedMinutes - item.billableMinutes,
      amountCents: item.amountCents,
      sharePercent:
        totalWorkedMinutes > 0
          ? Math.round((item.workedMinutes * 10_000) / totalWorkedMinutes) / 100
          : 0,
    }))
    .sort(
      (a, b) =>
        b.workedMinutes - a.workedMinutes ||
        a.projectName.localeCompare(b.projectName, "pt-BR"),
    );

  return {
    year,
    month,
    competenceLabel,
    monthTitlePtBR: formatYearMonthLabelPtBR(year, month),
    previousMonth: getAdjacentYearMonth(year, month, -1),
    nextMonth: getAdjacentYearMonth(year, month, 1),
    currentMonth: { year: currentYear, month: currentMonth },
    timezone: settings.timezone,
    entryCount: entries.length,
    workedDaysCount: distinctWorkDates.size,
    totalWorkedMinutes,
    billableMinutes,
    nonBillableMinutes,
    accumulatedBillableCents,
    unbilledDraftCents,
    closedBillingsCents,
    receivedCompetenceCents,
    closedBalanceCents,
    totalPendingCompetenceCents,
    closedPeriodsCount,
    reopenedPeriodsCount,
    distributionByClient,
    distributionByProject,
  };
}
