"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { evaluateRequestPolicy } from "@/lib/request-policy";
import type { ClientActionState } from "@/modules/client/action-state";
import { clientFormSchema } from "@/modules/client/schema";
import {
  createClient,
  deleteClient,
  setClientActive,
  updateClient,
} from "@/modules/client/service";

async function assertAuthorizedAction(): Promise<ClientActionState | null> {
  const requestHeaders = await headers();
  const policy = evaluateRequestPolicy({
    method: "POST",
    headers: requestHeaders,
  });

  if (!policy.allowed) {
    console.warn(
      `[request-policy] Server Action de clientes rejeitada (${policy.reason}).`,
    );

    return {
      status: "error",
      message: "Solicitação não autorizada.",
    };
  }

  return null;
}

function revalidateCatalogPaths(clientId?: string) {
  revalidatePath("/clients");
  revalidatePath("/projects");
  if (clientId) {
    revalidatePath(`/clients/${clientId}`);
  }
}

export async function createClientAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const parsed = clientFormSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    hourlyRate: String(formData.get("hourlyRate") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    const created = await createClient({
      name: parsed.data.name,
      description: parsed.data.description,
      hourlyRateCents: parsed.data.hourlyRate,
    });
    revalidateCatalogPaths(created.id);
    return {
      status: "success",
      message: `Cliente "${created.name}" criado com sucesso.`,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao criar cliente.", error);
    return {
      status: "error",
      message: "Não foi possível criar o cliente. Tente novamente.",
    };
  }
}

export async function updateClientAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const clientId = String(formData.get("clientId") ?? "");

  const parsed = clientFormSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    hourlyRate: String(formData.get("hourlyRate") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    const updated = await updateClient(clientId, {
      name: parsed.data.name,
      description: parsed.data.description,
      hourlyRateCents: parsed.data.hourlyRate,
    });
    revalidateCatalogPaths(updated.id);
    return {
      status: "success",
      message: `Cliente "${updated.name}" atualizado com sucesso.`,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao atualizar cliente.", error);
    return {
      status: "error",
      message: "Não foi possível atualizar o cliente. Tente novamente.",
    };
  }
}

export async function toggleClientActiveAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const clientId = String(formData.get("clientId") ?? "");
  const nextActiveRaw = String(formData.get("nextActive") ?? "");

  if (nextActiveRaw !== "true" && nextActiveRaw !== "false") {
    return {
      status: "error",
      message: "Status de ativação inválido.",
    };
  }

  const nextActive = nextActiveRaw === "true";

  try {
    const updated = await setClientActive(clientId, nextActive);
    revalidateCatalogPaths(updated.id);
    return {
      status: "success",
      message: updated.active
        ? `Cliente "${updated.name}" reativado.`
        : `Cliente "${updated.name}" desativado. Seus projetos ficam inelegíveis para novos apontamentos, preservando o histórico.`,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao alterar status do cliente.", error);
    return {
      status: "error",
      message: "Não foi possível alterar o status do cliente.",
    };
  }
}

export async function deleteClientAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const clientId = String(formData.get("clientId") ?? "");

  try {
    await deleteClient(clientId);
    revalidateCatalogPaths();
    return {
      status: "success",
      message: "Cliente excluído com sucesso.",
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao excluir cliente.", error);
    return {
      status: "error",
      message: "Não foi possível excluir o cliente.",
    };
  }
}
