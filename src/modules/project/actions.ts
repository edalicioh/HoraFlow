"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { evaluateRequestPolicy } from "@/lib/request-policy";
import type { ProjectActionState } from "@/modules/project/action-state";
import { projectFormSchema } from "@/modules/project/schema";
import {
  createProject,
  deleteProject,
  setProjectActive,
  updateProject,
} from "@/modules/project/service";

async function assertAuthorizedAction(): Promise<ProjectActionState | null> {
  const requestHeaders = await headers();
  const policy = evaluateRequestPolicy({
    method: "POST",
    headers: requestHeaders,
  });

  if (!policy.allowed) {
    console.warn(
      `[request-policy] Server Action de projetos rejeitada (${policy.reason}).`,
    );

    return {
      status: "error",
      message: "Solicitação não autorizada.",
    };
  }

  return null;
}

function revalidateCatalogPaths(clientId?: string) {
  revalidatePath("/projects");
  revalidatePath("/clients");
  if (clientId) {
    revalidatePath(`/clients/${clientId}`);
  }
}

export async function createProjectAction(
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const parsed = projectFormSchema.safeParse({
    clientId: String(formData.get("clientId") ?? ""),
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
    const created = await createProject({
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      description: parsed.data.description,
      hourlyRateCents: parsed.data.hourlyRate,
    });
    revalidateCatalogPaths(created.clientId);
    return {
      status: "success",
      message: `Projeto "${created.name}" criado com sucesso.`,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao criar projeto.", error);
    return {
      status: "error",
      message: "Não foi possível criar o projeto. Tente novamente.",
    };
  }
}

export async function updateProjectAction(
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const projectId = String(formData.get("projectId") ?? "");

  const parsed = projectFormSchema.safeParse({
    clientId: String(formData.get("clientId") ?? ""),
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
    const updated = await updateProject(projectId, {
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      description: parsed.data.description,
      hourlyRateCents: parsed.data.hourlyRate,
    });
    revalidateCatalogPaths(updated.clientId);
    return {
      status: "success",
      message: `Projeto "${updated.name}" atualizado com sucesso.`,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao atualizar projeto.", error);
    return {
      status: "error",
      message: "Não foi possível atualizar o projeto. Tente novamente.",
    };
  }
}

export async function toggleProjectActiveAction(
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const projectId = String(formData.get("projectId") ?? "");
  const nextActiveRaw = String(formData.get("nextActive") ?? "");

  if (nextActiveRaw !== "true" && nextActiveRaw !== "false") {
    return {
      status: "error",
      message: "Status de ativação inválido.",
    };
  }

  const nextActive = nextActiveRaw === "true";

  try {
    const updated = await setProjectActive(projectId, nextActive);
    revalidateCatalogPaths(updated.clientId);
    return {
      status: "success",
      message: updated.active
        ? `Projeto "${updated.name}" reativado.`
        : `Projeto "${updated.name}" desativado. O histórico permanece preservado.`,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao alterar status do projeto.", error);
    return {
      status: "error",
      message: "Não foi possível alterar o status do projeto.",
    };
  }
}

export async function deleteProjectAction(
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const unauthorized = await assertAuthorizedAction();
  if (unauthorized) {
    return unauthorized;
  }

  const projectId = String(formData.get("projectId") ?? "");

  try {
    await deleteProject(projectId);
    revalidateCatalogPaths();
    return {
      status: "success",
      message: "Projeto excluído com sucesso.",
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error("Falha ao excluir projeto.", error);
    return {
      status: "error",
      message: "Não foi possível excluir o projeto.",
    };
  }
}
