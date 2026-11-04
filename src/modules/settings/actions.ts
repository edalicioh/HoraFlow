"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import {
  type SettingsActionState,
} from "@/modules/settings/action-state";
import { settingsFormSchema } from "@/modules/settings/schema";
import { updateSettings } from "@/modules/settings/service";

export async function updateSettingsAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = settingsFormSchema.safeParse({
    timezone: String(formData.get("timezone") ?? ""),
    defaultHourlyRate: String(formData.get("defaultHourlyRate") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    await updateSettings({
      timezone: parsed.data.timezone,
      defaultHourlyRateCents: parsed.data.defaultHourlyRate,
    });
    revalidatePath("/settings");
    return {
      status: "success",
      message: "Configurações salvas. A moeda permanece BRL no MVP.",
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao atualizar configurações.", error);
    return {
      status: "error",
      message: "Não foi possível salvar as configurações. Tente novamente.",
    };
  }
}
