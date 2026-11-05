"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus, CheckCircle2, Clock, Loader2, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addDaysToCivilDate, isValidLocalTimeHHMM } from "@/lib/datetime";
import {
  formatMinutesAsDuration,
  parseDurationToMinutes,
} from "@/lib/duration";
import {
  calculateTimeEntryAmountCents,
  formatCentsAsBRL,
  formatCentsAsInput,
  parseOptionalBRLToCents,
} from "@/lib/money";
import { formatRateSourceLabel, type RateSource } from "@/lib/rates";
import { initialTimeEntryActionState } from "@/modules/time-entry/action-state";
import {
  createTimeEntryAction,
  updateTimeEntryAction,
} from "@/modules/time-entry/actions";
import { MAX_TIME_ENTRY_DESCRIPTION_LENGTH } from "@/modules/time-entry/schema";
import type {
  TimeEntryModeValue,
  TimeEntrySummary,
} from "@/modules/time-entry/types";

export type TimesheetSelectableClient = {
  id: string;
  name: string;
  active: boolean;
};

export type TimesheetSelectableProject = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  active: boolean;
  clientActive: boolean;
  eligibleForTimeEntries: boolean;
  effectiveHourlyRateCents: number;
  effectiveRateSource: RateSource;
};

type TimeEntryFormProps = {
  clients: TimesheetSelectableClient[];
  projects: TimesheetSelectableProject[];
  defaultDate: string;
  timezone: string;
  entry?: TimeEntrySummary;
  onCancel?: () => void;
};

function SubmitButton({
  isEdit,
  disabled,
}: {
  isEdit: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || Boolean(disabled);

  return (
    <Button type="submit" disabled={isDisabled} aria-disabled={isDisabled}>
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : isEdit ? (
        <CheckCircle2 aria-hidden="true" />
      ) : (
        <Plus aria-hidden="true" />
      )}
      {pending
        ? "Salvando..."
        : isEdit
          ? "Salvar alterações"
          : "Registrar horas"}
    </Button>
  );
}

function estimateIntervalMinutes(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): number | null {
  if (
    !startDate ||
    !endDate ||
    !isValidLocalTimeHHMM(startTime) ||
    !isValidLocalTimeHHMM(endTime)
  ) {
    return null;
  }

  const [sY, sM, sD] = startDate.split("-").map(Number);
  const [eY, eM, eD] = endDate.split("-").map(Number);
  const [sH, sMin] = startTime.split(":").map(Number);
  const [eH, eMin] = endTime.split(":").map(Number);

  if (!sY || !sM || !sD || !eY || !eM || !eD) {
    return null;
  }

  const startMs = Date.UTC(sY, sM - 1, sD, sH ?? 0, sMin ?? 0);
  const endMs = Date.UTC(eY, eM - 1, eD, eH ?? 0, eMin ?? 0);
  const diffMinutes = Math.round((endMs - startMs) / 60_000);

  return diffMinutes > 0 ? diffMinutes : null;
}

