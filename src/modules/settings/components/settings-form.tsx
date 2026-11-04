"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  initialSettingsActionState,
} from "@/modules/settings/action-state";
import { updateSettingsAction } from "@/modules/settings/actions";
import { formatCentsAsInput } from "@/lib/money";

type SettingsFormProps = {
  settings: {
    timezone: string;
    currency: string;
    defaultHourlyRateCents: number;
  };
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      {pending ? "Salvando..." : "Salvar configurações"}
    </Button>
  );
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const [state, formAction] = useActionState(
    updateSettingsAction,
    initialSettingsActionState,
  );

  const timezoneError = state.fieldErrors?.timezone?.[0];
  const rateError = state.fieldErrors?.defaultHourlyRate?.[0];
  const formKey = `${settings.timezone}:${settings.defaultHourlyRateCents}`;

  return (
    <form key={formKey} action={formAction} className="space-y-6" noValidate>
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

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="timezone">Fuso horário</Label>
          <Input
            id="timezone"
            name="timezone"
            defaultValue={settings.timezone}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={timezoneError ? true : undefined}
            aria-describedby={
              timezoneError ? "timezone-error timezone-help" : "timezone-help"
            }
          />
          <p id="timezone-help" className="text-xs text-muted-foreground">
            Use um identificador IANA. O padrão inicial é America/Sao_Paulo.
          </p>
          {timezoneError ? (
            <p id="timezone-error" className="text-xs text-destructive">
              {timezoneError}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultHourlyRate">Tarifa global (R$)</Label>
          <Input
            id="defaultHourlyRate"
            name="defaultHourlyRate"
            defaultValue={formatCentsAsInput(settings.defaultHourlyRateCents)}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={rateError ? true : undefined}
            aria-describedby={
              rateError ? "rate-error rate-help" : "rate-help"
            }
          />
          <p id="rate-help" className="text-xs text-muted-foreground">
            Valor por hora em reais, com vírgula decimal. A mudança vale para
            novos apontamentos e não recalcula históricos.
          </p>
          {rateError ? (
            <p id="rate-error" className="text-xs text-destructive">
              {rateError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 px-4 py-3">
        <p className="text-sm font-medium">Moeda</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {settings.currency} — fixa no MVP. A política de troca de moeda com
          histórico ainda não foi aprovada e o campo não é editável.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        <p className="text-xs text-muted-foreground">
          Valores são validados no servidor antes de serem gravados.
        </p>
      </div>
    </form>
  );
}
