import { BarChart3, Download, FileSpreadsheet, FileText, Filter } from "lucide-react";
import Link from "next/link";
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
import { DomainError, ValidationError } from "@/lib/errors";
import { listClients } from "@/modules/client/service";
import { listProjects } from "@/modules/project/service";
import { formatReportCellForDisplay } from "@/modules/reporting/exporters/csv";
import type { RawReportFilterInput } from "@/modules/reporting/schema";
import { generateReportDataset } from "@/modules/reporting/service";
import {
  REPORT_TYPE_METADATA,
  REPORT_TYPES,
  type ExportFormat,
  type ReportDataset,
  type ReportFilterState,
  type ReportType,
} from "@/modules/reporting/types";

export const dynamic = "force-dynamic";

type ReportsSearchParams = Promise<{
  reportType?: string;
  startDate?: string;
  endDate?: string;
  clientId?: string;
  projectId?: string;
  billable?: string;
  entryStatus?: string;
  year?: string;
  month?: string;
  billingPeriodId?: string;
  periodStatus?: string;
  paymentStatus?: string;
  paymentFilterMode?: string;
  includeVoidedPayments?: string;
}>;

const MONTH_OPTIONS = [
  { value: "", label: "Todos os meses" },
  { value: "1", label: "01 - Janeiro" },
  { value: "2", label: "02 - Fevereiro" },
  { value: "3", label: "03 - Março" },
  { value: "4", label: "04 - Abril" },
  { value: "5", label: "05 - Maio" },
  { value: "6", label: "06 - Junho" },
  { value: "7", label: "07 - Julho" },
  { value: "8", label: "08 - Agosto" },
  { value: "9", label: "09 - Setembro" },
  { value: "10", label: "10 - Outubro" },
  { value: "11", label: "11 - Novembro" },
  { value: "12", label: "12 - Dezembro" },
];

function buildFilterSearchParams(filter: ReportFilterState): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("reportType", filter.reportType);
  if (filter.startDate) sp.set("startDate", filter.startDate);
  if (filter.endDate) sp.set("endDate", filter.endDate);
  if (filter.clientId) sp.set("clientId", filter.clientId);
  if (filter.projectId) sp.set("projectId", filter.projectId);
  if (filter.billable !== "ALL") sp.set("billable", filter.billable);
  if (filter.entryStatus !== "ALL") sp.set("entryStatus", filter.entryStatus);
  if (filter.year !== null) sp.set("year", String(filter.year));
  if (filter.month !== null) sp.set("month", String(filter.month));
  if (filter.billingPeriodId)
    sp.set("billingPeriodId", filter.billingPeriodId);
  if (filter.periodStatus !== "ALL")
    sp.set("periodStatus", filter.periodStatus);
  if (filter.paymentStatus !== "ALL")
    sp.set("paymentStatus", filter.paymentStatus);
  if (filter.reportType === "payments-and-balances") {
    sp.set("paymentFilterMode", filter.paymentFilterMode);
    sp.set("includeVoidedPayments", String(filter.includeVoidedPayments));
  }
  return sp;
}

function buildExportHref(
  filter: ReportFilterState,
  format: ExportFormat,
): string {
  const sp = buildFilterSearchParams(filter);
  sp.set("format", format);
  return `/api/reports/export?${sp.toString()}`;
}

