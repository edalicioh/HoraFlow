"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCivilDatePtBR } from "@/lib/datetime";
import { formatMinutesAsDuration } from "@/lib/duration";
import { formatCentsAsBRL } from "@/lib/money";
import { initialTimeEntryActionState } from "@/modules/time-entry/action-state";
import { deleteTimeEntryAction } from "@/modules/time-entry/actions";
import {
  TimeEntryForm,
  type TimesheetSelectableClient,
  type TimesheetSelectableProject,
} from "@/modules/time-entry/components/time-entry-form";
import type { TimeEntrySummary } from "@/modules/time-entry/types";

type TimeEntryCardProps = {
  entry: TimeEntrySummary;
  clients: TimesheetSelectableClient[];
  projects: TimesheetSelectableProject[];
  timezone: string;
};

function ConfirmDeleteButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant="destructive"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <Trash2 aria-hidden="true" />
      )}
      {pending ? "Excluindo..." : "Confirmar exclusão"}
    </Button>
  );
}

export function TimeEntryCard({
  entry,
  clients,
  projects,
  timezone,
}: TimeEntryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [deleteState, deleteFormAction] = useActionState(
    deleteTimeEntryAction,
    initialTimeEntryActionState,
  );

  return (
    <Card data-testid={`time-entry-card-${entry.id}`}>
      <CardContent className="space-y-4 pt-6">
        {deleteState.status === "success" && deleteState.message ? (
          <Alert variant="success" role="status">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription className="text-foreground">
              {deleteState.message}
            </AlertDescription>
          </Alert>
        ) : null}

        {deleteState.status === "error" && deleteState.message ? (
          <Alert variant="destructive">
            <AlertDescription className="text-destructive">
              {deleteState.message}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">
                {entry.projectName}
              </span>
              <span className="text-sm text-muted-foreground">
                ({entry.clientName})
              </span>
              <Badge variant="outline">
                {formatCivilDatePtBR(entry.workDate)}
              </Badge>
              <Badge variant={entry.billable ? "default" : "secondary"}>
                {entry.billable ? "Faturável" : "Não faturável"}
              </Badge>
              <Badge variant="outline">
                {entry.mode === "INTERVAL" && entry.intervalLabelPtBR
                  ? `Intervalo: ${entry.intervalLabelPtBR}`
                  : "Duração manual"}
              </Badge>
              {entry.status !== "DRAFT" || entry.hasActiveBillingItem ? (
                <Badge variant="secondary">
                  <Lock aria-hidden="true" className="mr-1 size-3" />
                  Faturado
                </Badge>
              ) : entry.isBillingPeriodClosed ? (
                <Badge variant="secondary">
                  <Lock aria-hidden="true" className="mr-1 size-3" />
                  Competência fechada
                </Badge>
              ) : (
                <Badge variant="outline">Rascunho</Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {entry.description
                ? entry.description
                : "Sem descrição informada."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:text-right">
            <div className="rounded-lg border bg-muted/30 px-3 py-1.5 text-sm">
              <div className="flex items-center gap-1.5 font-semibold">
                <Clock aria-hidden="true" className="size-3.5 text-primary" />
                {formatMinutesAsDuration(entry.durationMinutes)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatCentsAsBRL(entry.amountCents)} (
                {formatCentsAsBRL(entry.hourlyRateCents)}/h)
              </div>
            </div>

            {entry.canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-expanded={isEditing}
                  onClick={() => {
                    setIsEditing((prev) => !prev);
                    setConfirmingDelete(false);
                  }}
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

                {!confirmingDelete ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setConfirmingDelete(true);
                      setIsEditing(false);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    Excluir
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {confirmingDelete ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <span>
              Confirmar exclusão lógica deste apontamento de{" "}
              <strong>{formatMinutesAsDuration(entry.durationMinutes)}</strong>?
            </span>
            <div className="flex items-center gap-2">
              <form action={deleteFormAction}>
                <input type="hidden" name="entryId" value={entry.id} />
                <ConfirmDeleteButton />
              </form>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        {isEditing ? (
          <div className="rounded-lg border bg-background p-4">
            <TimeEntryForm
              clients={clients}
              projects={projects}
              defaultDate={entry.workDate}
              timezone={timezone}
              entry={entry}
              onCancel={() => setIsEditing(false)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
