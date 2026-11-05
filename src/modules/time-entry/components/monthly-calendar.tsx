import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { getAdjacentYearMonth } from "@/lib/datetime";
import { formatMinutesAsDuration } from "@/lib/duration";
import { formatCentsAsBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MonthlyCalendarView } from "@/modules/time-entry/types";

const WEEKDAY_HEADERS = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
] as const;

const MONTH_OPTIONS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
] as const;

type MonthlyCalendarProps = {
  calendar: MonthlyCalendarView;
};

export function MonthlyCalendar({ calendar }: MonthlyCalendarProps) {
  const prev = getAdjacentYearMonth(calendar.year, calendar.month, -1);
  const next = getAdjacentYearMonth(calendar.year, calendar.month, 1);

  const yearOptions: number[] = [];
  for (let y = calendar.year - 3; y <= calendar.year + 3; y += 1) {
    yearOptions.push(y);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total mensal de horas</CardDescription>
            <CardTitle
              data-testid="calendar-monthly-total-hours"
              className="text-2xl"
            >
              {formatMinutesAsDuration(calendar.totals.totalMinutes)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {calendar.totals.entryCount}{" "}
            {calendar.totals.entryCount === 1 ? "apontamento" : "apontamentos"}{" "}
            no mês
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Faturáveis / Não faturáveis</CardDescription>
            <CardTitle className="text-2xl">
              {formatMinutesAsDuration(calendar.totals.billableMinutes)}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {formatMinutesAsDuration(calendar.totals.nonBillableMinutes)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Não faturáveis contam nas horas e não geram cobrança
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Dias trabalhados</CardDescription>
            <CardTitle
              data-testid="calendar-monthly-worked-days"
              className="text-2xl"
            >
              {calendar.totals.workedDaysCount}{" "}
              {calendar.totals.workedDaysCount === 1 ? "dia" : "dias"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Múltiplos apontamentos no mesmo dia contam 1 dia trabalhado
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valor faturável no mês</CardDescription>
            <CardTitle
              data-testid="calendar-monthly-total-amount"
              className="text-2xl"
            >
              {formatCentsAsBRL(calendar.totals.totalCents)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Soma exata dos apontamentos (half-up por registro)
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="capitalize">
              {calendar.monthLabelPtBR}
            </CardTitle>
            <CardDescription>
              Todos os dias do mês são exibidos. Sábados e domingos recebem
              destaque visual, sem adicionais financeiros automáticos.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/timesheet?year=${prev.year}&month=${prev.month}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              aria-label="Mês anterior"
            >
              <ChevronLeft aria-hidden="true" />
              Anterior
            </Link>

            <Link
              href={`/timesheet?date=${calendar.todayCivilDate}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Hoje
            </Link>

            <Link
              href={`/timesheet?year=${next.year}&month=${next.month}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              aria-label="Próximo mês"
            >
              Próximo
              <ChevronRight aria-hidden="true" />
            </Link>

            <form
              method="get"
              action="/timesheet"
              className="flex items-center gap-1.5"
            >
              <Select
                name="month"
                aria-label="Selecionar mês"
                defaultValue={String(calendar.month)}
                className="w-32"
              >
                {MONTH_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <Select
                name="year"
                aria-label="Selecionar ano"
                defaultValue={String(calendar.year)}
                className="w-24"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm" variant="secondary">
                Ir
              </Button>
            </form>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="hidden grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground sm:grid">
            {WEEKDAY_HEADERS.map((weekday, idx) => (
              <div
                key={weekday}
                className={cn(
                  "py-1",
                  (idx === 0 || idx === 6) && "text-primary font-semibold",
                )}
              >
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
            {Array.from({ length: calendar.leadingEmptyDays }).map((_, idx) => (
              <div
                key={`empty-${idx}`}
                aria-hidden="true"
                className="hidden min-h-24 rounded-lg border border-dashed bg-muted/10 sm:block"
              />
            ))}

            {calendar.days.map((day) => {
              const isSelected = day.date === calendar.selectedDate;
              const weekdayLabel = WEEKDAY_HEADERS[day.dayOfWeek];

              return (
                <Link
                  key={day.date}
                  href={`/timesheet?year=${calendar.year}&month=${calendar.month}&date=${day.date}`}
                  data-testid={`calendar-day-${day.date}`}
                  data-weekend={day.isWeekend ? "true" : "false"}
                  aria-current={isSelected ? "date" : undefined}
                  className={cn(
                    "flex min-h-24 flex-col justify-between rounded-lg border p-2.5 text-left transition-colors hover:border-primary/60",
                    day.isWeekend && "bg-muted/40 border-muted-foreground/25",
                    day.isToday && "ring-1 ring-primary/50",
                    isSelected &&
                      "border-primary bg-primary/5 ring-2 ring-primary",
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold">
                        {String(day.dayOfMonth).padStart(2, "0")}
                      </span>
                      <span className="text-[11px] text-muted-foreground sm:hidden">
                        {weekdayLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {day.isToday ? (
                        <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                          Hoje
                        </Badge>
                      ) : null}
                      {day.isWeekend ? (
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {weekdayLabel}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 space-y-0.5">
                    <div
                      className={cn(
                        "text-xs font-semibold",
                        day.totalMinutes > 0
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatMinutesAsDuration(day.totalMinutes)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {day.entryCount === 0
                        ? "Sem registros"
                        : `${day.entryCount} ${day.entryCount === 1 ? "registro" : "registros"}`}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
