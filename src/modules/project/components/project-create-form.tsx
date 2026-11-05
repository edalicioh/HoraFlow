"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsAsBRL } from "@/lib/money";
import { initialProjectActionState } from "@/modules/project/action-state";
import { createProjectAction } from "@/modules/project/actions";
import {
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
} from "@/modules/project/schema";

type SelectableClient = {
  id: string;
  name: string;
  active: boolean;
  hourlyRateCents: number | null;
};

type ProjectCreateFormProps = {
  clients: SelectableClient[];
  defaultHourlyRateCents: number;
  defaultClientId?: string;
};

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = pending || Boolean(disabled);

  return (
    <Button type="submit" disabled={isDisabled} aria-disabled={isDisabled}>
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <Plus aria-hidden="true" />
      )}
      {pending ? "Salvando..." : "Criar projeto"}
    </Button>
  );
}

export function ProjectCreateForm({
  clients,
  defaultHourlyRateCents,
  defaultClientId = "",
}: ProjectCreateFormProps) {
  const [state, formAction] = useActionState(
    createProjectAction,
    initialProjectActionState,
  );

  const activeClients = clients.filter((client) => client.active);
  const clientError = state.fieldErrors?.clientId?.[0];
  const nameError = state.fieldErrors?.name?.[0];
  const rateError = state.fieldErrors?.hourlyRate?.[0];
  const descriptionError = state.fieldErrors?.description?.[0];

  const initialClientId =
    defaultClientId &&
    activeClients.some((client) => client.id === defaultClientId)
      ? defaultClientId
      : (activeClients[0]?.id ?? "");

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === "success" && state.message ? (
        <Alert variant="success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription className="text-foreground">
            {state.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === "error" && state.message ? (
        <Alert variant="destructive">
          <AlertDescription className="text-destructive">
            {state.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {activeClients.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
          <p className="font-medium">
            Nenhum cliente ativo disponível para vincular projetos.
          </p>
          <p className="mt-1 text-muted-foreground">
            Cadastre ou reative um cliente antes de criar um novo projeto.
          </p>
          <div className="mt-3">
            <Link
              href="/clients"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ir para clientes
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="project-create-client">Cliente vinculado</Label>
          <Select
            id="project-create-client"
            name="clientId"
            defaultValue={initialClientId}
            disabled={activeClients.length === 0}
            aria-invalid={clientError ? true : undefined}
            aria-describedby={
              clientError
                ? "project-create-client-error project-create-client-help"
                : "project-create-client-help"
            }
          >
            {activeClients.length === 0 ? (
              <option value="">Selecione um cliente ativo</option>
            ) : null}
            {activeClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {client.hourlyRateCents !== null
                  ? ` (${formatCentsAsBRL(client.hourlyRateCents)}/h)`
                  : " (usa global)"}
              </option>
            ))}
          </Select>
          <p
            id="project-create-client-help"
            className="text-xs text-muted-foreground"
          >
            Obrigatório. Apenas clientes ativos recebem novos projetos.
          </p>
          {clientError ? (
            <p
              id="project-create-client-error"
              className="text-xs text-destructive"
            >
              {clientError}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="project-create-name">Nome do projeto</Label>
          <Input
            id="project-create-name"
            name="name"
            placeholder="Ex.: Portal do Cliente v2"
            maxLength={MAX_PROJECT_NAME_LENGTH}
            autoComplete="off"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={
              nameError
                ? "project-create-name-error project-create-name-help"
                : "project-create-name-help"
            }
          />
          <p
            id="project-create-name-help"
            className="text-xs text-muted-foreground"
          >
            Obrigatório, até {MAX_PROJECT_NAME_LENGTH} caracteres.
          </p>
          {nameError ? (
            <p
              id="project-create-name-error"
              className="text-xs text-destructive"
            >
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="project-create-rate">
            Tarifa própria do projeto (R$/h)
          </Label>
          <Input
            id="project-create-rate"
            name="hourlyRate"
            placeholder="Em branco herda cliente ou global"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={rateError ? true : undefined}
            aria-describedby={
              rateError
                ? "project-create-rate-error project-create-rate-help"
                : "project-create-rate-help"
            }
          />
          <p
            id="project-create-rate-help"
            className="text-xs text-muted-foreground"
          >
            Prioridade: projeto → cliente → global (
            {formatCentsAsBRL(defaultHourlyRateCents)}/h). Informe 0,00 para
            tarifa zero sem fallback.
          </p>
          {rateError ? (
            <p
              id="project-create-rate-error"
              className="text-xs text-destructive"
            >
              {rateError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="project-create-description">Descrição (opcional)</Label>
        <Textarea
          id="project-create-description"
          name="description"
          placeholder="Escopo, centro de custo ou observações do projeto."
          maxLength={MAX_PROJECT_DESCRIPTION_LENGTH}
          rows={2}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={
            descriptionError
              ? "project-create-description-error project-create-description-help"
              : "project-create-description-help"
          }
        />
        <p
          id="project-create-description-help"
          className="text-xs text-muted-foreground"
        >
          Opcional, até {MAX_PROJECT_DESCRIPTION_LENGTH} caracteres.
        </p>
        {descriptionError ? (
          <p
            id="project-create-description-error"
            className="text-xs text-destructive"
          >
            {descriptionError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={activeClients.length === 0} />
      </div>
    </form>
  );
}
