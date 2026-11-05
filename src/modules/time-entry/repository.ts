import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";

export type TimeEntryDbClientLike = Pick<
  PrismaClient,
  | "timeEntry"
  | "project"
  | "client"
  | "billingPeriod"
  | "settings"
  | "auditLog"
  | "$transaction"
>;

export const timeEntryWithProjectAndBillingInclude = {
  project: {
    select: {
      id: true,
      name: true,
      active: true,
      hourlyRateCents: true,
      clientId: true,
      client: {
        select: {
          id: true,
          name: true,
          active: true,
          hourlyRateCents: true,
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
    },
  },
};
