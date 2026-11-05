import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
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
import { formatMinutesAsDuration } from "@/lib/duration";
import { formatCentsAsBRL } from "@/lib/money";
import { getMonthlyDashboard } from "@/modules/dashboard/service";

export const dynamic = "force-dynamic";

type DashboardSearchParams = Promise<{
  year?: string;
  month?: string;
}>;

const MONTH_OPTIONS = [
  { value: 1, label: "01 - Janeiro" },
  { value: 2, label: "02 - Fevereiro" },
  { value: 3, label: "03 - Março" },
  { value: 4, label: "04 - Abril" },
  { value: 5, label: "05 - Maio" },
  { value: 6, label: "06 - Junho" },
  { value: 7, label: "07 - Julho" },
  { value: 8, label: "08 - Agosto" },
  { value: 9, label: "09 - Setembro" },
  { value: 10, label: "10 - Outubro" },
  { value: 11, label: "11 - Novembro" },
  { value: 12, label: "12 - Dezembro" },
];

function parseQueryInt(raw: string | undefined): number | undefined {
  if (!raw || raw.trim() === "") return undefined;
  const num = Number(raw);
  return Number.isInteger(num) ? num : undefined;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: DashboardSearchParams;
}) {
  const params = await searchParams;
  const rawYear = parseQueryInt(params.year);
  const rawMonth = parseQueryInt(params.month);

  let dashboard: Awaited<ReturnType<typeof getMonthlyDashboard>>;
  try {
    dashboard = await getMonthlyDashboard({
      year: rawYear,
      month: rawMonth,
    });
  } catch {
    dashboard = await getMonthlyDashboard({});
  }

  const hasData =
    dashboard.entryCount > 0 ||
    dashboard.closedPeriodsCount > 0 ||
    dashboard.reopenedPeriodsCount > 0;

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <PageHeader
        title="Dashboard"
        eyebrow={`Competência ${dashboard.competenceLabel}`}
        description={`Visão executiva e financeira de ${dashboard.monthTitlePtBR} (${dashboard.timezone}). Métricas de recebimento e pendência seguem a semântica da competência selecionada.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard?year=${dashboard.previousMonth.year}&month=${dashboard.previousMonth.month}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-elevated"
              data-testid="dashboard-prev-month"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Anterior
            </Link>
            <Link
              href={`/dashboard?year=${dashboard.currentMonth.year}&month=${dashboard.currentMonth.month}`}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-elevated"
              data-testid="dashboard-current-month"
            >
              Mês atual
            </Link>
            <Link
              href={`/dashboard?year=${dashboard.nextMonth.year}&month=${dashboard.nextMonth.month}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-elevated"
              data-testid="dashboard-next-month"
            >
              Próximo
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link
              href={`/reports?reportType=hours-by-period&year=${dashboard.year}&month=${dashboard.month}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-strong"
              data-testid="dashboard-open-reports"
            >
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
              Relatórios da competência
            </Link>
          </div>
        }
      />

      {/* Filtro rápido de competência */}
      <form
        method="GET"
        action="/dashboard"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
        data-testid="dashboard-competence-form"
      >
        <div className="w-36 space-y-1.5">
          <Label htmlFor="dashboard-month">Mês</Label>
          <Select
            id="dashboard-month"
            name="month"
            defaultValue={String(dashboard.month)}
          >
            {MONTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-28 space-y-1.5">
          <Label htmlFor="dashboard-year">Ano</Label>
          <Input
            id="dashboard-year"
            name="year"
            type="number"
            min={2000}
            max={2100}
            defaultValue={String(dashboard.year)}
          />
        </div>

        <Button type="submit" variant="secondary" size="default">
          Consultar competência
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge variant="outline">
            {dashboard.entryCount} apontamento(s) ativo(s)
          </Badge>
          <Badge variant="outline">
            {dashboard.closedPeriodsCount} fechamento(s) fechado(s)
          </Badge>
        </div>
      </form>

      {/* Cards de Indicadores Mensais */}
      <section
        aria-label="Indicadores mensais da competência"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      >
        <Card data-testid="kpi-worked-hours">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Horas trabalhadas</span>
              <Clock className="h-4 w-4 text-muted" aria-hidden="true" />
            </CardDescription>
            <CardTitle
              className="font-mono text-2xl font-bold"
              data-testid="kpi-worked-hours-value"
            >
              {formatMinutesAsDuration(dashboard.totalWorkedMinutes)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted">
              Em{" "}
              <strong className="text-foreground">
                {dashboard.entryCount}
              </strong>{" "}
              lançamento(s) no mês
            </p>
          </CardContent>
        </Card>

        <Card data-testid="kpi-billable-hours">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Horas faturáveis</span>
              <Briefcase className="h-4 w-4 text-muted" aria-hidden="true" />
            </CardDescription>
            <CardTitle
              className="font-mono text-2xl font-bold text-primary"
              data-testid="kpi-billable-hours-value"
            >
              {formatMinutesAsDuration(dashboard.billableMinutes)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted">
              Não faturáveis:{" "}
              <span
                className="font-mono font-medium text-foreground"
                data-testid="kpi-non-billable-hours-value"
              >
                {formatMinutesAsDuration(dashboard.nonBillableMinutes)}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card data-testid="kpi-worked-days">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Dias trabalhados</span>
              <CalendarDays className="h-4 w-4 text-muted" aria-hidden="true" />
            </CardDescription>
            <CardTitle
              className="font-mono text-2xl font-bold"
              data-testid="kpi-worked-days-value"
            >
              {dashboard.workedDaysCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted">
              Datas civis distintas com registro ativo
            </p>
          </CardContent>
        </Card>

        <Card data-testid="kpi-accumulated-value">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Valor acumulado</span>
              <Receipt className="h-4 w-4 text-muted" aria-hidden="true" />
            </CardDescription>
            <CardTitle
              className="font-mono text-2xl font-bold"
              data-testid="kpi-accumulated-value-cents"
            >
              {formatCentsAsBRL(dashboard.accumulatedBillableCents)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted">
              Fechado:{" "}
              <span className="font-mono font-medium text-foreground">
                {formatCentsAsBRL(dashboard.closedBillingsCents)}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card data-testid="kpi-received-value">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Recebido (competência)</span>
              <CheckCircle2
                className="h-4 w-4 text-primary"
                aria-hidden="true"
              />
            </CardDescription>
            <CardTitle
              className="font-mono text-2xl font-bold text-primary"
              data-testid="kpi-received-value-cents"
            >
              {formatCentsAsBRL(dashboard.receivedCompetenceCents)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted">
              Pagamentos ativos dos fechamentos de {dashboard.competenceLabel}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="kpi-pending-value">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Pendente (competência)</span>
              <Wallet className="h-4 w-4 text-muted" aria-hidden="true" />
            </CardDescription>
            <CardTitle
              className="font-mono text-2xl font-bold"
              data-testid="kpi-pending-value-cents"
            >
              {formatCentsAsBRL(dashboard.totalPendingCompetenceCents)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 text-xs text-muted">
            <p>
              A faturar (rascunho):{" "}
              <span
                className="font-mono font-medium text-foreground"
                data-testid="kpi-unbilled-draft-cents"
              >
                {formatCentsAsBRL(dashboard.unbilledDraftCents)}
              </span>
            </p>
            <p>
              Saldo de fechamentos:{" "}
              <span
                className="font-mono font-medium text-foreground"
                data-testid="kpi-closed-balance-cents"
              >
                {formatCentsAsBRL(dashboard.closedBalanceCents)}
              </span>
            </p>
          </CardContent>
        </Card>
      </section>

      {!hasData ? (
        <EmptyState
          icon={CalendarDays}
          title={`Ainda não há horas registradas em ${dashboard.competenceLabel}`}
          description="Registre apontamentos na tela de Horas ou selecione outra competência acima para visualizar a distribuição por cliente e por projeto."
          action={
            <Link
              href={`/timesheet?year=${dashboard.year}&month=${dashboard.month}`}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-strong"
            >
              Ir para Horas ({dashboard.competenceLabel})
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Distribuição por Cliente */}
          <Card data-testid="dashboard-client-distribution">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                    Distribuição por cliente
                  </CardTitle>
                  <CardDescription>
                    Horas totais, faturáveis e valor acumulado por cliente em{" "}
                    {dashboard.competenceLabel}.
                  </CardDescription>
                </div>
                <Link
                  href={`/reports?reportType=hours-by-client&year=${dashboard.year}&month=${dashboard.month}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Ver no relatório
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {dashboard.distributionByClient.length === 0 ? (
                <p className="text-sm text-muted">
                  Nenhuma hora apontada por cliente nesta competência.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-surface-elevated/60 text-muted">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Cliente</th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Projetos
                        </th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Horas totais
                        </th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Faturáveis
                        </th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {dashboard.distributionByClient.map((row) => (
                        <tr key={row.clientId}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground">
                                {row.clientName}
                              </span>
                              <span className="font-mono text-[11px] text-muted">
                                {row.sharePercent.toFixed(1)}%
                              </span>
                            </div>
                            <div
                              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated"
                              aria-hidden="true"
                            >
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{
                                  width: `${Math.min(100, Math.max(4, row.sharePercent))}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-muted">
                            {row.projectCount}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground">
                            {formatMinutesAsDuration(row.workedMinutes)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-muted">
                            {formatMinutesAsDuration(row.billableMinutes)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                            {formatCentsAsBRL(row.amountCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Distribuição por Projeto */}
          <Card data-testid="dashboard-project-distribution">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                    Distribuição por projeto
                  </CardTitle>
                  <CardDescription>
                    Participação de cada projeto nas horas e valores da
                    competência {dashboard.competenceLabel}.
                  </CardDescription>
                </div>
                <Link
                  href={`/reports?reportType=hours-by-project&year=${dashboard.year}&month=${dashboard.month}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Ver no relatório
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {dashboard.distributionByProject.length === 0 ? (
                <p className="text-sm text-muted">
                  Nenhuma hora apontada por projeto nesta competência.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-surface-elevated/60 text-muted">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">
                          Projeto / Cliente
                        </th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Horas totais
                        </th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Faturáveis
                        </th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {dashboard.distributionByProject.map((row) => (
                        <tr key={row.projectId}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="font-medium text-foreground">
                                  {row.projectName}
                                </p>
                                <p className="text-[11px] text-muted">
                                  {row.clientName}
                                </p>
                              </div>
                              <span className="font-mono text-[11px] text-muted">
                                {row.sharePercent.toFixed(1)}%
                              </span>
                            </div>
                            <div
                              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated"
                              aria-hidden="true"
                            >
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{
                                  width: `${Math.min(100, Math.max(4, row.sharePercent))}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground">
                            {formatMinutesAsDuration(row.workedMinutes)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-muted">
                            {formatMinutesAsDuration(row.billableMinutes)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                            {formatCentsAsBRL(row.amountCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
