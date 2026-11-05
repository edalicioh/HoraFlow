"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "@/lib/errors";
import { evaluateRequestPolicy } from "@/lib/request-policy";
import {
  confirmImportBatch,
  createImportBatchFromFile,
  previewImportBatch,
} from "./service";
import type {
  DateFormatOption,
  DurationFormatOption,
  ImportConfirmationOptions,
} from "./types";
import type { ImportActionState } from "./action-state";

async function assertMutationAllowed(): Promise<ImportActionState | null> {
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

function revalidateImportPaths() {
  revalidatePath("/import");
  revalidatePath("/timesheet");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/billing");
}

function handleActionError(error: unknown, fallbackMessage: string): ImportActionState {
  if (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof (error as { digest: string }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }

  if (error instanceof ValidationError) {
    return {
      status: "error",
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  if (error instanceof ConflictError || error instanceof NotFoundError || error instanceof DomainError) {
    return {
      status: "error",
      message: error.message,
    };
  }

  console.error("[import/actions] Erro não tratado:", error);
  return {
    status: "error",
    message: fallbackMessage,
  };
}

export async function uploadImportFileAction(
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const denied = await assertMutationAllowed();
  if (denied) return denied;

  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return {
      status: "error",
      message: "Selecione um arquivo CSV ou XLSX para enviar.",
      fieldErrors: { file: ["Selecione um arquivo válido."] },
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const result = await createImportBatchFromFile({
      fileName: file.name,
      fileBuffer,
    });

    redirect(`/import?batchId=${result.batchId}`);
  } catch (error) {
    return handleActionError(error, "Não foi possível carregar o arquivo.");
  }
}

export async function updateImportMappingAction(
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const denied = await assertMutationAllowed();
  if (denied) return denied;

  const batchId = String(formData.get("batchId") ?? "").trim();
  const dateColumn = String(formData.get("dateColumn") ?? "").trim();
  const durationColumn = String(formData.get("durationColumn") ?? "").trim();
  const descriptionColumn = formData.get("descriptionColumn")
    ? String(formData.get("descriptionColumn")).trim()
    : null;
  const billableColumn = formData.get("billableColumn")
    ? String(formData.get("billableColumn")).trim()
    : null;
  const dateFormat = (String(formData.get("dateFormat") ?? "auto") as DateFormatOption);
  const durationFormat = (String(formData.get("durationFormat") ?? "auto") as DurationFormatOption);
  const defaultClientId = String(formData.get("defaultClientId") ?? "").trim();
  const defaultProjectId = String(formData.get("defaultProjectId") ?? "").trim();
  const sheetName = formData.get("sheetName")
    ? String(formData.get("sheetName")).trim()
    : null;

  try {
    await previewImportBatch({
      batchId,
      mapping: {
        dateColumn,
        durationColumn,
        descriptionColumn,
        billableColumn,
        dateFormat,
        durationFormat,
        defaultClientId,
        defaultProjectId,
        sheetName,
      },
    });

    redirect(`/import?batchId=${batchId}`);
  } catch (error) {
    return handleActionError(error, "Não foi possível processar o mapeamento.");
  }
}

export async function confirmImportAction(
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const denied = await assertMutationAllowed();
  if (denied) return denied;

  const batchId = String(formData.get("batchId") ?? "").trim();
  const skipInvalidRows = formData.get("skipInvalidRows") === "true" || formData.get("skipInvalidRows") === "on";
  const importDuplicates = formData.get("importDuplicates") === "true" || formData.get("importDuplicates") === "on";

  try {
    const options: ImportConfirmationOptions = {
      skipInvalidRows,
      importDuplicates,
    };

    const confirmed = await confirmImportBatch({
      batchId,
      options,
    });

    revalidateImportPaths();

    return {
      status: "success",
      message: `Importação concluída com sucesso! ${confirmed.importedCount} apontamento(s) importado(s) (${confirmed.totalMinutes} minutos).`,
      batchId: confirmed.batchId,
    };
  } catch (error) {
    return handleActionError(error, "Não foi possível confirmar a importação.");
  }
}
