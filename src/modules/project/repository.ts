import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";

export type ProjectDbClientLike = Pick<
  PrismaClient,
  "project" | "client" | "settings" | "auditLog" | "$transaction"
>;

export const projectWithClientAndCountsInclude = {
  client: {
    select: {
      id: true,
      name: true,
      active: true,
      hourlyRateCents: true,
    },
  },
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
};
