import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type DbOrTx = PrismaClient | Prisma.TransactionClient;

export function getCompetenceDateBounds(year: number, month: number): {
  startDate: string;
  endDate: string;
  competenceLabel: string;
} {
  const paddedMonth = String(month).padStart(2, "0");
  return {
    startDate: `${year}-${paddedMonth}-01`,
    endDate: `${year}-${paddedMonth}-31`,
    competenceLabel: `${paddedMonth}/${year}`,
  };
}

export async function findCompetenceBillableEntries(
  database: DbOrTx,
  clientId: string,
  year: number,
  month: number,
) {
  const { startDate, endDate } = getCompetenceDateBounds(year, month);

  return database.timeEntry.findMany({
    where: {
      deletedAt: null,
      billable: true,
      workDate: {
        gte: startDate,
        lte: endDate,
      },
      project: {
        clientId,
      },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          clientId: true,
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
        },
      },
    },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
}

export const billingPeriodDetailInclude = {
  client: {
    select: {
      id: true,
      name: true,
      active: true,
    },
  },
  items: {
    orderBy: [{ revision: "desc" }, { workDate: "asc" }, { createdAt: "asc" }],
  },
  payments: {
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  },
} satisfies Prisma.BillingPeriodInclude;
