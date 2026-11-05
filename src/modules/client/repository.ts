import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";

export type DbClientLike = Pick<
  PrismaClient,
  "client" | "project" | "settings" | "auditLog" | "$transaction"
>;

export const clientWithCountsInclude = {
  projects: {
    orderBy: [{ active: "desc" as const }, { name: "asc" as const }],
    include: {
      _count: {
        select: {
          timeEntries: true,
        },
      },
      timeEntries: {
        select: {
          _count: {
            select: {
              billingItems: true,
            },
          },
        },
      },
    },
  },
  _count: {
    select: {
      projects: true,
      billingPeriods: true,
    },
  },
};
