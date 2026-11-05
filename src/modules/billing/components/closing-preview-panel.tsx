"use client";

import { useActionState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMinutesAsDuration } from "@/lib/duration";
import { formatCentsAsBRL } from "@/lib/money";
import { initialBillingActionState } from "../action-state";
import { closeBillingPeriodAction } from "../actions";
import type { MonthlyClosingPreview } from "../types";

type ClosingPreviewPanelProps = {
  preview: MonthlyClosingPreview;
};

export function ClosingPreviewPanel({ preview }: ClosingPreviewPanelProps) {
  const [state, formAction, isPending] = useActionState(
    closeBillingPeriodAction,
    initialBillingActionState,
  );

  return (
    <div
      className="rounded-xl border border-border bg-surface-elevated/40 p-5 space-y-4"
      data-testid="closing-preview-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">
              Prévia de fechamento: {preview.clientName} —{" "}
              {preview.competenceLabel}
            </h3>
            <Badge variant={preview.canClose ? "default" : "secondary"}>
              {preview.existingStatus === "REOPENED"
                ? `Refechamento (Revisão #${preview.nextRevision})`
                : `Revisão #${preview.nextRevision}`}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            Os valores abaixo refletem os snapshots gravados nos apontamentos
            faturáveis da competência e serão congelados no fechamento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
          <div>
            <span className="text-xs text-muted block">Itens elegíveis</span>
            <span className="font-mono font-semibold text-foreground">
              {preview.items.length}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted block">Total de horas</span>
            <span
              className="font-mono font-semibold text-foreground"
              data-testid="preview-total-duration"
            >
              {formatMinutesAsDuration(preview.totalMinutes)}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted block">Valor a fechar</span>
            <span
              className="font-mono font-semibold text-primary"
              data-testid="preview-total-amount"
            >
              {formatCentsAsBRL(preview.totalCents)}
            </span>
          </div>
        </div>
      </div>

      {state.status === "error" && state.message ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível confirmar o fechamento</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "success" && state.message ? (
        <Alert variant="success">
          <AlertTitle>Fechamento concluído</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {preview.blockingReasons.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Competência indisponível para fechamento</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-1">
              {preview.blockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {preview.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-surface-elevated/60 text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Projeto</th>
                <th className="px-3 py-2 font-medium">Descrição</th>
                <th className="px-3 py-2 font-medium text-right">Duração</th>
                <th className="px-3 py-2 font-medium text-right">Tarifa/h</th>
                <th className="px-3 py-2 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.items.map((item) => (
                <tr key={item.timeEntryId}>
                  <td className="px-3 py-2 font-mono text-foreground">
                    {item.workDate}
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">
                    {item.projectName}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {item.description || "Sem descrição"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-foreground">
                    {formatMinutesAsDuration(item.durationMinutes)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted">
                    {formatCentsAsBRL(item.hourlyRateCents)}/h
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-foreground">
                    {formatCentsAsBRL(item.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview.canClose ? (
        <form
          action={formAction}
          className="flex flex-wrap items-center justify-between gap-3 pt-2"
        >
          <input type="hidden" name="clientId" value={preview.clientId} />
          <input type="hidden" name="year" value={String(preview.year)} />
          <input type="hidden" name="month" value={String(preview.month)} />
          <input
            type="hidden"
            name="previewSignature"
            value={preview.previewSignature}
          />
          <p className="text-xs text-muted">
            Ao confirmar, os {preview.items.length} apontamento(s) serão
            congelados na revisão #{preview.nextRevision} e marcados como
            faturados.
          </p>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Confirmando fechamento..."
              : preview.existingStatus === "REOPENED"
                ? `Confirmar refechamento (Revisão #${preview.nextRevision})`
                : "Confirmar fechamento mensal"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