export function TimeEntryForm({
  clients,
  projects,
  defaultDate,
  timezone,
  entry,
  onCancel,
}: TimeEntryFormProps) {
  const isEdit = Boolean(entry);
  const idPrefix = entry ? `edit-${entry.id}` : "create";

  const availableClients = clients.filter(
    (client) => client.active || (entry && client.id === entry.clientId),
  );

  const availableProjects = projects.filter(
    (project) =>
      project.eligibleForTimeEntries || (entry && project.id === entry.projectId),
  );

  const initialClientId =
    entry?.clientId ??
    availableProjects[0]?.clientId ??
    availableClients[0]?.id ??
    "";

  const initialProjectId =
    entry?.projectId ??
    availableProjects.find((p) => p.clientId === initialClientId)?.id ??
    "";

  const [selectedClientId, setSelectedClientId] = useState(initialClientId);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [mode, setMode] = useState<TimeEntryModeValue>(
    entry?.mode ?? "DURATION",
  );
  const [workDate, setWorkDate] = useState(entry?.workDate ?? defaultDate);
  const [durationText, setDurationText] = useState(
    entry ? formatMinutesAsDuration(entry.durationMinutes) : "01:00",
  );
  const [startDate, setStartDate] = useState(
    entry?.startLocalDate ?? entry?.workDate ?? defaultDate,
  );
  const [startTime, setStartTime] = useState(entry?.startLocalTime ?? "09:00");
  const [endDate, setEndDate] = useState(
    entry?.endLocalDate ?? entry?.workDate ?? defaultDate,
  );
  const [endTime, setEndTime] = useState(entry?.endLocalTime ?? "10:00");
  const [billable, setBillable] = useState(entry ? entry.billable : true);
  const [hourlyRateInput, setHourlyRateInput] = useState(
    entry ? formatCentsAsInput(entry.hourlyRateCents) : "",
  );

  const [state, formAction] = useActionState(
    isEdit ? updateTimeEntryAction : createTimeEntryAction,
    initialTimeEntryActionState,
  );

  const filteredProjects = availableProjects.filter(
    (project) => !selectedClientId || project.clientId === selectedClientId,
  );

  const selectedProject = availableProjects.find(
    (project) => project.id === selectedProjectId,
  );

  function handleClientChange(nextClientId: string) {
    setSelectedClientId(nextClientId);
    // Regra da Fase 2: trocar cliente limpa projeto incompatível
    const currentProjectStillCompatible = availableProjects.some(
      (project) =>
        project.id === selectedProjectId && project.clientId === nextClientId,
    );
    if (!currentProjectStillCompatible) {
      setSelectedProjectId("");
    }
  }

  function handleSetNextDay() {
    try {
      const nextDay = addDaysToCivilDate(startDate, 1);
      setEndDate(nextDay);
    } catch {
      // Se startDate ainda estiver incompleto, não altera
    }
  }

  // Cálculo informativo da prévia (servidor recalcula sempre ao salvar)
  const previewMinutes =
    mode === "DURATION"
      ? parseDurationToMinutes(durationText)
      : estimateIntervalMinutes(startDate, startTime, endDate, endTime);

  const parsedCustomRate = parseOptionalBRLToCents(hourlyRateInput);
  const previewRateCents =
    parsedCustomRate.valid && parsedCustomRate.cents !== null
      ? parsedCustomRate.cents
      : entry
        ? entry.hourlyRateCents
        : (selectedProject?.effectiveHourlyRateCents ?? 0);

  let previewAmountCents: number | null = null;
  if (previewMinutes && previewMinutes > 0) {
    try {
      previewAmountCents = calculateTimeEntryAmountCents({
        durationMinutes: previewMinutes,
        hourlyRateCents: previewRateCents,
        billable,
      });
    } catch {
      previewAmountCents = null;
    }
  }

  const projectError = state.fieldErrors?.projectId?.[0];
  const workDateError = state.fieldErrors?.workDate?.[0];
  const durationError =
    state.fieldErrors?.durationText?.[0] ??
    state.fieldErrors?.durationMinutes?.[0];
  const startDateError = state.fieldErrors?.startDate?.[0];
  const startTimeError = state.fieldErrors?.startTime?.[0];
  const endDateError = state.fieldErrors?.endDate?.[0];
  const endTimeError = state.fieldErrors?.endTime?.[0];
  const rateError =
    state.fieldErrors?.hourlyRate?.[0] ??
    state.fieldErrors?.hourlyRateCents?.[0];
  const descriptionError = state.fieldErrors?.description?.[0];

  if (!isEdit && availableProjects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
        <p className="font-medium">
          Nenhum projeto elegível disponível para lançar horas.
        </p>
        <p className="mt-1 text-muted-foreground">
          Cadastre um cliente ativo e um projeto ativo antes de registrar
          apontamentos.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/clients"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Gerenciar clientes
          </Link>
          <Link
            href="/projects"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Gerenciar projetos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onCancel) {
          event.stopPropagation();
          onCancel();
        }
      }}
      className="space-y-4"
      noValidate
    >
      {entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}
      <input type="hidden" name="mode" value={mode} />

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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Modalidade:
        </span>
        <Button
          type="button"
          size="sm"
          variant={mode === "DURATION" ? "default" : "outline"}
          aria-pressed={mode === "DURATION"}
          onClick={() => setMode("DURATION")}
        >
          <Clock aria-hidden="true" />
          Duração manual (HH:mm)
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "INTERVAL" ? "default" : "outline"}
          aria-pressed={mode === "INTERVAL"}
          onClick={() => setMode("INTERVAL")}
        >
          <CalendarPlus aria-hidden="true" />
          Início e término
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-client`}>Cliente do apontamento</Label>
          <Select
            id={`${idPrefix}-client`}
            name="clientId"
            value={selectedClientId}
            onChange={(event) => handleClientChange(event.target.value)}
          >
            <option value="">Selecione um cliente</option>
            {availableClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {!client.active ? " (inativo)" : ""}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Trocar o cliente filtra os projetos e limpa seleções incompatíveis.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-project`}>Projeto do apontamento</Label>
          <Select
            id={`${idPrefix}-project`}
            name="projectId"
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            aria-invalid={projectError ? true : undefined}
            aria-describedby={
              projectError
                ? `${idPrefix}-project-error ${idPrefix}-project-help`
                : `${idPrefix}-project-help`
            }
          >
            <option value="">Selecione um projeto</option>
            {filteredProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} (
                {formatCentsAsBRL(project.effectiveHourlyRateCents)}/h ·{" "}
                {formatRateSourceLabel(project.effectiveRateSource)})
              </option>
            ))}
          </Select>
          <p
            id={`${idPrefix}-project-help`}
            className="text-xs text-muted-foreground"
          >
            {selectedProject
              ? `Tarifa padrão resolvida: ${formatCentsAsBRL(selectedProject.effectiveHourlyRateCents)}/h (${formatRateSourceLabel(selectedProject.effectiveRateSource)}).`
              : "Escolha um projeto vinculado ao cliente selecionado."}
          </p>
          {projectError ? (
            <p
              id={`${idPrefix}-project-error`}
              className="text-xs text-destructive"
            >
              {projectError}
            </p>
          ) : null}
        </div>
      </div>

      {mode === "DURATION" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-workDate`}>Data trabalhada</Label>
            <Input
              id={`${idPrefix}-workDate`}
              name="workDate"
              type="date"
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value)}
              aria-invalid={workDateError ? true : undefined}
              aria-describedby={
                workDateError
                  ? `${idPrefix}-workDate-error ${idPrefix}-workDate-help`
                  : `${idPrefix}-workDate-help`
              }
            />
            <p
              id={`${idPrefix}-workDate-help`}
              className="text-xs text-muted-foreground"
            >
              Data civil (AAAA-MM-DD). Datas passadas e futuras são permitidas.
            </p>
            {workDateError ? (
              <p
                id={`${idPrefix}-workDate-error`}
                className="text-xs text-destructive"
              >
                {workDateError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-durationText`}>Duração (HH:mm)</Label>
            <Input
              id={`${idPrefix}-durationText`}
              name="durationText"
              value={durationText}
              onChange={(event) => setDurationText(event.target.value)}
              placeholder="Ex.: 05:30, 24:30 ou 100:00"
              autoComplete="off"
              aria-invalid={durationError ? true : undefined}
              aria-describedby={
                durationError
                  ? `${idPrefix}-duration-error ${idPrefix}-duration-help`
                  : `${idPrefix}-duration-help`
              }
            />
            <p
              id={`${idPrefix}-duration-help`}
              className="text-xs text-muted-foreground"
            >
              Use ao menos 2 dígitos para horas e 00–59 para minutos (sem limite
              de 24h).
            </p>
            {durationError ? (
              <p
                id={`${idPrefix}-duration-error`}
                className="text-xs text-destructive"
              >
                {durationError}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-startDate`}>Data de início</Label>
              <Input
                id={`${idPrefix}-startDate`}
                name="startDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                aria-invalid={startDateError ? true : undefined}
              />
              {startDateError ? (
                <p className="text-xs text-destructive">{startDateError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-startTime`}>
                Hora de início (HH:mm)
              </Label>
              <Input
                id={`${idPrefix}-startTime`}
                name="startTime"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                placeholder="08:00"
                autoComplete="off"
                aria-invalid={startTimeError ? true : undefined}
              />
              {startTimeError ? (
                <p className="text-xs text-destructive">{startTimeError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`${idPrefix}-endDate`}>Data de término</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={handleSetNextDay}
                >
                  Dia seguinte (+1d)
                </Button>
              </div>
              <Input
                id={`${idPrefix}-endDate`}
                name="endDate"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                aria-invalid={endDateError ? true : undefined}
              />
              {endDateError ? (
                <p className="text-xs text-destructive">{endDateError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-endTime`}>
                Hora de término (HH:mm)
              </Label>
              <Input
                id={`${idPrefix}-endTime`}
                name="endTime"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                placeholder="13:30"
                autoComplete="off"
                aria-invalid={endTimeError ? true : undefined}
              />
              {endTimeError ? (
                <p className="text-xs text-destructive">{endTimeError}</p>
              ) : null}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Fuso aplicado na conversão para UTC: <strong>{timezone}</strong>. A
            competência (`workDate`) será atribuída à data civil de início (
            {startDate || "—"}), sem inferência silenciosa de dia seguinte.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-hourlyRate`}>
            {isEdit
              ? "Tarifa horária deste apontamento (R$/h)"
              : "Tarifa horária explícita (R$/h, opcional)"}
          </Label>
          <Input
            id={`${idPrefix}-hourlyRate`}
            name="hourlyRate"
            value={hourlyRateInput}
            onChange={(event) => setHourlyRateInput(event.target.value)}
            placeholder={
              selectedProject
                ? `Em branco usa ${formatCentsAsBRL(selectedProject.effectiveHourlyRateCents)}/h`
                : "Em branco usa tarifa resolvida"
            }
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={rateError ? true : undefined}
            aria-describedby={
              rateError
                ? `${idPrefix}-rate-error ${idPrefix}-rate-help`
                : `${idPrefix}-rate-help`
            }
          />
          <p
            id={`${idPrefix}-rate-help`}
            className="text-xs text-muted-foreground"
          >
            {isEdit
              ? "Preserva o snapshot gravado por padrão; altere apenas se desejar atualizar a tarifa deste apontamento antes de faturar."
              : "Se em branco, congela automaticamente a tarifa resolvida (projeto → cliente → global)."}
          </p>
          {rateError ? (
            <p
              id={`${idPrefix}-rate-error`}
              className="text-xs text-destructive"
            >
              {rateError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col justify-center space-y-2 rounded-lg border bg-muted/20 p-3">
          <label
            htmlFor={`${idPrefix}-billable`}
            className="flex cursor-pointer items-center gap-2 text-sm font-medium"
          >
            <input
              id={`${idPrefix}-billable`}
              name="billable"
              type="checkbox"
              value="true"
              checked={billable}
              onChange={(event) => setBillable(event.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            Apontamento faturável
          </label>
          <p className="text-xs text-muted-foreground">
            Registros não faturáveis somam nas horas trabalhadas do dia e do
            mês, mas geram R$ 0,00 de cobrança.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>Descrição (opcional)</Label>
        <Textarea
          id={`${idPrefix}-description`}
          name="description"
          defaultValue={entry?.description ?? ""}
          placeholder="Atividades realizadas, entregáveis ou referência de demanda."
          maxLength={MAX_TIME_ENTRY_DESCRIPTION_LENGTH}
          rows={2}
          aria-invalid={descriptionError ? true : undefined}
        />
        {descriptionError ? (
          <p className="text-xs text-destructive">{descriptionError}</p>
        ) : null}
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-foreground">
            Prévia informativa:
          </span>
          <div className="flex flex-wrap items-center gap-4 text-foreground">
            <span>
              Duração:{" "}
              <strong>
                {previewMinutes
                  ? formatMinutesAsDuration(previewMinutes)
                  : "—"}
              </strong>
            </span>
            <span>
              Tarifa: <strong>{formatCentsAsBRL(previewRateCents)}/h</strong>
            </span>
            <span>
              Valor estimado:{" "}
              <strong>
                {previewAmountCents !== null
                  ? formatCentsAsBRL(previewAmountCents)
                  : "—"}
              </strong>
            </span>
          </div>
        </div>
        <p className="mt-1 text-muted-foreground">
          O servidor valida e recalcula duração, fuso e arredondamento half-up
          em centavos ao salvar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton isEdit={isEdit} disabled={!selectedProjectId} />
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
