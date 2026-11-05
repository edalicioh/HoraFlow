"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Power,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsAsBRL, formatCentsAsInput } from "@/lib/money";
import { formatRateSourceLabel } from "@/lib/rates";
import { initialProjectActionState } from "@/modules/project/action-state";
import {
  deleteProjectAction,
  toggleProjectActiveAction,
  updateProjectAction,
} from "@/modules/project/actions";
import {
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
} from "@/modules/project/schema";
import type { ProjectSummary } from "@/modules/project/types";

type SelectableClient = {
  id: string;
  name: string;
  active: boolean;
};

type ProjectCardProps = {
  project: ProjectSummary;
  clients: SelectableClient[];
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending} aria-disabled={pending}>
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      {pending ? "Salvando..." : "Salvar alterações"}
    </Button>
  );
}

function ActionSubmitButton({
  label,
  pendingLabel,
  variant = "outline",
  icon: Icon,
}: {
  label: string;
  pendingLabel: string;
  variant?: "outline" | "secondary" | "destructive";
  icon: typeof Power;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <Icon aria-hidden="true" />
      )}
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function ProjectCard({ project, clients }: ProjectCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const [updateState, updateFormAction] = useActionState(
    updateProjectAction,
    initialProjectActionState,
  );
  const [toggleState, toggleFormAction] = useActionState(
    toggleProjectActiveAction,
    initialProjectActionState,
  );
  const [deleteState, deleteFormAction] = useActionState(
    deleteProjectAction,
    initialProjectActionState,
  );

  const clientError = updateState.fieldErrors?.clientId?.[0];
  const nameError = updateState.fieldErrors?.name?.[0];
  const rateError = updateState.fieldErrors?.hourlyRate?.[0];
  const descriptionError = updateState.fieldErrors?.description?.[0];

  const feedbackState =
    deleteState.status !== "idle"
      ? deleteState
      : toggleState.status !== "idle"
        ? toggleState
        : updateState;

  const rateSourceLabel = formatRateSourceLabel(project.effectiveRateSource);
  const formKey = `${project.id}:${project.clientId}:${project.name}:${project.description ?? ""}:${project.hourlyRateCents ?? "null"}`;

  const selectableClients = clients.filter(
    (client) => client.active || client.id === project.clientId,
  );

  return (
    <Card data-testid={`project-card-${project.id}`}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{project.name}</CardTitle>
            <Badge variant={project.active ? "default" : "secondary"}>
              {project.active ? "Ativo" : "Inativo"}
            </Badge>
            <Badge variant="outline">
              Origem da tarifa: {rateSourceLabel}
            </Badge>
            {project.eligibleForTimeEntries ? (
              <Badge variant="outline">Elegível para apontamentos</Badge>
            ) : !project.clientActive ? (
              <Badge variant="secondary">
                Inelegível: cliente inativo
              </Badge>
            ) : (
              <Badge variant="secondary">
                Inelegível: projeto inativo
              </Badge>
            )}
          </div>
          <CardDescription>
            Cliente:{" "}
            <Link
              href={`/clients/${project.clientId}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {project.clientName}
            </Link>
            {!project.clientActive ? " (cliente inativo)" : ""}
            {" · "}
            {project.description
              ? project.description
              : "Sem descrição cadastrada."}
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={isEditing}
            onClick={() => setIsEditing((prev) => !prev)}
          >
            {isEditing ? (
              <>
                <X aria-hidden="true" />
                Fechar edição
              </>
            ) : (
              <>
                <Pencil aria-hidden="true" />
                Editar
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {feedbackState.status === "success" && feedbackState.message ? (
          <Alert variant="success" role="status">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription className="text-foreground">
              {feedbackState.message}
            </AlertDescription>
          </Alert>
        ) : null}

        {feedbackState.status === "error" && feedbackState.message ? (
          <Alert variant="destructive">
            <AlertDescription className="text-destructive">
              {feedbackState.message}
            </AlertDescription>
          </Alert>
        ) : null}

        <dl className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">
              Tarifa própria do projeto
            </dt>
            <dd className="font-medium">
              {project.hourlyRateCents !== null
                ? `${formatCentsAsBRL(project.hourlyRateCents)}/h`
                : "Não definida (usa fallback)"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Tarifa efetiva aplicada
            </dt>
            <dd className="font-medium">
              {formatCentsAsBRL(project.effectiveHourlyRateCents)}/h (
              {rateSourceLabel})
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Apontamentos vinculados
            </dt>
            <dd className="font-medium">
              {project.timeEntryCount}{" "}
              {project.timeEntryCount === 1 ? "registro" : "registros"}
            </dd>
          </div>
        </dl>

        {!project.clientActive && project.active ? (
          <p className="text-xs text-muted-foreground">
            Este projeto permanece marcado como ativo, mas está bloqueado para
            novos apontamentos enquanto o cliente {project.clientName} estiver
            inativo.
          </p>
        ) : null}

        {isEditing ? (
          <form
            key={formKey}
            action={updateFormAction}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setIsEditing(false);
              }
            }}
            className="space-y-4 rounded-lg border bg-background p-4"
            noValidate
          >
            <input type="hidden" name="projectId" value={project.id} />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={`project-client-${project.id}`}>Cliente</Label>
                <Select
                  id={`project-client-${project.id}`}
                  name="clientId"
                  defaultValue={project.clientId}
                  aria-invalid={clientError ? true : undefined}
                  aria-describedby={
                    clientError
                      ? `project-client-error-${project.id} project-client-help-${project.id}`
                      : `project-client-help-${project.id}`
                  }
                >
                  {selectableClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                      {!client.active ? " (inativo)" : ""}
                    </option>
                  ))}
                </Select>
                <p
                  id={`project-client-help-${project.id}`}
                  className="text-xs text-muted-foreground"
                >
                  {project.canChangeClient
                    ? "Permitido alterar apenas enquanto não houver histórico."
                    : "Possui histórico: a troca de cliente é bloqueada pelo servidor."}
                </p>
                {clientError ? (
                  <p
                    id={`project-client-error-${project.id}`}
                    className="text-xs text-destructive"
                  >
                    {clientError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`project-name-${project.id}`}>
                  Nome do projeto
                </Label>
                <Input
                  id={`project-name-${project.id}`}
                  name="name"
                  defaultValue={project.name}
                  maxLength={MAX_PROJECT_NAME_LENGTH}
                  autoComplete="off"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={
                    nameError ? `project-name-error-${project.id}` : undefined
                  }
                />
                {nameError ? (
                  <p
                    id={`project-name-error-${project.id}`}
                    className="text-xs text-destructive"
                  >
                    {nameError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`project-rate-${project.id}`}>
                  Tarifa própria do projeto (R$/h)
                </Label>
                <Input
                  id={`project-rate-${project.id}`}
                  name="hourlyRate"
                  defaultValue={
                    project.hourlyRateCents !== null
                      ? formatCentsAsInput(project.hourlyRateCents)
                      : ""
                  }
                  placeholder="Em branco herda cliente ou global"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={rateError ? true : undefined}
                  aria-describedby={
                    rateError
                      ? `project-rate-error-${project.id} project-rate-help-${project.id}`
                      : `project-rate-help-${project.id}`
                  }
                />
                <p
                  id={`project-rate-help-${project.id}`}
                  className="text-xs text-muted-foreground"
                >
                  Vale para novos apontamentos; não recalcula históricos.
                </p>
                {rateError ? (
                  <p
                    id={`project-rate-error-${project.id}`}
                    className="text-xs text-destructive"
                  >
                    {rateError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`project-description-${project.id}`}>
                Descrição (opcional)
              </Label>
              <Textarea
                id={`project-description-${project.id}`}
                name="description"
                defaultValue={project.description ?? ""}
                maxLength={MAX_PROJECT_DESCRIPTION_LENGTH}
                rows={2}
                aria-invalid={descriptionError ? true : undefined}
                aria-describedby={
                  descriptionError
                    ? `project-description-error-${project.id}`
                    : undefined
                }
              />
              {descriptionError ? (
                <p
                  id={`project-description-error-${project.id}`}
                  className="text-xs text-destructive"
                >
                  {descriptionError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SaveButton />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <form action={toggleFormAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input
                type="hidden"
                name="nextActive"
                value={project.active ? "false" : "true"}
              />
              <ActionSubmitButton
                icon={Power}
                variant={project.active ? "outline" : "secondary"}
                label={
                  project.active ? "Desativar projeto" : "Reativar projeto"
                }
                pendingLabel="Atualizando..."
              />
            </form>

            <form action={deleteFormAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <ActionSubmitButton
                icon={Trash2}
                variant="destructive"
                label="Excluir projeto"
                pendingLabel="Excluindo..."
              />
            </form>
          </div>

          {!project.canDelete ? (
            <p className="text-xs text-muted-foreground">
              Exclusão bloqueada por possuir histórico; use desativar.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
