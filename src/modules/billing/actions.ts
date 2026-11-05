"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { evaluateRequestPolicy } from "@/lib/request-policy";
import type { BillingActionState } from "./action-state";
import { closeBillingPeriod, reopenBillingPeriod } from "./service";

async function assertMutationAllowed(): Promise<BillingActionState | null> {
  const requestHeaders = await headers();
  const decision = evaluateRequestPolicy({
    headers: requestHeaders,
    method: "POST",
  });

  if (!decision.allowed) {
    return {
      status: "error",
      message: "Origem ou host da requisição não autorizado.",
    };
  }

  return null;
}

function revalidateFinancialRoutes(periodId?: string, clientId?: string) {
  revalidatePath("/billing");
  if (periodId) {
    revalidatePath(`/billing/${periodId}`);
  }
  revalidatePath("/timesheet");
  revalidatePath("/clients");
  if (clientId) {
    revalidatePath(`/clients/${clientId}`);
  }
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

function handleActionError(
  error: unknown,
  fallbackMessage: string,
): BillingActionState {
  if (error instanceof ValidationError) {
    return {
      status: "error",
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  if (error instanceof ConflictError || error instanceof NotFoundError) {
    return {
      status: "error",
      message: error.message,
    };
  }

  return {
    status: "error",
    message: fallbackMessage,
  };
}

export async function closeBillingPeriodAction(
  _prevState: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const denied = await assertMutationAllowed();
  if (denied) return denied;

  const clientId = String(formData.get("clientId") ?? "").trim();
  const yearRaw = String(formData.get("year") ?? "").trim();
  const monthRaw = String(formData.get("month") ?? "").trim();
  const previewSignatureRaw = formData.get("previewSignature");
  const previewSignature =
    typeof previewSignatureRaw === "string" && previewSignatureRaw.trim() !== ""
      ? previewSignatureRaw.trim()
      : null;

  try {
    const closed = await closeBillingPeriod({
      clientId,
      year: Number(yearRaw),
      month: Number(monthRaw),
      previewSignature,
      origin: "local",
    });

    revalidateFinancialRoutes(closed.id, closed.clientId);

    return {
      status: "success",
      message: `Competência ${closed.competenceLabel} de ${closed.displayClientName} fechada com sucesso (revisão #${closed.revision}).`,
      recordId: closed.id,
    };
  } catch (error) {
    return handleActionError(
      error,
      "Não foi possível fechar a competência selecionada.",
    );
  }
}

export async function reopenBillingPeriodAction(
  _prevState: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const denied = await assertMutationAllowed();
  if (denied) return denied;

  const billingPeriodId = String(formData.get("billingPeriodId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "");

  try {
    const reopened = await reopenBillingPeriod({
      billingPeriodId,
      reason,
      origin: "local",
    });

    revalidateFinancialRoutes(reopened.id, reopened.clientId);

    return {
      status: "success",
      message: `Competência ${reopened.competenceLabel} reaberta com sucesso. Os apontamentos retornaram para rascunho.`,
      recordId: reopened.id,
    };
  } catch (error) {
    return handleActionError(
      error,
      "Não foi possível reabrir a competência selecionada.",
    );
  }
}
