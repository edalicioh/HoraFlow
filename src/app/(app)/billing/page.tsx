import Link from "next/link";
import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { formatInstantInTimeZone } from "@/lib/datetime";
import { formatMinutesAsDuration } from "@/lib/duration";
import { formatCentsAsBRL } from "@/lib/money";
import { BillingPeriodDetailPanel } from "@/modules/billing/components/billing-period-detail-panel";
import { ClosingPreviewPanel } from "@/modules/billing/components/closing-preview-panel";
import {
  computeBillingOverviewTotals,
  formatBillingPeriodStatusLabel,
  formatPaymentStatusLabel,
  getBillingPeriodDetail,
  listBillingPeriods,
  previewMonthlyClosing,
} from "@/modules/billing/service";
import type {
  BillingPeriodStatus,
  DerivedPaymentStatus,
  MonthlyClosingPreview,
} from "@/modules/billing/types";
import { listClients } from "@/modules/client/service";
import { getSettings } from "@/modules/settings/service";

export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type BillingPageProps = {
  searchParams: Promise<{
    previewClientId?: string;
    previewYear?: string;
    previewMonth?: string;
    filterClientId?: string;
    filterStatus?: string;
    filterPaymentStatus?: string;
    periodId?: string;
  }>;
};

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = await searchParams;
  const settings = await getSettings();
  const todayInZone = formatInstantInTimeZone(new Date(), settings.timezone);
  const [currentYearStr, currentMonthStr] = todayInZone.date.split("-");
  const currentYear = Number(currentYearStr);
  const currentMonth = Number(currentMonthStr);

  const { clients } = await listClients({ status: "all" });

  const previewClientId = params.previewClientId?.trim() ?? "";
  const previewYear = params.previewYear
    ? Number(params.previewYear)
    : currentYear;
  const previewMonth = params.previewMonth
    ? Number(params.previewMonth)
    : currentMonth;

  let preview: MonthlyClosingPreview | null = null;
  let previewError: string | null = null;

  if (previewClientId) {
    try {
      preview = await previewMonthlyClosing({
        clientId: previewClientId,
        year: previewYear,
        month: previewMonth,
      });
    } catch (error) {
      previewError =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a prévia de fechamento.";
    }
  }

  const filterStatus =
    params.filterStatus === "CLOSED" ||
    params.filterStatus === "REOPENED" ||
    params.filterStatus === "OPEN"
      ? (params.filterStatus as BillingPeriodStatus)
      : "ALL";

  const filterPaymentStatus =
    params.filterPaymentStatus === "UNPAID" ||
    params.filterPaymentStatus === "PARTIAL" ||
    params.filterPaymentStatus === "PAID" ||
    params.filterPaymentStatus === "NOT_APPLICABLE"
      ? (params.filterPaymentStatus as DerivedPaymentStatus)
      : "ALL";

  const periods = await listBillingPeriods({
    clientId: params.filterClientId?.trim() || undefined,
    status: filterStatus,
    paymentStatus: filterPaymentStatus,
  });

  const allPeriodsForTotals = await listBillingPeriods();
  const totals = computeBillingOverviewTotals(allPeriodsForTotals);

  const matchingPreviewPeriod = previewClientId
    ? periods.find(
        (p) =>
          p.clientId === previewClientId &&
          p.year === previewYear &&
          p.month === previewMonth,
      )
    : undefined;
  const firstPeriod = periods[0];
  const targetPeriodId =
    params.periodId?.trim() || matchingPreviewPeriod?.id || firstPeriod?.id;

  let selectedDetail = null;
  if (targetPeriodId) {
    try {
      selectedDetail = await getBillingPeriodDetail(targetPeriodId);
    } catch {
      selectedDetail = null;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faturamento"
        eyebrow="Financeiro"
        description="Fechamentos por cliente e competência, congelamento de snapshots, recebimentos parciais, estornos lógicos e reabertura auditada."
        actions={
          <Badge variant="outline">
            {totals.closedCount} competência(s) fechada(s)
          </Badge>
        }
      />

      {/* Resumo financeiro consolidado */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total faturado (fechado)</CardDescription>
            <CardTitle
              className="font-mono text-2xl"
              data-testid="overview-total-closed-cents"
            >
              {formatCentsAsBRL(totals.totalClosedCents)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted">
            {totals.closedCount} competência(s) fechada(s) •{" "}
            {formatMinutesAsDuration(totals.totalClosedMinutes)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total recebido</CardDescription>
            <CardTitle
              className="font-mono text-2xl text-primary"
              data-testid="overview-total-paid-cents"
            >
              {formatCentsAsBRL(totals.totalPaidCents)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted">
            Pagamentos ativos em competências fechadas
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saldo em aberto</CardDescription>
            <CardTitle
              className="font-mono text-2xl text-primary"
              data-testid="overview-open-balance-cents"
            >
              {formatCentsAsBRL(totals.totalOpenBalanceCents)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted">
            Pendente de recebimento nas competências fechadas
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Competências reabertas</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {totals.reopenedCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted">
            Não contabilizadas como dívida fechada ativa
          </CardContent>
        </Card>
      </div>

      {/* Gerador de prévia e fechamento mensal */}
      <Card>
        <CardHeader>
          <CardTitle>Fechamento mensal por competência</CardTitle>
          <CardDescription>
            Selecione o cliente, o mês e o ano para inspecionar os apontamentos
            faturáveis elegíveis antes de congelar o fechamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form
            method="GET"
            action="/billing"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end"
          >
            {params.periodId ? (
              <input type="hidden" name="periodId" value={params.periodId} />
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="previewClientId">Cliente para fechamento</Label>
              <Select
                id="previewClientId"
                name="previewClientId"
                defaultValue={previewClientId}
                required
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                    {!client.active ? " (Inativo)" : ""}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="previewMonth">Mês da competência</Label>
              <Select
                id="previewMonth"
                name="previewMonth"
                defaultValue={String(previewMonth)}
              >
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={String(index + 1)}>
                    {String(index + 1).padStart(2, "0")} — {name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="previewYear">Ano da competência</Label>
              <Input
                id="previewYear"
                name="previewYear"
                type="number"
                min={2000}
                max={2100}
                defaultValue={String(previewYear)}
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" className="w-full sm:w-auto">
                Gerar prévia de fechamento
              </Button>
              {previewClientId ? (
                <Link
                  href="/billing"
                  className="text-xs text-muted hover:text-foreground underline"
                >
                  Limpar
                </Link>
              ) : null}
            </div>
          </form>

          {previewError ? (
            <Alert variant="destructive">
              <AlertTitle>Erro ao gerar prévia</AlertTitle>
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          ) : null}

          {preview ? <ClosingPreviewPanel preview={preview} /> : null}
        </CardContent>
      </Card>

      {/* Lista de competências e painel de gestão */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Competências registradas</CardTitle>
              <CardDescription>
                Consulte a situação de cada fechamento, saldo devedor e
                selecione uma competência para gerenciar recebimentos, estornos
                ou reabertura.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            method="GET"
            action="/billing"
            className="grid gap-3 rounded-lg border border-border bg-surface-elevated/30 p-3.5 sm:grid-cols-2 lg:grid-cols-4 items-end"
          >
            <div className="space-y-1.5">
              <Label htmlFor="filterClientId">Filtrar por cliente</Label>
              <Select
                id="filterClientId"
                name="filterClientId"
                defaultValue={params.filterClientId ?? ""}
              >
                <option value="">Todos os clientes</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filterStatus">Filtrar por situação</Label>
              <Select
                id="filterStatus"
                name="filterStatus"
                defaultValue={filterStatus}
              >
                <option value="ALL">Todas as situações</option>
                <option value="CLOSED">Fechada</option>
                <option value="REOPENED">Reaberta</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filterPaymentStatus">Filtrar por pagamento</Label>
              <Select
                id="filterPaymentStatus"
                name="filterPaymentStatus"
                defaultValue={filterPaymentStatus}
              >
                <option value="ALL">Todos os status de pagamento</option>
                <option value="UNPAID">Sem pagamento</option>
                <option value="PARTIAL">Parcial</option>
                <option value="PAID">Quitado</option>
                <option value="NOT_APPLICABLE">Não aplicável (reaberta)</option>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" variant="secondary" size="sm">
                Aplicar filtros
              </Button>
              <Link
                href="/billing"
                className="text-xs text-muted hover:text-foreground underline"
              >
                Limpar filtros
              </Link>
            </div>
          </form>

          {periods.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nenhum fechamento registrado"
              description="Utilize o formulário de prévia acima para revisar os apontamentos de um cliente e confirmar o primeiro fechamento mensal."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface-elevated/60 text-muted">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Cliente</th>
                    <th className="px-3 py-2.5 font-medium">Competência</th>
                    <th className="px-3 py-2.5 font-medium">Revisão</th>
                    <th className="px-3 py-2.5 font-medium">Situação</th>
                    <th className="px-3 py-2.5 font-medium">Pagamento</th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Horas
                    </th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Total
                    </th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Recebido
                    </th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Saldo
                    </th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {periods.map((period) => {
                    const isSelected = selectedDetail?.id === period.id;
                    return (
                      <tr
                        key={period.id}
                        className={
                          isSelected
                            ? "bg-primary/5"
                            : "hover:bg-surface-elevated/40"
                        }
                        data-testid={`billing-period-row-${period.id}`}
                      >
                        <td className="px-3 py-2.5 font-medium text-foreground">
                          {period.displayClientName}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-foreground">
                          {period.competenceLabel}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-muted">
                          #{period.revision}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant={
                              period.status === "CLOSED"
                                ? "default"
                                : period.status === "REOPENED"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {formatBillingPeriodStatusLabel(period.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant={
                              period.paymentStatus === "PAID"
                                ? "default"
                                : period.paymentStatus === "PARTIAL"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {formatPaymentStatusLabel(period.paymentStatus)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-foreground">
                          {formatMinutesAsDuration(period.totalMinutes)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground">
                          {formatCentsAsBRL(period.totalCents)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-primary">
                          {formatCentsAsBRL(period.paidCents)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-primary">
                          {formatCentsAsBRL(period.balanceCents)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/billing?periodId=${period.id}`}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              {isSelected ? "Selecionada" : "Selecionar"}
                            </Link>
                            <Link
                              href={`/billing/${period.id}`}
                              className="text-xs text-muted hover:text-foreground underline"
                            >
                              Página dedicada
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Painel detalhado da competência selecionada */}
      {selectedDetail ? (
        <BillingPeriodDetailPanel
          detail={selectedDetail}
          defaultPaidDate={todayInZone.date}
        />
      ) : null}
    </div>
  );
}
