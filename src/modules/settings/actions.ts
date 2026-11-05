"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { evaluateRequestPolicy } from "@/lib/request-policy";
import {
  type SettingsActionState,
} from "@/modules/settings/action-state";
import { settingsFormSchema } from "@/modules/settings/schema";
import { updateSettings } from "@/modules/settings/service";

export async function updateSettingsAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const requestHeaders = await headers();
  const policy = evaluateRequestPolicy({
    method: "POST",
    headers: requestHeaders,
  });

  if (!policy.allowed) {
    console.warn(
      `[request-policy] Server Action de configurações rejeitada (${policy.reason}).`,
    );

    return {
      status: "error",
      message: "Solicitação não autorizada.",
    };
  }

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
    revalidatePath("/clients");
    revalidatePath("/clients/[id]", "page");
    revalidatePath("/projects");
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
