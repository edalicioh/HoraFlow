"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { evaluateRequestPolicy } from "@/lib/request-policy";
import type { PaymentActionState } from "./action-state";
import { createPayment, voidPayment } from "./service";

async function assertMutationAllowed(): Promise<PaymentActionState | null> {
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

function revalidatePaymentRoutes(billingPeriodId?: string) {
  revalidatePath("/billing");
  if (billingPeriodId) {
    revalidatePath(`/billing/${billingPeriodId}`);
  }
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

function handleActionError(
  error: unknown,
  fallbackMessage: string,
): PaymentActionState {
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

export async function createPaymentAction(
  _prevState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const denied = await assertMutationAllowed();
  if (denied) return denied;

  const billingPeriodId = String(formData.get("billingPeriodId") ?? "").trim();
  const amountBRL = String(formData.get("amount") ?? "");
  const paidDate = String(formData.get("paidDate") ?? "").trim();
  const method = String(formData.get("method") ?? "");
  const noteRaw = formData.get("note");
  const note = typeof noteRaw === "string" ? noteRaw : null;
  const operationIdRaw = formData.get("operationId");
  const operationId =
    typeof operationIdRaw === "string" && operationIdRaw.trim() !== ""
      ? operationIdRaw.trim()
      : null;

  try {
    const payment = await createPayment({
      billingPeriodId,
      amountBRL,
      paidDate,
      method,
      note,
      operationId,
      origin: "local",
    });

    revalidatePaymentRoutes(payment.billingPeriodId);

    return {
      status: "success",
      message: "Pagamento registrado com sucesso.",
      recordId: payment.id,
    };
  } catch (error) {
    return handleActionError(error, "Não foi possível registrar o pagamento.");
  }
}

export async function voidPaymentAction(
  _prevState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const denied = await assertMutationAllowed();
  if (denied) return denied;

  const paymentId = String(formData.get("paymentId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "");

  try {
    const voided = await voidPayment({
      paymentId,
      reason,
      origin: "local",
    });

    revalidatePaymentRoutes(voided.billingPeriodId);

    return {
      status: "success",
      message: "Pagamento estornado com sucesso.",
      recordId: voided.id,
    };
  } catch (error) {
    return handleActionError(error, "Não foi possível estornar o pagamento.");
  }
}
