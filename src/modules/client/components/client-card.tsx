"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Pencil,
  Power,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsAsBRL, formatCentsAsInput } from "@/lib/money";
import { initialClientActionState } from "@/modules/client/action-state";
import {
  deleteClientAction,
  toggleClientActiveAction,
  updateClientAction,
} from "@/modules/client/actions";
import {
  MAX_CLIENT_DESCRIPTION_LENGTH,
  MAX_CLIENT_NAME_LENGTH,
} from "@/modules/client/schema";
import type { ClientSummary } from "@/modules/client/types";

type ClientCardProps = {
  client: ClientSummary;
  showDetailLink?: boolean;
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

export function ClientCard({
  client,
  showDetailLink = true,
}: ClientCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const [updateState, updateFormAction] = useActionState(
    updateClientAction,
    initialClientActionState,
  );
  const [toggleState, toggleFormAction] = useActionState(
    toggleClientActiveAction,
    initialClientActionState,
  );
  const [deleteState, deleteFormAction] = useActionState(
    deleteClientAction,
    initialClientActionState,
  );

  const nameError = updateState.fieldErrors?.name?.[0];
  const rateError = updateState.fieldErrors?.hourlyRate?.[0];
  const descriptionError = updateState.fieldErrors?.description?.[0];

  const feedbackState =
    deleteState.status !== "idle"
      ? deleteState
      : toggleState.status !== "idle"
        ? toggleState
        : updateState;

  const formKey = `${client.id}:${client.name}:${client.description ?? ""}:${client.hourlyRateCents ?? "null"}`;

  return (
    <Card data-testid={`client-card-${client.id}`}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{client.name}</CardTitle>
            <Badge variant={client.active ? "default" : "secondary"}>
              {client.active ? "Ativo" : "Inativo"}
            </Badge>
            <Badge variant="outline">
              {client.effectiveRateSource === "client"
                ? "Origem da tarifa: Cliente"
                : "Origem da tarifa: Global"}
            </Badge>
          </div>
          <CardDescription>
            {client.description
              ? client.description
              : "Sem descrição cadastrada."}
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showDetailLink ? (
            <Link
              href={`/clients/${client.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ver detalhes
              <ArrowRight aria-hidden="true" />
            </Link>
          ) : null}

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
            <dt className="text-xs text-muted-foreground">Tarifa própria</dt>
            <dd className="font-medium">
              {client.hourlyRateCents !== null
                ? `${formatCentsAsBRL(client.hourlyRateCents)}/h`
                : "Não definida (usa global)"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Tarifa efetiva no cliente
            </dt>
            <dd className="font-medium">
              {formatCentsAsBRL(client.effectiveHourlyRateCents)}/h (
              {client.effectiveRateSource === "client" ? "Cliente" : "Global"})
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Projetos vinculados
            </dt>
            <dd className="font-medium">
              {client.projectCount}{" "}
              {client.projectCount === 1 ? "projeto" : "projetos"} (
              {client.activeProjectCount}{" "}
              {client.activeProjectCount === 1 ? "ativo" : "ativos"})
            </dd>
          </div>
        </dl>

        {!client.active ? (
          <p className="text-xs text-muted-foreground">
            Cliente inativo: novos projetos e novos apontamentos ficam
            bloqueados, mas o histórico e o status individual de cada projeto
            permanecem preservados.
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
            <input type="hidden" name="clientId" value={client.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`client-name-${client.id}`}>
                  Nome do cliente
                </Label>
                <Input
                  id={`client-name-${client.id}`}
                  name="name"
                  defaultValue={client.name}
                  maxLength={MAX_CLIENT_NAME_LENGTH}
                  autoComplete="off"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={
                    nameError ? `client-name-error-${client.id}` : undefined
                  }
                />
                {nameError ? (
                  <p
                    id={`client-name-error-${client.id}`}
                    className="text-xs text-destructive"
                  >
                    {nameError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`client-rate-${client.id}`}>
                  Tarifa padrão do cliente (R$/h)
                </Label>
                <Input
                  id={`client-rate-${client.id}`}
                  name="hourlyRate"
                  defaultValue={
                    client.hourlyRateCents !== null
                      ? formatCentsAsInput(client.hourlyRateCents)
                      : ""
                  }
                  placeholder="Em branco usa a tarifa global"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={rateError ? true : undefined}
                  aria-describedby={
                    rateError
                      ? `client-rate-error-${client.id} client-rate-help-${client.id}`
                      : `client-rate-help-${client.id}`
                  }
                />
                <p
                  id={`client-rate-help-${client.id}`}
                  className="text-xs text-muted-foreground"
                >
                  Alterar esta tarifa vale apenas para novos lançamentos e não
                  recalcula históricos.
                </p>
                {rateError ? (
                  <p
                    id={`client-rate-error-${client.id}`}
                    className="text-xs text-destructive"
                  >
                    {rateError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`client-description-${client.id}`}>
                Descrição (opcional)
              </Label>
              <Textarea
                id={`client-description-${client.id}`}
                name="description"
                defaultValue={client.description ?? ""}
                maxLength={MAX_CLIENT_DESCRIPTION_LENGTH}
                rows={2}
                aria-invalid={descriptionError ? true : undefined}
                aria-describedby={
                  descriptionError
                    ? `client-description-error-${client.id}`
                    : undefined
                }
              />
              {descriptionError ? (
                <p
                  id={`client-description-error-${client.id}`}
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
              <input type="hidden" name="clientId" value={client.id} />
              <input
                type="hidden"
                name="nextActive"
                value={client.active ? "false" : "true"}
              />
              <ActionSubmitButton
                icon={Power}
                variant={client.active ? "outline" : "secondary"}
                label={client.active ? "Desativar cliente" : "Reativar cliente"}
                pendingLabel="Atualizando..."
              />
            </form>

            <form action={deleteFormAction}>
              <input type="hidden" name="clientId" value={client.id} />
              <ActionSubmitButton
                icon={Trash2}
                variant="destructive"
                label="Excluir cliente"
                pendingLabel="Excluindo..."
              />
            </form>
          </div>

          {!client.canDelete ? (
            <p className="text-xs text-muted-foreground">
              Exclusão bloqueada por possuir projetos ou histórico; use
              desativar.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
