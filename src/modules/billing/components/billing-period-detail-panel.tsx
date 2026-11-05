"use client";

import { useActionState, useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMinutesAsDuration } from "@/lib/duration";
import { formatCentsAsBRL, formatCentsAsInput } from "@/lib/money";
import { initialPaymentActionState } from "@/modules/payment/action-state";
import {
  createPaymentAction,
  voidPaymentAction,
} from "@/modules/payment/actions";
import { PAYMENT_METHODS } from "@/modules/payment/schema";
import { initialBillingActionState } from "../action-state";
import { reopenBillingPeriodAction } from "../actions";
import {
  formatBillingPeriodStatusLabel,
  formatPaymentStatusLabel,
  type BillingPeriodDetail,
  type PaymentSummary,
} from "../types";

type BillingPeriodDetailPanelProps = {
  detail: BillingPeriodDetail;
  defaultPaidDate: string;
};

function generateClientUuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function PaymentRow({ payment }: { payment: PaymentSummary }) {
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [reason, setReason] = useState("");
  const [voidState, voidAction, isVoidPending] = useActionState(
    async (prev: typeof initialPaymentActionState, formData: FormData) => {
      const next = await voidPaymentAction(prev, formData);
      if (next.status === "success") {
        setConfirmingVoid(false);
        setReason("");
      }
      return next;
    },
    initialPaymentActionState,
  );
  const reasonId = useId();
  const isVoided = payment.voidedAt !== null;

  return (
    <div
      className={`rounded-lg border p-3.5 transition-colors ${
        isVoided
          ? "border-border/70 bg-surface-elevated/30 opacity-80"
          : "border-border bg-surface"
      }`}
      data-testid={`payment-row-${payment.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`font-mono text-sm font-semibold ${
                isVoided ? "line-through text-muted" : "text-foreground"
              }`}
            >
              {formatCentsAsBRL(payment.amountCents)}
            </span>
            <Badge variant={isVoided ? "secondary" : "default"}>
              {isVoided ? "Estornado" : "Ativo"}
            </Badge>
            <Badge variant="outline">Revisão #{payment.revision}</Badge>
            {payment.method ? (
              <Badge variant="secondary">{payment.method}</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            Data civil:{" "}
            <strong className="font-mono text-foreground">
              {payment.paidDate}
            </strong>
            {payment.note ? ` • Obs.: ${payment.note}` : ""}
          </p>
          {isVoided && payment.voidedAt ? (
            <p className="text-xs text-muted">
              Estornado em {payment.voidedAt.slice(0, 19).replace("T", " ")} UTC
            </p>
          ) : null}
        </div>

        {!isVoided ? (
          <div>
            {!confirmingVoid ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmingVoid(true)}
              >
                Estornar pagamento
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {confirmingVoid && !isVoided ? (
        <form
          action={voidAction}
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3"
        >
          <input type="hidden" name="paymentId" value={payment.id} />
          <p className="text-xs font-medium text-foreground">
            O estorno é lógico: preserva o registro histórico do pagamento de{" "}
            <strong>{formatCentsAsBRL(payment.amountCents)}</strong> e devolve o
            valor ao saldo em aberto.
          </p>

          {voidState.status === "error" && voidState.message ? (
            <Alert variant="destructive">
              <AlertDescription>{voidState.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor={reasonId}>Motivo do estorno</Label>
            <Input
              id={reasonId}
              name="reason"
              placeholder="Ex.: Lançamento em duplicidade ou ajuste de parcela"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
            {voidState.fieldErrors?.reason?.[0] ? (
              <p className="text-xs text-destructive">
                {voidState.fieldErrors.reason[0]}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingVoid(false)}
              disabled={isVoidPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={isVoidPending}
            >
              {isVoidPending ? "Estornando..." : "Confirmar estorno"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function BillingPeriodDetailPanel({
  detail,
  defaultPaidDate,
}: BillingPeriodDetailPanelProps) {
  const [showReopenBox, setShowReopenBox] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenState, reopenAction, isReopenPending] = useActionState(
    async (prev: typeof initialBillingActionState, formData: FormData) => {
      const next = await reopenBillingPeriodAction(prev, formData);
      if (next.status === "success") {
        setShowReopenBox(false);
        setReopenReason("");
      }
      return next;
    },
    initialBillingActionState,
  );

  const [amountInput, setAmountInput] = useState(() =>
    detail.balanceCents > 0 ? formatCentsAsInput(detail.balanceCents) : "",
  );
  const [prevBalanceCents, setPrevBalanceCents] = useState(detail.balanceCents);
  if (prevBalanceCents !== detail.balanceCents) {
    setPrevBalanceCents(detail.balanceCents);
    setAmountInput(
      detail.balanceCents > 0 ? formatCentsAsInput(detail.balanceCents) : "",
    );
  }
  const [paidDate, setPaidDate] = useState(defaultPaidDate);
  const [method, setMethod] = useState<string>("PIX");
  const [note, setNote] = useState("");
  const [operationId, setOperationId] = useState(() => generateClientUuid());

  const [paymentState, paymentAction, isPaymentPending] = useActionState(
    async (prev: typeof initialPaymentActionState, formData: FormData) => {
      const next = await createPaymentAction(prev, formData);
      if (next.status === "success") {
        setNote("");
        setOperationId(generateClientUuid());
      }
      return next;
    },
    initialPaymentActionState,
  );

  const amountId = useId();
  const paidDateId = useId();
  const methodId = useId();
  const noteId = useId();
  const reopenReasonId = useId();

  return (
    <div
      className="space-y-6"
      data-testid={`billing-detail-${detail.id}`}
    >
      {/* Cabeçalho do fechamento */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              {detail.displayClientName} — Competência {detail.competenceLabel}
            </h2>
            <Badge
              variant={
                detail.status === "CLOSED"
                  ? "default"
                  : detail.status === "REOPENED"
                    ? "secondary"
                    : "outline"
              }
            >
              {formatBillingPeriodStatusLabel(detail.status)}
            </Badge>
            <Badge
              variant={
                detail.paymentStatus === "PAID"
                  ? "default"
                  : detail.paymentStatus === "PARTIAL"
                    ? "secondary"
                    : "outline"
              }
            >
              {formatPaymentStatusLabel(detail.paymentStatus)}
            </Badge>
            <Badge variant="outline">Revisão #{detail.revision}</Badge>
          </div>
          <p className="text-xs text-muted">
            Snapshot do cliente no fechamento:{" "}
            <strong className="text-foreground">
              {detail.clientNameSnapshot ?? detail.clientName}
            </strong>
            {detail.closedAt
              ? ` • Fechado em ${detail.closedAt.slice(0, 19).replace("T", " ")} UTC`
              : ""}
            {detail.reopenedAt
              ? ` • Reaberto em ${detail.reopenedAt.slice(0, 19).replace("T", " ")} UTC`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs text-muted"
            title="A exportação de demonstrativos PDF e XLSX será conectada na Fase 4."
          >
            Exportação PDF / XLSX (Fase 4)
          </span>
          {detail.canReopen && !showReopenBox ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowReopenBox(true)}
            >
              Reabrir competência
            </Button>
          ) : null}
        </div>
      </div>

      {/* Cards de resumo financeiro da competência */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted">Horas fechadas</p>
          <p
            className="mt-1 font-mono text-xl font-semibold text-foreground"
            data-testid="detail-total-duration"
          >
            {formatMinutesAsDuration(detail.totalMinutes)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {detail.activeItemCount} item(ns) ativo(s) na revisão #
            {detail.revision}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted">Valor fechado</p>
          <p
            className="mt-1 font-mono text-xl font-semibold text-foreground"
            data-testid="detail-total-cents"
          >
            {formatCentsAsBRL(detail.totalCents)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Congelado na revisão #{detail.revision}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted">Total recebido</p>
          <p
            className="mt-1 font-mono text-xl font-semibold text-primary"
            data-testid="detail-paid-cents"
          >
            {formatCentsAsBRL(detail.paidCents)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {detail.activePaymentCount} pagamento(s) ativo(s)
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted">Saldo em aberto</p>
          <p
            className="mt-1 font-mono text-xl font-semibold text-primary"
            data-testid="detail-balance-cents"
          >
            {formatCentsAsBRL(detail.balanceCents)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {detail.status === "REOPENED"
              ? "Competência reaberta (sem dívida ativa)"
              : formatPaymentStatusLabel(detail.paymentStatus)}
          </p>
        </div>
      </div>

      {/* Explicação de bloqueio de reabertura ou formulário de reabertura */}
      {detail.status === "CLOSED" &&
      !detail.canReopen &&
      detail.reopenBlockedReason ? (
        <Alert variant="default">
          <AlertTitle>Reabertura bloqueada por pagamentos ativos</AlertTitle>
          <AlertDescription>{detail.reopenBlockedReason}</AlertDescription>
        </Alert>
      ) : null}

      {detail.status === "REOPENED" ? (
        <Alert variant="default">
          <AlertTitle>Competência reaberta</AlertTitle>
          <AlertDescription>
            Esta competência está reaberta. Os apontamentos da revisão #
            {detail.revision} voltaram para rascunho (`DRAFT`) e podem ser
            editados em Horas (`/timesheet`). Para refechar, gere uma nova
            prévia de fechamento acima.
          </AlertDescription>
        </Alert>
      ) : null}

      {reopenState.status === "success" && reopenState.message ? (
        <Alert variant="success">
          <AlertDescription>{reopenState.message}</AlertDescription>
        </Alert>
      ) : null}

      {showReopenBox && detail.canReopen ? (
        <form
          action={reopenAction}
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-4"
          data-testid="reopen-period-form"
        >
          <input type="hidden" name="billingPeriodId" value={detail.id} />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Confirmar reabertura da competência {detail.competenceLabel}
            </h3>
            <p className="mt-1 text-xs text-muted">
              Ao reabrir, os {detail.activeItemCount} item(ns) da revisão #
              {detail.revision} serão marcados como liberados (`releasedAt`
              preenchido, preservando o histórico da versão) e os apontamentos
              correspondentes voltarão ao status `DRAFT`.
            </p>
          </div>

          {reopenState.status === "error" && reopenState.message ? (
            <Alert variant="destructive">
              <AlertDescription>{reopenState.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor={reopenReasonId}>Motivo da reabertura</Label>
            <Textarea
              id={reopenReasonId}
              name="reason"
              placeholder="Descreva o motivo da reabertura (ex.: inclusão de horas complementares na competência)"
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              required
            />
            {reopenState.fieldErrors?.reason?.[0] ? (
              <p className="text-xs text-destructive">
                {reopenState.fieldErrors.reason[0]}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowReopenBox(false)}
              disabled={isReopenPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={isReopenPending}
            >
              {isReopenPending
                ? "Reabrindo competência..."
                : "Confirmar reabertura"}
            </Button>
          </div>
        </form>
      ) : null}

      {/* Seção de Recebimentos e Estornos */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Recebimentos e estornos
            </h3>
            <p className="text-xs text-muted">
              Registre recebimentos parciais ou totais. Não é permitido
              sobrepagamento acima do saldo em aberto.
            </p>
          </div>
          {detail.status === "CLOSED" && detail.balanceCents > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setAmountInput(formatCentsAsInput(detail.balanceCents))
              }
            >
              Preencher saldo total ({formatCentsAsBRL(detail.balanceCents)})
            </Button>
          ) : null}
        </div>

        {paymentState.status === "error" && paymentState.message ? (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível registrar o pagamento</AlertTitle>
            <AlertDescription>{paymentState.message}</AlertDescription>
          </Alert>
        ) : null}

        {paymentState.status === "success" && paymentState.message ? (
          <Alert variant="success">
            <AlertDescription>{paymentState.message}</AlertDescription>
          </Alert>
        ) : null}

        {detail.status === "CLOSED" && detail.balanceCents > 0 ? (
          <form
            action={paymentAction}
            className="grid gap-4 rounded-lg border border-border bg-surface-elevated/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
            data-testid="create-payment-form"
          >
            <input type="hidden" name="billingPeriodId" value={detail.id} />
            <input type="hidden" name="operationId" value={operationId} />

            <div className="space-y-1.5">
              <Label htmlFor={amountId}>Valor do pagamento (R$)</Label>
              <Input
                id={amountId}
                name="amount"
                placeholder="0,00"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                required
              />
              {paymentState.fieldErrors?.amount?.[0] ? (
                <p className="text-xs text-destructive">
                  {paymentState.fieldErrors.amount[0]}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={paidDateId}>Data do pagamento</Label>
              <Input
                id={paidDateId}
                name="paidDate"
                type="date"
                value={paidDate}
                onChange={(event) => setPaidDate(event.target.value)}
                required
              />
              {paymentState.fieldErrors?.paidDate?.[0] ? (
                <p className="text-xs text-destructive">
                  {paymentState.fieldErrors.paidDate[0]}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={methodId}>Forma de pagamento</Label>
              <Select
                id={methodId}
                name="method"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                required
              >
                {PAYMENT_METHODS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              {paymentState.fieldErrors?.method?.[0] ? (
                <p className="text-xs text-destructive">
                  {paymentState.fieldErrors.method[0]}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={noteId}>Observação do pagamento</Label>
              <Input
                id={noteId}
                name="note"
                placeholder="Opcional (ex.: 1ª parcela)"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              {paymentState.fieldErrors?.note?.[0] ? (
                <p className="text-xs text-destructive">
                  {paymentState.fieldErrors.note[0]}
                </p>
              ) : null}
            </div>

            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <Button type="submit" disabled={isPaymentPending}>
                {isPaymentPending
                  ? "Registrando pagamento..."
                  : "Registrar pagamento"}
              </Button>
            </div>
          </form>
        ) : null}

        {detail.payments.length === 0 ? (
          <p className="text-xs text-muted py-2">
            Nenhum pagamento registrado para esta competência até o momento.
          </p>
        ) : (
          <div className="space-y-2.5">
            {detail.payments.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </div>
        )}
      </div>

      {/* Itens congelados da versão atual */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Itens congelados da revisão atual (#{detail.revision})
          </h3>
          <p className="text-xs text-muted">
            Snapshots imutáveis de cliente, projeto, descrição, duração, tarifa
            e valor gravados no fechamento.
          </p>
        </div>

        {detail.activeItems.length === 0 ? (
          <p className="text-xs text-muted">
            Não há itens ativos vinculados a esta revisão (competência
            reaberta).
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-elevated/60 text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Cliente (snapshot)</th>
                  <th className="px-3 py-2 font-medium">Projeto (snapshot)</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 font-medium text-right">Duração</th>
                  <th className="px-3 py-2 font-medium text-right">Tarifa/h</th>
                  <th className="px-3 py-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.activeItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-mono text-foreground">
                      {item.workDate}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {item.clientName}
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
                    <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">
                      {formatCentsAsBRL(item.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detail.releasedItems.length > 0 ? (
          <div className="pt-2 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Histórico de itens liberados em revisões anteriores (
              {detail.releasedItems.length})
            </h4>
            <div className="overflow-x-auto rounded-lg border border-border/70 opacity-85">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface-elevated/40 text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Revisão</th>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Projeto</th>
                    <th className="px-3 py-2 font-medium">Descrição</th>
                    <th className="px-3 py-2 font-medium text-right">
                      Duração
                    </th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium">Liberado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detail.releasedItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-mono text-muted">
                        #{item.revision}
                      </td>
                      <td className="px-3 py-2 font-mono text-foreground">
                        {item.workDate}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {item.projectName}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {item.description || "Sem descrição"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {formatMinutesAsDuration(item.durationMinutes)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {formatCentsAsBRL(item.amountCents)}
                      </td>
                      <td className="px-3 py-2 font-mono text-muted">
                        {item.releasedAt
                          ? item.releasedAt.slice(0, 19).replace("T", " ")
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* Histórico de eventos de auditoria */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Histórico de auditoria financeira
          </h3>
          <p className="text-xs text-muted">
            Trilha auditável de fechamentos, reaberturas, recebimentos e
            estornos desta competência.
          </p>
        </div>

        {detail.auditLogs.length === 0 ? (
          <p className="text-xs text-muted">
            Nenhum evento de auditoria encontrado.
          </p>
        ) : (
          <div className="space-y-2" data-testid="billing-audit-log-list">
            {detail.auditLogs.map((log) => {
              const reason =
                typeof log.after?.reason === "string"
                  ? log.after.reason
                  : null;
              const revision =
                typeof log.after?.revision === "number"
                  ? log.after.revision
                  : null;

              return (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated/30 px-3.5 py-2.5 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{log.entity}</Badge>
                      <span className="font-semibold text-foreground">
                        {log.action}
                      </span>
                      {revision !== null ? (
                        <span className="font-mono text-muted">
                          (Revisão #{revision})
                        </span>
                      ) : null}
                    </div>
                    {reason ? (
                      <p className="text-muted">
                        Motivo: <span className="text-foreground">{reason}</span>
                      </p>
                    ) : null}
                  </div>
                  <span className="font-mono text-muted">
                    {log.createdAt.slice(0, 19).replace("T", " ")} UTC
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
