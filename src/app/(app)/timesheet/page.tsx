import Link from "next/link";
import { CalendarDays, Clock3, ListFilter } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { formatCivilDatePtBR } from "@/lib/datetime";
import { formatMinutesAsDuration } from "@/lib/duration";
import { formatCentsAsBRL } from "@/lib/money";
import { listClients } from "@/modules/client/service";
import { listProjects } from "@/modules/project/service";
import { MonthlyCalendar } from "@/modules/time-entry/components/monthly-calendar";
import { TimeEntryCard } from "@/modules/time-entry/components/time-entry-card";
import { TimeEntryForm } from "@/modules/time-entry/components/time-entry-form";
import { parseTimeEntryListFilter } from "@/modules/time-entry/schema";
import {
  getMonthlyCalendar,
  listTimeEntries,
} from "@/modules/time-entry/service";

export const dynamic = "force-dynamic";

type TimesheetPageProps = {
  searchParams: Promise<{
    year?: string | string[];
    month?: string | string[];
    date?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
    clientId?: string | string[];
    projectId?: string | string[];
    billable?: string | string[];
    status?: string | string[];
    page?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function TimesheetPage({
  searchParams,
}: TimesheetPageProps) {
  const raw = await searchParams;

  const listFilter = parseTimeEntryListFilter({
    startDate: firstParam(raw.startDate),
    endDate: firstParam(raw.endDate),
    clientId: firstParam(raw.clientId),
    projectId: firstParam(raw.projectId),
    billable: firstParam(raw.billable),
    status: firstParam(raw.status),
    page: firstParam(raw.page),
  });

  const [calendar, listResult, { clients }, { projects }] = await Promise.all([
    getMonthlyCalendar({
      year: firstParam(raw.year),
      month: firstParam(raw.month),
      selectedDate: firstParam(raw.date),
      clientId: listFilter.clientId || undefined,
      projectId: listFilter.projectId || undefined,
    }),
    listTimeEntries(listFilter),
    listClients(),
    listProjects(),
  ]);

  const selectableClients = clients.map((client) => ({
    id: client.id,
    name: client.name,
    active: client.active,
  }));

  const selectableProjects = projects.map((project) => ({
    id: project.id,
    clientId: project.clientId,
    clientName: project.clientName,
    name: project.name,
    active: project.active,
    clientActive: project.clientActive,
    eligibleForTimeEntries: project.eligibleForTimeEntries,
    effectiveHourlyRateCents: project.effectiveHourlyRateCents,
    effectiveRateSource: project.effectiveRateSource,
  }));

  const hasActiveListFilters =
    listFilter.startDate.length > 0 ||
    listFilter.endDate.length > 0 ||
    listFilter.clientId.length > 0 ||
    listFilter.projectId.length > 0 ||
    listFilter.billable !== "all" ||
    listFilter.status !== "all";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Horas e Calendário"
        eyebrow="Apontamentos"
        description="Registre horas por duração manual (HH:mm) ou por intervalo de início e término, acompanhe o calendário mensal e filtre o histórico."
        actions={
          <Badge variant="secondary">Fuso: {calendar.timezone}</Badge>
        }
      />

      <MonthlyCalendar calendar={calendar} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 aria-hidden="true" className="size-5 text-primary" />
              Novo apontamento
            </CardTitle>
            <CardDescription>
              Dia selecionado no calendário:{" "}
              <strong>{formatCivilDatePtBR(calendar.selectedDate)}</strong>. A
              tarifa é congelada no momento do registro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TimeEntryForm
              key={`create-${calendar.selectedDate}`}
              clients={selectableClients}
              projects={selectableProjects}
              defaultDate={calendar.selectedDate}
              timezone={calendar.timezone}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <CalendarDays
                  aria-hidden="true"
                  className="size-5 text-primary"
                />
                Dia {formatCivilDatePtBR(calendar.selectedDay.date)}
              </CardTitle>
              <div className="flex items-center gap-2">
                {calendar.selectedDay.isWeekend ? (
                  <Badge variant="secondary">Fim de semana</Badge>
                ) : null}
                <Badge variant="outline">
                  Total do dia:{" "}
                  {formatMinutesAsDuration(calendar.selectedDay.totalMinutes)}
                </Badge>
              </div>
            </div>
            <CardDescription>
              {calendar.selectedDay.entryCount === 0
                ? "Nenhum apontamento registrado nesta data civil."
                : `${calendar.selectedDay.entryCount} ${calendar.selectedDay.entryCount === 1 ? "lançamento" : "lançamentos"} · Valor faturável no dia: ${formatCentsAsBRL(calendar.selectedDay.totalCents)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {calendar.selectedDay.entries.length === 0 ? (
              <EmptyState
                icon={Clock3}
                title="Sem apontamentos neste dia"
                description="Use o formulário ao lado para registrar horas por duração ou por intervalo."
              />
            ) : (
              <div className="space-y-3" data-testid="selected-day-entries">
                {calendar.selectedDay.entries.map((entry) => (
                  <TimeEntryCard
                    key={entry.id}
                    entry={entry}
                    clients={selectableClients}
                    projects={selectableProjects}
                    timezone={calendar.timezone}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListFilter aria-hidden="true" className="size-4 text-primary" />
              Lista filtrável de apontamentos
            </CardTitle>
            <CardDescription>
              Filtre por período, cliente, projeto, faturável e status. Paginação
              explícita de até {listResult.pageSize} registros por página.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              method="get"
              action="/timesheet"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6"
            >
              <input type="hidden" name="year" value={calendar.year} />
              <input type="hidden" name="month" value={calendar.month} />
              <input type="hidden" name="date" value={calendar.selectedDate} />

              <div className="space-y-1.5">
                <Label htmlFor="filter-startDate">Data inicial</Label>
                <Input
                  id="filter-startDate"
                  name="startDate"
                  type="date"
                  defaultValue={listFilter.startDate}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-endDate">Data final</Label>
                <Input
                  id="filter-endDate"
                  name="endDate"
                  type="date"
                  defaultValue={listFilter.endDate}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-clientId">Filtrar por cliente</Label>
                <Select
                  id="filter-clientId"
                  name="clientId"
                  defaultValue={listFilter.clientId}
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
                <Label htmlFor="filter-projectId">Filtrar por projeto</Label>
                <Select
                  id="filter-projectId"
                  name="projectId"
                  defaultValue={listFilter.projectId}
                >
                  <option value="">Todos os projetos</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.clientName})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-billable">Faturável</Label>
                <Select
                  id="filter-billable"
                  name="billable"
                  defaultValue={listFilter.billable}
                >
                  <option value="all">Todos</option>
                  <option value="billable">Somente faturáveis</option>
                  <option value="non_billable">Somente não faturáveis</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-status">Status</Label>
                <Select
                  id="filter-status"
                  name="status"
                  defaultValue={listFilter.status}
                >
                  <option value="all">Todos</option>
                  <option value="DRAFT">Rascunho</option>
                  <option value="BILLED">Faturado</option>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
                <Button type="submit" variant="secondary">
                  Aplicar filtros
                </Button>
                {hasActiveListFilters ? (
                  <Link
                    href={`/timesheet?year=${calendar.year}&month=${calendar.month}&date=${calendar.selectedDate}`}
                    className={buttonVariants({ variant: "ghost" })}
                  >
                    Limpar filtros
                  </Link>
                ) : null}
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-xs">
              <span>
                Registros encontrados:{" "}
                <strong>{listResult.totalCount}</strong> (
                {listResult.totals.workedDaysCount}{" "}
                {listResult.totals.workedDaysCount === 1
                  ? "dia trabalhado"
                  : "dias trabalhados"}
                )
              </span>
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  Horas filtradas:{" "}
                  <strong data-testid="filtered-list-total-hours">
                    {formatMinutesAsDuration(listResult.totals.totalMinutes)}
                  </strong>
                </span>
                <span>
                  Valor faturável filtrado:{" "}
                  <strong data-testid="filtered-list-total-amount">
                    {formatCentsAsBRL(listResult.totals.totalCents)}
                  </strong>
                </span>
              </div>
            </div>

            {listResult.entries.length === 0 ? (
              <EmptyState
                icon={Clock3}
                title="Nenhum apontamento encontrado"
                description={
                  hasActiveListFilters
                    ? "Ajuste os filtros aplicados para visualizar outros registros."
                    : "Ainda não há apontamentos registrados."
                }
              />
            ) : (
              <div className="space-y-3" data-testid="timesheet-entry-list">
                {listResult.entries.map((entry) => (
                  <TimeEntryCard
                    key={entry.id}
                    entry={entry}
                    clients={selectableClients}
                    projects={selectableProjects}
                    timezone={calendar.timezone}
                  />
                ))}

                {listResult.totalPages > 1 ? (
                  <div className="flex items-center justify-between border-t pt-4 text-sm">
                    <span className="text-muted-foreground">
                      Página {listResult.page} de {listResult.totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      {listResult.page > 1 ? (
                        <Link
                          href={`/timesheet?year=${calendar.year}&month=${calendar.month}&date=${calendar.selectedDate}&startDate=${listFilter.startDate}&endDate=${listFilter.endDate}&clientId=${listFilter.clientId}&projectId=${listFilter.projectId}&billable=${listFilter.billable}&status=${listFilter.status}&page=${listResult.page - 1}`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                        >
                          Página anterior
                        </Link>
                      ) : null}
                      {listResult.page < listResult.totalPages ? (
                        <Link
                          href={`/timesheet?year=${calendar.year}&month=${calendar.month}&date=${calendar.selectedDate}&startDate=${listFilter.startDate}&endDate=${listFilter.endDate}&clientId=${listFilter.clientId}&projectId=${listFilter.projectId}&billable=${listFilter.billable}&status=${listFilter.status}&page=${listResult.page + 1}`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                        >
                          Próxima página
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
