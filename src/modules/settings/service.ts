import "server-only";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { z } from "zod";
import {
  SETTINGS_ID,
  settingsUpdateSchema,
  type SettingsUpdateInput,
} from "@/modules/settings/schema";

export type SettingsRecord = {
  id: string;
  timezone: string;
  currency: string;
  defaultHourlyRateCents: number;
  createdAt: Date;
  updatedAt: Date;
};

function snapshot(settings: SettingsRecord) {
  return {
    timezone: settings.timezone,
    currency: settings.currency,
    defaultHourlyRateCents: settings.defaultHourlyRateCents,
  };
}

/**
 * Inicialização idempotente do singleton. A moeda é criada como BRL e não
 * é editável no MVP; a política de troca com histórico continua pendente.
 */
export async function getSettings(): Promise<SettingsRecord> {
  return prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
}

export async function updateSettings(
  input: SettingsUpdateInput,
): Promise<SettingsRecord> {
  const parsed = settingsUpdateSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError(
      "Revise os dados das configurações.",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  return prisma.$transaction(async (transaction) => {
    const before = await transaction.settings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });

    const after = await transaction.settings.update({
      where: { id: SETTINGS_ID },
      data: {
        timezone: parsed.data.timezone,
        defaultHourlyRateCents: parsed.data.defaultHourlyRateCents,
      },
    });

    await transaction.auditLog.create({
      data: {
        entity: "Settings",
        entityId: SETTINGS_ID,
        action: "UPDATE",
        before: snapshot(before),
        after: snapshot(after),
        origin: "local",
      },
    });

    return after;
  });
}
