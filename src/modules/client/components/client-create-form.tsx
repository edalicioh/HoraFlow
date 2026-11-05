"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsAsBRL } from "@/lib/money";
import { initialClientActionState } from "@/modules/client/action-state";
import { createClientAction } from "@/modules/client/actions";
import {
  MAX_CLIENT_DESCRIPTION_LENGTH,
  MAX_CLIENT_NAME_LENGTH,
} from "@/modules/client/schema";

type ClientCreateFormProps = {
  defaultHourlyRateCents: number;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <Plus aria-hidden="true" />
      )}
      {pending ? "Salvando..." : "Criar cliente"}
    </Button>
  );
}

export function ClientCreateForm({
  defaultHourlyRateCents,
}: ClientCreateFormProps) {
  const [state, formAction] = useActionState(
    createClientAction,
    initialClientActionState,
  );

  const nameError = state.fieldErrors?.name?.[0];
  const rateError = state.fieldErrors?.hourlyRate?.[0];
  const descriptionError = state.fieldErrors?.description?.[0];

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="client-create-name">Nome do cliente</Label>
          <Input
            id="client-create-name"
            name="name"
            placeholder="Ex.: Acme Tecnologia"
            maxLength={MAX_CLIENT_NAME_LENGTH}
            autoComplete="off"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={
              nameError
                ? "client-create-name-error client-create-name-help"
                : "client-create-name-help"
            }
          />
          <p
            id="client-create-name-help"
            className="text-xs text-muted-foreground"
          >
            Obrigatório, até {MAX_CLIENT_NAME_LENGTH} caracteres.
          </p>
          {nameError ? (
            <p
              id="client-create-name-error"
              className="text-xs text-destructive"
            >
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="client-create-rate">
            Tarifa padrão do cliente (R$/h)
          </Label>
          <Input
            id="client-create-rate"
            name="hourlyRate"
            placeholder="Em branco usa a tarifa global"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={rateError ? true : undefined}
            aria-describedby={
              rateError
                ? "client-create-rate-error client-create-rate-help"
                : "client-create-rate-help"
            }
          />
          <p
            id="client-create-rate-help"
            className="text-xs text-muted-foreground"
          >
            Opcional. Se vazio, aplica a tarifa global (
            {formatCentsAsBRL(defaultHourlyRateCents)}/h). Informe 0,00 para
            tarifa zero sem fallback.
          </p>
          {rateError ? (
            <p
              id="client-create-rate-error"
              className="text-xs text-destructive"
            >
              {rateError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="client-create-description">Descrição (opcional)</Label>
        <Textarea
          id="client-create-description"
          name="description"
          placeholder="Contexto comercial, contrato ou observações do cliente."
          maxLength={MAX_CLIENT_DESCRIPTION_LENGTH}
          rows={2}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={
            descriptionError
              ? "client-create-description-error client-create-description-help"
              : "client-create-description-help"
          }
        />
        <p
          id="client-create-description-help"
          className="text-xs text-muted-foreground"
        >
          Opcional, até {MAX_CLIENT_DESCRIPTION_LENGTH} caracteres.
        </p>
        {descriptionError ? (
          <p
            id="client-create-description-error"
            className="text-xs text-destructive"
          >
            {descriptionError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
      </div>
    </form>
  );
}