function buildReportTypeSwitchHref(
  currentFilter: ReportFilterState,
  nextReportType: ReportType,
): string {
  const sp = buildFilterSearchParams({
    ...currentFilter,
    reportType: nextReportType,
  });
  return `/reports?${sp.toString()}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: ReportsSearchParams;
}) {
  const params = await searchParams;
  const rawFilter: RawReportFilterInput = {
    reportType: params.reportType,
    startDate: params.startDate,
    endDate: params.endDate,
    clientId: params.clientId,
    projectId: params.projectId,
    billable: params.billable,
    entryStatus: params.entryStatus,
    year: params.year,
    month: params.month,
    billingPeriodId: params.billingPeriodId,
    periodStatus: params.periodStatus,
    paymentStatus: params.paymentStatus,
    paymentFilterMode: params.paymentFilterMode,
    includeVoidedPayments: params.includeVoidedPayments,
  };

  const [{ clients }, { projects }] = await Promise.all([
    listClients({ status: "all" }),
    listProjects({ status: "all" }),
  ]);

  let dataset: ReportDataset;
  let filterError: string | null = null;

  try {
    dataset = await generateReportDataset(rawFilter);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DomainError) {
      filterError = error.message;
    } else {
      filterError = "Não foi possível processar os filtros informados.";
    }
    const safeType = REPORT_TYPES.includes(params.reportType as ReportType)
      ? (params.reportType as ReportType)
      : "hours-by-period";
    dataset = await generateReportDataset({ reportType: safeType });
  }

  const activeFilter = dataset.filter;
  const isEntryReport =
    activeFilter.reportType === "hours-by-period" ||
    activeFilter.reportType === "hours-by-client" ||
    activeFilter.reportType === "hours-by-project" ||
    activeFilter.reportType === "detailed-entries" ||
    activeFilter.reportType === "billable-values";
  const isClosingReport = activeFilter.reportType === "monthly-closings";
  const isPaymentReport = activeFilter.reportType === "payments-and-balances";

  return (
    <div className="space-y-6" data-testid="reports-page">
      <PageHeader
        title="Relatórios e Exportações"
        eyebrow="Análises e Demonstrativos"
        description="Relatórios filtráveis em tela com exportação direta para CSV (UTF-8 com BOM e ;), XLSX (ExcelJS) e PDF (@react-pdf/renderer) alimentados pela mesma consulta canônica."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={buildExportHref(activeFilter, "csv")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-elevated"
              data-testid="export-csv-link"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar CSV
            </a>
            <a
              href={buildExportHref(activeFilter, "xlsx")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-elevated"
              data-testid="export-xlsx-link"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar XLSX
            </a>
            <a
              href={buildExportHref(activeFilter, "pdf")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-strong"
              data-testid="export-pdf-link"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar PDF
            </a>
          </div>
        }
      />

      {filterError ? (
        <Alert variant="destructive" data-testid="reports-filter-error">
          <AlertTitle>Filtro inválido</AlertTitle>
          <AlertDescription>{filterError}</AlertDescription>
        </Alert>
      ) : null}

      {/* Seletor rápido dos 7 tipos de relatórios */}
      <nav
        aria-label="Catálogo de relatórios oficiais"
        className="flex flex-wrap gap-2"
        data-testid="report-type-tabs"
      >
        {REPORT_TYPES.map((typeKey) => {
          const meta = REPORT_TYPE_METADATA[typeKey];
          const isActive = activeFilter.reportType === typeKey;
          return (
            <Link
              key={typeKey}
              href={buildReportTypeSwitchHref(activeFilter, typeKey)}
              data-testid={`report-tab-${typeKey}`}
              className={
                isActive
                  ? "inline-flex items-center rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-xs"
                  : "inline-flex items-center rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
              }
            >
              {meta.title}
            </Link>
          );
        })}
      </nav>

      {/* Painel de Filtros */}
      <form
        method="GET"
        action="/reports"
        className="rounded-xl border border-border bg-surface p-5 space-y-4"
        data-testid="reports-filter-form"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">
              Filtros do relatório
            </h2>
          </div>
          <Link
            href={`/reports?reportType=${activeFilter.reportType}`}
            className="text-xs font-medium text-muted hover:text-foreground hover:underline"
            data-testid="reports-clear-filters"
          >
            Limpar filtros
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="filter-reportType">Tipo de relatório</Label>
            <Select
              id="filter-reportType"
              name="reportType"
              defaultValue={activeFilter.reportType}
            >
              {REPORT_TYPES.map((typeKey) => (
                <option key={typeKey} value={typeKey}>
                  {REPORT_TYPE_METADATA[typeKey].title}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-clientId">Cliente</Label>
            <Select
              id="filter-clientId"
              name="clientId"
              defaultValue={activeFilter.clientId ?? ""}
            >
              <option value="">Todos os clientes</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {!client.active ? " (Inativo)" : ""}
                </option>
              ))}
            </Select>
          </div>

          {isEntryReport ? (
            <div className="space-y-1.5">
              <Label htmlFor="filter-projectId">Projeto</Label>
              <Select
                id="filter-projectId"
                name="projectId"
                defaultValue={activeFilter.projectId ?? ""}
              >
                <option value="">Todos os projetos</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({project.clientName})
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="filter-year">Ano (competência)</Label>
            <Input
              id="filter-year"
              name="year"
              type="number"
              min={2000}
              max={2100}
              placeholder="Ex.: 2026"
              defaultValue={
                activeFilter.year !== null ? String(activeFilter.year) : ""
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-month">Mês (competência)</Label>
            <Select
              id="filter-month"
              name="month"
              defaultValue={
                activeFilter.month !== null ? String(activeFilter.month) : ""
              }
            >
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {!isClosingReport ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="filter-startDate">Data inicial</Label>
                <Input
                  id="filter-startDate"
                  name="startDate"
                  type="date"
                  defaultValue={activeFilter.startDate ?? ""}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-endDate">Data final</Label>
                <Input
                  id="filter-endDate"
                  name="endDate"
                  type="date"
                  defaultValue={activeFilter.endDate ?? ""}
                />
              </div>
            </>
          ) : null}

          {isEntryReport && activeFilter.reportType !== "billable-values" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="filter-billable">Natureza das horas</Label>
                <Select
                  id="filter-billable"
                  name="billable"
                  defaultValue={activeFilter.billable}
                >
                  <option value="ALL">Faturáveis e não faturáveis</option>
                  <option value="BILLABLE">Somente faturáveis</option>
                  <option value="NON_BILLABLE">Somente não faturáveis</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-entryStatus">
                  Status do apontamento
                </Label>
                <Select
                  id="filter-entryStatus"
                  name="entryStatus"
                  defaultValue={activeFilter.entryStatus}
                >
                  <option value="ALL">Todos os status</option>
                  <option value="DRAFT">Rascunho (DRAFT)</option>
                  <option value="BILLED">Faturado (BILLED)</option>
                  <option value="APPROVED">Aprovado (APPROVED)</option>
                </Select>
              </div>
            </>
          ) : null}

          {isClosingReport ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="filter-periodStatus">
                  Status do fechamento
                </Label>
                <Select
                  id="filter-periodStatus"
                  name="periodStatus"
                  defaultValue={activeFilter.periodStatus}
                >
                  <option value="ALL">Todos</option>
                  <option value="CLOSED">Fechado (CLOSED)</option>
                  <option value="REOPENED">Reaberto (REOPENED)</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-paymentStatus">
                  Situação de pagamento
                </Label>
                <Select
                  id="filter-paymentStatus"
                  name="paymentStatus"
                  defaultValue={activeFilter.paymentStatus}
                >
                  <option value="ALL">Todas</option>
                  <option value="UNPAID">Em aberto</option>
                  <option value="PARTIAL">Parcialmente pago</option>
                  <option value="PAID">Quitado</option>
                </Select>
              </div>
            </>
          ) : null}

          {isPaymentReport ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="filter-paymentFilterMode">
                  Critério de filtro de data
                </Label>
                <Select
                  id="filter-paymentFilterMode"
                  name="paymentFilterMode"
                  defaultValue={activeFilter.paymentFilterMode}
                >
                  <option value="PAID_AT">Data do pagamento (paidAt)</option>
                  <option value="COMPETENCE">Competência do fechamento</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-includeVoidedPayments">
                  Pagamentos estornados
                </Label>
                <Select
                  id="filter-includeVoidedPayments"
                  name="includeVoidedPayments"
                  defaultValue={String(activeFilter.includeVoidedPayments)}
                >
                  <option value="true">Exibir estornados no histórico</option>
                  <option value="false">Ocultar estornados</option>
                </Select>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>Filtros ativos:</span>
            {dataset.appliedFilterSummary.map((item) => (
              <Badge key={item} variant="secondary">
                {item}
              </Badge>
            ))}
          </div>

          <Button
            type="submit"
            variant="default"
            size="default"
            data-testid="reports-apply-filters"
          >
            Aplicar filtros
          </Button>
        </div>
      </form>

      {/* Métricas de Resumo do Relatório */}
      {dataset.summaryMetrics.length > 0 ? (
        <section
          aria-label="Métricas consolidadas do relatório"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="report-summary-metrics"
        >
          {dataset.summaryMetrics.map((metric, idx) => (
            <Card key={metric.label} data-testid={`report-metric-${idx}`}>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">
                  {metric.label}
                </CardDescription>
                <CardTitle className="font-mono text-2xl font-bold">
                  {metric.value}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </section>
      ) : null}

      {/* Tabela de Dados do Relatório */}
      <Card data-testid="report-results-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{dataset.title}</CardTitle>
              <CardDescription>
                {dataset.subtitle} • Gerado em {dataset.generatedAtLabel}
              </CardDescription>
            </div>
            <Badge variant="outline" data-testid="report-row-count">
              {dataset.rows.length} linha(s)
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {dataset.rows.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Nenhum registro encontrado para os filtros aplicados"
              description="Ajuste o período, cliente, projeto ou status acima para visualizar dados ou exportar demonstrativos."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table
                className="w-full text-left text-xs"
                data-testid="report-data-table"
              >
                <thead className="border-b border-border bg-surface-elevated/60 text-muted">
                  <tr>
                    {dataset.columns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-3 py-2.5 font-medium ${
                          col.align === "right"
                            ? "text-right"
                            : col.align === "center"
                              ? "text-center"
                              : "text-left"
                        }`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dataset.rows.map((row) => (
                    <tr key={row.id} data-testid={`report-row-${row.id}`}>
                      {dataset.columns.map((col) => {
                        const rawVal = row.cells[col.key] ?? null;
                        const formatted = formatReportCellForDisplay(
                          rawVal,
                          col,
                        );
                        const isMono =
                          col.kind === "duration" ||
                          col.kind === "money" ||
                          col.kind === "integer" ||
                          col.kind === "date";

                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2.5 ${
                              col.align === "right"
                                ? "text-right"
                                : col.align === "center"
                                  ? "text-center"
                                  : "text-left"
                            } ${isMono ? "font-mono" : ""} ${
                              col.kind === "money"
                                ? "font-semibold text-foreground"
                                : "text-foreground"
                            }`}
                          >
                            {col.kind === "badge" && formatted ? (
                              <Badge variant="outline">{formatted}</Badge>
                            ) : (
                              formatted || "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {dataset.totalsRow ? (
                  <tfoot className="border-t-2 border-border bg-surface-elevated/50 font-semibold text-foreground">
                    <tr data-testid="report-totals-row">
                      {dataset.columns.map((col) => {
                        const rawVal = dataset.totalsRow?.[col.key] ?? null;
                        const formatted = formatReportCellForDisplay(
                          rawVal,
                          col,
                        );
                        const isMono =
                          col.kind === "duration" ||
                          col.kind === "money" ||
                          col.kind === "integer";

                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-3 ${
                              col.align === "right"
                                ? "text-right"
                                : col.align === "center"
                                  ? "text-center"
                                  : "text-left"
                            } ${isMono ? "font-mono" : ""}`}
                          >
                            {formatted}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
