"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { formatMinutesAsDuration } from "@/lib/duration";
import { DomainError } from "@/lib/errors";
import { evaluateRequestPolicy } from "@/lib/request-policy";
import type { TimeEntryActionState } from "@/modules/time-entry/action-state";
import {
  timeEntryFormRawSchema,
  type TimeEntryWriteInput,
} from "@/modules/time-entry/schema";
import {
  createTimeEntry,
  deleteTimeEntry,
  updateTimeEntry,
} from "@/modules/time-entry/service";

async function assertAuthorizedAction(): Promise<TimeEntryActionState | null> {
  const requestHeaders = await headers();
  const policy = evaluateRequestPolicy({
    method: "POST",
    headers: requestHeaders,
  });

  if (!policy.allowed) {
    console.warn(
      `[request-policy] Server Action de apontamentos rejeitada (${policy.reason}).`,
    );

    return {
      status: "error",
      message: "Solicitação não autorizada.",
    };
  }

  return null;
}

function revalidateTimesheetPaths() {
  revalidatePath("/timesheet");
  revalidatePath("/dashboard");
  revalidatePath("/clients");
  revalidatePath("/clients/[id]", "page");
  revalidatePath("/projects");
}

function extractFormPayload(
  formData: FormData,
):
  | { ok: true; data: TimeEntryWriteInput }
  | { ok: false; state: TimeEntryActionState } {
  const billableValue = formData.get("billable");
  const billable =
    billableValue === "true" ||
    billableValue === "on" ||
    billableValue === "1";

  const parsed = timeEntryFormRawSchema.safeParse({
    mode: String(formData.get("mode") ?? "DURATION"),
    clientId: String(formData.get("clientId") ?? ""),
    projectId: String(formData.get("projectId") ?? ""),
    workDate: String(formData.get("workDate") ?? ""),
    durationText: String(formData.get("durationText") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    endTime: String(formData.get("endTime") ?? ""),
    description: String(formData.get("description") ?? ""),
    billable,
    hourlyRate: String(formData.get("hourlyRate") ?? ""),
  });

  if (!parsed.success) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Revise os campos destacados.",
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
      },
    };
  }

  if (parsed.data.mode === "DURATION") {
    return {
      ok: true,
      data: {
        mode: "DURATION",
        clientId: parsed.data.clientId,
        projectId: parsed.data.projectId,
        workDate: parsed.data.workDate,
        durationText: parsed.data.durationText,
        description: parsed.data.description,
        billable: parsed.data.billable,
        hourlyRateCents: parsed.data.hourlyRate,
      },
    };
  }

  return {
    ok: true,
    data: {
      mode: "INTERVAL",
      clientId: parsed.data.clientId,
      projectId: parsed.data.projectId,
      startDate: parsed.data.startDate,
      startTime: parsed.data.startTime,
      endDate: parsed.data.endDate,
      endTime: parsed.data.endTime,
      description: parsed.data.description,
      billable: parsed.data.billable,
      hourlyRateCents: parsed.data.hourlyRate,
    },
  };
}

export async function createTimeEntryAction(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const extracted = extractFormPayload(formData);
  if (!extracted.ok) {
    return extracted.state;
  }

  try {
    const created = await createTimeEntry(extracted.data);
    revalidateTimesheetPaths();
    return {
      status: "success",
      message: `Apontamento de ${formatMinutesAsDuration(created.durationMinutes)} registrado em ${created.workDate}.`,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao registrar apontamento.", error);
    return {
      status: "error",
      message: "Não foi possível registrar o apontamento. Tente novamente.",
    };
  }
}

export async function updateTimeEntryAction(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const entryId = String(formData.get("entryId") ?? "");
  const extracted = extractFormPayload(formData);
  if (!extracted.ok) {
    return extracted.state;
  }

  try {
    const updated = await updateTimeEntry(entryId, extracted.data);
    revalidateTimesheetPaths();
    return {
      status: "success",
      message: `Apontamento atualizado (${formatMinutesAsDuration(updated.durationMinutes)} em ${updated.workDate}).`,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao atualizar apontamento.", error);
    return {
      status: "error",
      message: "Não foi possível atualizar o apontamento. Tente novamente.",
    };
  }
}

export async function deleteTimeEntryAction(
  _previousState: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const entryId = String(formData.get("entryId") ?? "");

  try {
    await deleteTimeEntry(entryId);
    revalidateTimesheetPaths();
    return {
      status: "success",
      message: "Apontamento excluído com sucesso.",
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao excluir apontamento.", error);
    return {
      status: "error",
      message: "Não foi possível excluir o apontamento.",
    };
  }
}
