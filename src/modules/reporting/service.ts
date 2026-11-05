import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { formatInstantInTimeZone } from "@/lib/datetime";
import { prisma as defaultDb } from "@/lib/db";
import { formatMinutesAsDuration } from "@/lib/duration";
import { ValidationError } from "@/lib/errors";
import { formatCentsAsBRL } from "@/lib/money";
import { getCompetenceDateBounds } from "@/modules/billing/repository";
import {
  derivePaymentStatus,
  formatBillingPeriodStatusLabel,
  formatPaymentStatusLabel,
} from "@/modules/billing/service";
import { getSettings } from "@/modules/settings/service";
import {
  queryReportBillingPeriods,
  queryReportPayments,
  queryReportTimeEntries,
  resolveEffectiveDateBounds,
} from "./repository";
import { parseReportFilter, type RawReportFilterInput } from "./schema";
import {
  MAX_EXPORT_ROWS,
  REPORT_TYPE_METADATA,
  type ReportDataset,
  type ReportFilterState,
  type ReportRow,
} from "./types";

function assertWithinRowLimit(count: number): void {
  if (count > MAX_EXPORT_ROWS) {
    throw new ValidationError(
      `A consulta retornou ${count} registros, excedendo o limite seguro de ${MAX_EXPORT_ROWS} linhas para relatório/exportação. Refine os filtros de período, cliente ou projeto.`,
    );
  }
}

async function buildAppliedFilterSummary(
  database: PrismaClient,
  filter: ReportFilterState,
): Promise<string[]> {
  const parts: string[] = [];
  const { startDate, endDate } = resolveEffectiveDateBounds(filter);

  if (startDate && endDate) {
    parts.push(`Período: ${startDate} até ${endDate}`);
  } else if (startDate) {
    parts.push(`A partir de: ${startDate}`);
  } else if (endDate) {
    parts.push(`Até: ${endDate}`);
  }

  if (filter.year !== null && filter.month !== null) {
    parts.push(
      `Competência: ${String(filter.month).padStart(2, "0")}/${filter.year}`,
    );
  } else if (filter.year !== null) {
    parts.push(`Ano: ${filter.year}`);
  }

  if (filter.clientId) {
    const client = await database.client.findUnique({
      where: { id: filter.clientId },
      select: { name: true },
    });
    parts.push(`Cliente: ${client?.name ?? filter.clientId}`);
  }

  if (filter.projectId) {
    const project = await database.project.findUnique({
      where: { id: filter.projectId },
      select: { name: true },
    });
    parts.push(`Projeto: ${project?.name ?? filter.projectId}`);
  }

  if (filter.billable === "BILLABLE") {
    parts.push("Faturável: Sim");
  } else if (filter.billable === "NON_BILLABLE") {
    parts.push("Faturável: Não");
  }

  if (filter.entryStatus !== "ALL") {
    parts.push(`Status apontamento: ${filter.entryStatus}`);
  }

  if (filter.reportType === "payments-and-balances") {
    parts.push(
      filter.paymentFilterMode === "PAID_AT"
        ? "Critério de data: Data do pagamento (paidAt)"
        : "Critério de data: Competência do fechamento",
    );
  }

  if (parts.length === 0) {
    parts.push("Todos os registros ativos");
  }

  return parts;
}

function formatTimeEntryStatusPtBR(status: string): string {
  switch (status) {
    case "BILLED":
      return "Faturado";
    case "APPROVED":
      return "Aprovado";
    default:
      return "Rascunho";
  }
}

/**
 * Gera o conjunto de dados canônico (`ReportDataset`) para qualquer um dos 7 relatórios.
 * A tela `/reports` e os exportadores `CSV`, `XLSX` e `PDF` consomem exatamente o retorno
 * desta função, garantindo equivalência 1:1 de IDs, minutos e centavos.
 */
export async function generateReportDataset(
  rawFilter: RawReportFilterInput = {},
  database: PrismaClient = defaultDb,
): Promise<ReportDataset> {
  const filter = parseReportFilter(rawFilter);
  const settings = await getSettings(database);
  const now = new Date();
  const nowInZone = formatInstantInTimeZone(now, settings.timezone);
  const generatedAtLabel = `${nowInZone.date} ${nowInZone.time} (${settings.timezone})`;
  const appliedFilterSummary = await buildAppliedFilterSummary(
    database,
    filter,
  );
  const meta = REPORT_TYPE_METADATA[filter.reportType];

  if (
    filter.reportType === "hours-by-period" ||
    filter.reportType === "hours-by-client" ||
    filter.reportType === "hours-by-project" ||
    filter.reportType === "detailed-entries"
  ) {
    const entries = await queryReportTimeEntries(database, filter);
    assertWithinRowLimit(entries.length);

    const matchedRecordIds = entries.map((entry) => entry.id);
    const distinctWorkDates = new Set(entries.map((entry) => entry.workDate));
    let totalMinutesBig = 0n;
    let billableMinutesBig = 0n;
    let totalCentsBig = 0n;

    for (const entry of entries) {
      const snapshotItem = entry.billingItems[0];
      const effectiveCents = snapshotItem
        ? snapshotItem.amountCents
        : entry.amountCents;

      totalMinutesBig += BigInt(entry.durationMinutes);
      if (entry.billable) {
        billableMinutesBig += BigInt(entry.durationMinutes);
        totalCentsBig += BigInt(effectiveCents);
      }
    }

    const totalMinutes = Number(totalMinutesBig);
    const billableMinutes = Number(billableMinutesBig);
    const nonBillableMinutes = totalMinutes - billableMinutes;
    const totalCents = Number(totalCentsBig);
    const workedDaysCount = distinctWorkDates.size;

    if (filter.reportType === "hours-by-period") {
      const dayMap = new Map<
        string,
        {
          workDate: string;
          entryCount: number;
          workedMinutes: number;
          billableMinutes: number;
          nonBillableMinutes: number;
          amountCents: number;
        }
      >();

      for (const entry of entries) {
        const snapshotItem = entry.billingItems[0];
        const effectiveCents = snapshotItem
          ? snapshotItem.amountCents
          : entry.amountCents;
        const current = dayMap.get(entry.workDate) ?? {
          workDate: entry.workDate,
          entryCount: 0,
          workedMinutes: 0,
          billableMinutes: 0,
          nonBillableMinutes: 0,
          amountCents: 0,
        };
        current.entryCount += 1;
        current.workedMinutes += entry.durationMinutes;
        if (entry.billable) {
          current.billableMinutes += entry.durationMinutes;
          current.amountCents += effectiveCents;
        } else {
          current.nonBillableMinutes += entry.durationMinutes;
        }
        dayMap.set(entry.workDate, current);
      }

      const rows: ReportRow[] = Array.from(dayMap.values())
        .sort((a, b) => a.workDate.localeCompare(b.workDate))
        .map((day) => ({
          id: day.workDate,
          cells: {
            workDate: day.workDate,
            entryCount: day.entryCount,
            workedMinutes: day.workedMinutes,
            billableMinutes: day.billableMinutes,
            nonBillableMinutes: day.nonBillableMinutes,
            amountCents: day.amountCents,
          },
        }));

      return {
        reportType: filter.reportType,
        title: meta.title,
        subtitle: meta.description,
        generatedAtIso: now.toISOString(),
        generatedAtLabel,
        timezone: settings.timezone,
        filter,
        appliedFilterSummary,
        columns: [
          { key: "workDate", label: "Data", kind: "date", align: "left" },
          {
            key: "entryCount",
            label: "Lançamentos",
            kind: "integer",
            align: "right",
          },
          {
            key: "workedMinutes",
            label: "Horas trabalhadas",
            kind: "duration",
            align: "right",
          },
          {
            key: "billableMinutes",
            label: "Horas faturáveis",
            kind: "duration",
            align: "right",
          },
          {
            key: "nonBillableMinutes",
            label: "Não faturáveis",
            kind: "duration",
            align: "right",
          },
          {
            key: "amountCents",
            label: "Valor faturável",
            kind: "money",
            align: "right",
          },
        ],
        rows,
        totalsRow: {
          workDate: `Total (${workedDaysCount} dia(s))`,
          entryCount: entries.length,
          workedMinutes: totalMinutes,
          billableMinutes,
          nonBillableMinutes,
          amountCents: totalCents,
        },
        summaryMetrics: [
          {
            label: "Dias trabalhados",
            value: String(workedDaysCount),
            kind: "integer",
            rawNumber: workedDaysCount,
          },
          {
            label: "Horas trabalhadas",
            value: formatMinutesAsDuration(totalMinutes),
            kind: "duration",
            rawNumber: totalMinutes,
          },
          {
            label: "Horas faturáveis",
            value: formatMinutesAsDuration(billableMinutes),
            kind: "duration",
            rawNumber: billableMinutes,
          },
          {
            label: "Valor total",
            value: formatCentsAsBRL(totalCents),
            kind: "money",
            rawNumber: totalCents,
          },
        ],
        matchedRecordIds,
        totalMinutes,
        billableMinutes,
        totalCents,
        workedDaysCount,
      };
    }

    if (filter.reportType === "hours-by-client") {
      const clientMap = new Map<
        string,
        {
          clientId: string;
          clientName: string;
          projects: Set<string>;
          workDates: Set<string>;
          entryCount: number;
          workedMinutes: number;
          billableMinutes: number;
          amountCents: number;
        }
      >();

      for (const entry of entries) {
        const snapshotItem = entry.billingItems[0];
        const clientName = snapshotItem
          ? snapshotItem.clientName
          : entry.project.client.name;
        const effectiveCents = snapshotItem
          ? snapshotItem.amountCents
          : entry.amountCents;
        const clientId = entry.project.client.id;

        const current = clientMap.get(clientId) ?? {
          clientId,
          clientName,
          projects: new Set<string>(),
          workDates: new Set<string>(),
          entryCount: 0,
          workedMinutes: 0,
          billableMinutes: 0,
          amountCents: 0,
        };
        current.projects.add(entry.project.id);
        current.workDates.add(entry.workDate);
        current.entryCount += 1;
        current.workedMinutes += entry.durationMinutes;
        if (entry.billable) {
          current.billableMinutes += entry.durationMinutes;
          current.amountCents += effectiveCents;
        }
        clientMap.set(clientId, current);
      }

      const rows: ReportRow[] = Array.from(clientMap.values())
        .sort(
          (a, b) =>
            b.workedMinutes - a.workedMinutes ||
            a.clientName.localeCompare(b.clientName, "pt-BR"),
        )
        .map((c) => ({
          id: c.clientId,
          cells: {
            clientName: c.clientName,
            projectCount: c.projects.size,
            workedDays: c.workDates.size,
            entryCount: c.entryCount,
            workedMinutes: c.workedMinutes,
            billableMinutes: c.billableMinutes,
            amountCents: c.amountCents,
          },
        }));

      return {
        reportType: filter.reportType,
        title: meta.title,
        subtitle: meta.description,
        generatedAtIso: now.toISOString(),
        generatedAtLabel,
        timezone: settings.timezone,
        filter,
        appliedFilterSummary,
        columns: [
          { key: "clientName", label: "Cliente", kind: "text", align: "left" },
          {
            key: "projectCount",
            label: "Projetos",
            kind: "integer",
            align: "right",
          },
          {
            key: "workedDays",
            label: "Dias",
            kind: "integer",
            align: "right",
          },
          {
            key: "entryCount",
            label: "Lançamentos",
            kind: "integer",
            align: "right",
          },
          {
            key: "workedMinutes",
            label: "Horas totais",
            kind: "duration",
            align: "right",
          },
          {
            key: "billableMinutes",
            label: "Horas faturáveis",
            kind: "duration",
            align: "right",
          },
          {
            key: "amountCents",
            label: "Valor acumulado",
            kind: "money",
            align: "right",
          },
        ],
        rows,
        totalsRow: {
          clientName: `Total geral (${rows.length} cliente(s))`,
          projectCount: null,
          workedDays: workedDaysCount,
          entryCount: entries.length,
          workedMinutes: totalMinutes,
          billableMinutes,
          amountCents: totalCents,
        },
        summaryMetrics: [
          {
            label: "Clientes com horas",
            value: String(rows.length),
            kind: "integer",
            rawNumber: rows.length,
          },
          {
            label: "Horas trabalhadas",
            value: formatMinutesAsDuration(totalMinutes),
            kind: "duration",
            rawNumber: totalMinutes,
          },
          {
            label: "Horas faturáveis",
            value: formatMinutesAsDuration(billableMinutes),
            kind: "duration",
            rawNumber: billableMinutes,
          },
          {
            label: "Valor total",
            value: formatCentsAsBRL(totalCents),
            kind: "money",
            rawNumber: totalCents,
          },
        ],
        matchedRecordIds,
        totalMinutes,
        billableMinutes,
        totalCents,
        workedDaysCount,
      };
    }

    if (filter.reportType === "hours-by-project") {
      const projectMap = new Map<
        string,
        {
          projectId: string;
          projectName: string;
          clientName: string;
          workDates: Set<string>;
          entryCount: number;
          workedMinutes: number;
          billableMinutes: number;
          amountCents: number;
        }
      >();

      for (const entry of entries) {
        const snapshotItem = entry.billingItems[0];
        const clientName = snapshotItem
          ? snapshotItem.clientName
          : entry.project.client.name;
        const projectName = snapshotItem
          ? snapshotItem.projectName
          : entry.project.name;
        const effectiveCents = snapshotItem
          ? snapshotItem.amountCents
          : entry.amountCents;

        const current = projectMap.get(entry.project.id) ?? {
          projectId: entry.project.id,
          projectName,
          clientName,
          workDates: new Set<string>(),
          entryCount: 0,
          workedMinutes: 0,
          billableMinutes: 0,
          amountCents: 0,
        };
        current.workDates.add(entry.workDate);
        current.entryCount += 1;
        current.workedMinutes += entry.durationMinutes;
        if (entry.billable) {
          current.billableMinutes += entry.durationMinutes;
          current.amountCents += effectiveCents;
        }
        projectMap.set(entry.project.id, current);
      }

      const rows: ReportRow[] = Array.from(projectMap.values())
        .sort(
          (a, b) =>
            b.workedMinutes - a.workedMinutes ||
            a.projectName.localeCompare(b.projectName, "pt-BR"),
        )
        .map((p) => ({
          id: p.projectId,
          cells: {
            clientName: p.clientName,
            projectName: p.projectName,
            workedDays: p.workDates.size,
            entryCount: p.entryCount,
            workedMinutes: p.workedMinutes,
            billableMinutes: p.billableMinutes,
            amountCents: p.amountCents,
          },
        }));

      return {
        reportType: filter.reportType,
        title: meta.title,
        subtitle: meta.description,
        generatedAtIso: now.toISOString(),
        generatedAtLabel,
        timezone: settings.timezone,
        filter,
        appliedFilterSummary,
        columns: [
          { key: "clientName", label: "Cliente", kind: "text", align: "left" },
          { key: "projectName", label: "Projeto", kind: "text", align: "left" },
          {
            key: "workedDays",
            label: "Dias",
            kind: "integer",
            align: "right",
          },
          {
            key: "entryCount",
            label: "Lançamentos",
            kind: "integer",
            align: "right",
          },
          {
            key: "workedMinutes",
            label: "Horas totais",
            kind: "duration",
            align: "right",
          },
          {
            key: "billableMinutes",
            label: "Horas faturáveis",
            kind: "duration",
            align: "right",
          },
          {
            key: "amountCents",
            label: "Valor acumulado",
            kind: "money",
            align: "right",
          },
        ],
        rows,
        totalsRow: {
          clientName: `Total geral (${rows.length} projeto(s))`,
          projectName: "",
          workedDays: workedDaysCount,
          entryCount: entries.length,
          workedMinutes: totalMinutes,
          billableMinutes,
          amountCents: totalCents,
        },
        summaryMetrics: [
          {
            label: "Projetos com horas",
            value: String(rows.length),
            kind: "integer",
            rawNumber: rows.length,
          },
          {
            label: "Horas trabalhadas",
            value: formatMinutesAsDuration(totalMinutes),
            kind: "duration",
            rawNumber: totalMinutes,
          },
          {
            label: "Horas faturáveis",
            value: formatMinutesAsDuration(billableMinutes),
            kind: "duration",
            rawNumber: billableMinutes,
          },
          {
            label: "Valor total",
            value: formatCentsAsBRL(totalCents),
            kind: "money",
            rawNumber: totalCents,
          },
        ],
        matchedRecordIds,
        totalMinutes,
        billableMinutes,
        totalCents,
        workedDaysCount,
      };
    }

    // detailed-entries
    const rows: ReportRow[] = entries.map((entry) => {
      const snapshotItem = entry.billingItems[0];
      const clientName = snapshotItem
        ? snapshotItem.clientName
        : entry.project.client.name;
      const projectName = snapshotItem
        ? snapshotItem.projectName
        : entry.project.name;
      const description =
        (snapshotItem ? snapshotItem.description : entry.description) ?? "";
      const hourlyRateCents = snapshotItem
        ? snapshotItem.hourlyRateCents
        : entry.hourlyRateCents;
      const amountCents = snapshotItem
        ? snapshotItem.amountCents
        : entry.amountCents;

      return {
        id: entry.id,
        cells: {
          workDate: entry.workDate,
          clientName,
          projectName,
          description,
          mode: entry.mode === "INTERVAL" ? "Intervalo" : "Duração",
          billableLabel: entry.billable ? "Sim" : "Não",
          statusLabel: formatTimeEntryStatusPtBR(entry.status),
          durationMinutes: entry.durationMinutes,
          hourlyRateCents,
          amountCents,
        },
      };
    });

    return {
      reportType: filter.reportType,
      title: meta.title,
      subtitle: meta.description,
      generatedAtIso: now.toISOString(),
      generatedAtLabel,
      timezone: settings.timezone,
      filter,
      appliedFilterSummary,
      columns: [
        { key: "workDate", label: "Data", kind: "date", align: "left" },
        { key: "clientName", label: "Cliente", kind: "text", align: "left" },
        { key: "projectName", label: "Projeto", kind: "text", align: "left" },
        { key: "description", label: "Descrição", kind: "text", align: "left" },
        { key: "mode", label: "Modo", kind: "badge", align: "center" },
        {
          key: "billableLabel",
          label: "Faturável",
          kind: "badge",
          align: "center",
        },
        { key: "statusLabel", label: "Status", kind: "badge", align: "center" },
        {
          key: "durationMinutes",
          label: "Duração",
          kind: "duration",
          align: "right",
        },
        {
          key: "hourlyRateCents",
          label: "Tarifa/h",
          kind: "money",
          align: "right",
        },
        { key: "amountCents", label: "Valor", kind: "money", align: "right" },
      ],
      rows,
      totalsRow: {
        workDate: `Total (${entries.length} apontamento(s))`,
        clientName: "",
        projectName: "",
        description: "",
        mode: "",
        billableLabel: "",
        statusLabel: "",
        durationMinutes: totalMinutes,
        hourlyRateCents: null,
        amountCents: totalCents,
      },
      summaryMetrics: [
        {
          label: "Apontamentos",
          value: String(entries.length),
          kind: "integer",
          rawNumber: entries.length,
        },
        {
          label: "Dias trabalhados",
          value: String(workedDaysCount),
          kind: "integer",
          rawNumber: workedDaysCount,
        },
        {
          label: "Horas totais",
          value: formatMinutesAsDuration(totalMinutes),
          kind: "duration",
          rawNumber: totalMinutes,
        },
        {
          label: "Valor total",
          value: formatCentsAsBRL(totalCents),
          kind: "money",
          rawNumber: totalCents,
        },
      ],
      matchedRecordIds,
      totalMinutes,
      billableMinutes,
      totalCents,
      workedDaysCount,
    };
  }

  if (filter.reportType === "billable-values") {
    const billableFilter: ReportFilterState = {
      ...filter,
      billable: "BILLABLE",
    };
    const entries = await queryReportTimeEntries(database, billableFilter);
    assertWithinRowLimit(entries.length);

    const matchedRecordIds = entries.map((entry) => entry.id);
    const distinctWorkDates = new Set(entries.map((entry) => entry.workDate));

    const groupMap = new Map<
      string,
      {
        key: string;
        clientId: string;
        clientName: string;
        competence: string;
        billableMinutes: number;
        accumulatedCents: number;
        unbilledDraftCents: number;
        closedCents: number;
      }
    >();

    let totalBillableMinutes = 0;
    let totalAccumulatedCents = 0;
    let totalUnbilledCents = 0;
    let totalClosedCents = 0;

    for (const entry of entries) {
      const competence = entry.workDate.slice(0, 7); // YYYY-MM
      const [yStr, mStr] = competence.split("-");
      const competenceLabel = `${mStr}/${yStr}`;
      const snapshotItem = entry.billingItems[0];
      const clientId = entry.project.client.id;
      const clientName = snapshotItem
        ? snapshotItem.clientName
        : entry.project.client.name;
      const effectiveCents = snapshotItem
        ? snapshotItem.amountCents
        : entry.amountCents;
      const isClosed =
        entry.status === "BILLED" || entry.billingItems.length > 0;

      const mapKey = `${clientId}:${competence}`;
      const current = groupMap.get(mapKey) ?? {
        key: mapKey,
        clientId,
        clientName,
        competence: competenceLabel,
        billableMinutes: 0,
        accumulatedCents: 0,
        unbilledDraftCents: 0,
        closedCents: 0,
      };

      current.billableMinutes += entry.durationMinutes;
      current.accumulatedCents += effectiveCents;
      totalBillableMinutes += entry.durationMinutes;
      totalAccumulatedCents += effectiveCents;

      if (isClosed) {
        current.closedCents += effectiveCents;
        totalClosedCents += effectiveCents;
      } else {
        current.unbilledDraftCents += effectiveCents;
        totalUnbilledCents += effectiveCents;
      }

      groupMap.set(mapKey, current);
    }

    const rows: ReportRow[] = Array.from(groupMap.values())
      .sort(
        (a, b) =>
          b.accumulatedCents - a.accumulatedCents ||
          a.clientName.localeCompare(b.clientName, "pt-BR"),
      )
      .map((item) => ({
        id: item.key,
        cells: {
          clientName: item.clientName,
          competence: item.competence,
          billableMinutes: item.billableMinutes,
          accumulatedCents: item.accumulatedCents,
          unbilledDraftCents: item.unbilledDraftCents,
          closedCents: item.closedCents,
        },
      }));

    return {
      reportType: filter.reportType,
      title: meta.title,
      subtitle: meta.description,
      generatedAtIso: now.toISOString(),
      generatedAtLabel,
      timezone: settings.timezone,
      filter,
      appliedFilterSummary,
      columns: [
        { key: "clientName", label: "Cliente", kind: "text", align: "left" },
        {
          key: "competence",
          label: "Competência",
          kind: "text",
          align: "center",
        },
        {
          key: "billableMinutes",
          label: "Horas faturáveis",
          kind: "duration",
          align: "right",
        },
        {
          key: "accumulatedCents",
          label: "Valor acumulado",
          kind: "money",
          align: "right",
        },
        {
          key: "unbilledDraftCents",
          label: "A faturar (rascunho)",
          kind: "money",
          align: "right",
        },
        {
          key: "closedCents",
          label: "Fechado (congelado)",
          kind: "money",
          align: "right",
        },
      ],
      rows,
      totalsRow: {
        clientName: "Total consolidado",
        competence: "",
        billableMinutes: totalBillableMinutes,
        accumulatedCents: totalAccumulatedCents,
        unbilledDraftCents: totalUnbilledCents,
        closedCents: totalClosedCents,
      },
      summaryMetrics: [
        {
          label: "Horas faturáveis",
          value: formatMinutesAsDuration(totalBillableMinutes),
          kind: "duration",
          rawNumber: totalBillableMinutes,
        },
        {
          label: "Valor acumulado",
          value: formatCentsAsBRL(totalAccumulatedCents),
          kind: "money",
          rawNumber: totalAccumulatedCents,
        },
        {
          label: "A faturar (rascunho)",
          value: formatCentsAsBRL(totalUnbilledCents),
          kind: "money",
          rawNumber: totalUnbilledCents,
        },
        {
          label: "Fechado (congelado)",
          value: formatCentsAsBRL(totalClosedCents),
          kind: "money",
          rawNumber: totalClosedCents,
        },
      ],
      matchedRecordIds,
      totalMinutes: totalBillableMinutes,
      billableMinutes: totalBillableMinutes,
      totalCents: totalAccumulatedCents,
      workedDaysCount: distinctWorkDates.size,
    };
  }

  if (filter.reportType === "monthly-closings") {
    const periods = await queryReportBillingPeriods(database, filter);

    // Se um billingPeriodId específico foi solicitado, gera o demonstrativo detalhado de itens congelados daquela competência
    if (filter.billingPeriodId && periods.length === 1) {
      const period = periods[0]!;
      const { competenceLabel } = getCompetenceDateBounds(
        period.year,
        period.month,
      );
      const displayClientName =
        period.clientNameSnapshot ?? period.client.name;
      const itemsForStatement =
        period.status === "CLOSED"
          ? period.items.filter((i) => i.releasedAt === null)
          : period.items.filter((i) => i.revision === period.revision);

      assertWithinRowLimit(itemsForStatement.length);

      const activePayments = period.payments.filter(
        (p) => p.voidedAt === null && p.revision === period.revision,
      );
      const paidCents =
        period.status === "CLOSED"
          ? activePayments.reduce((acc, p) => acc + p.amountCents, 0)
          : 0;
      const balanceCents =
        period.status === "CLOSED"
          ? Math.max(0, period.totalCents - paidCents)
          : 0;

      const rows: ReportRow[] = itemsForStatement.map((item) => ({
        id: item.id,
        cells: {
          workDate: item.workDate,
          clientName: item.clientName,
          projectName: item.projectName,
          description: item.description ?? "",
          revision: `#${item.revision}`,
          durationMinutes: item.durationMinutes,
          hourlyRateCents: item.hourlyRateCents,
          amountCents: item.amountCents,
        },
      }));

      const distinctDates = new Set(itemsForStatement.map((i) => i.workDate));

      return {
        reportType: filter.reportType,
        title: `Demonstrativo de Fechamento — ${displayClientName} (${competenceLabel})`,
        subtitle: `Revisão #${period.revision} • Status: ${formatBillingPeriodStatusLabel(period.status)}`,
        generatedAtIso: now.toISOString(),
        generatedAtLabel,
        timezone: settings.timezone,
        filter,
        appliedFilterSummary: [
          ...appliedFilterSummary,
          `Competência: ${competenceLabel} (Revisão #${period.revision})`,
        ],
        columns: [
          { key: "workDate", label: "Data", kind: "date", align: "left" },
          { key: "clientName", label: "Cliente", kind: "text", align: "left" },
          { key: "projectName", label: "Projeto", kind: "text", align: "left" },
          {
            key: "description",
            label: "Descrição",
            kind: "text",
            align: "left",
          },
          {
            key: "revision",
            label: "Revisão",
            kind: "badge",
            align: "center",
          },
          {
            key: "durationMinutes",
            label: "Duração",
            kind: "duration",
            align: "right",
          },
          {
            key: "hourlyRateCents",
            label: "Tarifa/h",
            kind: "money",
            align: "right",
          },
          { key: "amountCents", label: "Valor", kind: "money", align: "right" },
        ],
        rows,
        totalsRow: {
          workDate: `Total (${rows.length} item(ns))`,
          clientName: "",
          projectName: "",
          description: "",
          revision: `#${period.revision}`,
          durationMinutes: period.totalMinutes,
          hourlyRateCents: null,
          amountCents: period.totalCents,
        },
        summaryMetrics: [
          {
            label: "Horas fechadas",
            value: formatMinutesAsDuration(period.totalMinutes),
            kind: "duration",
            rawNumber: period.totalMinutes,
          },
          {
            label: "Valor fechado",
            value: formatCentsAsBRL(period.totalCents),
            kind: "money",
            rawNumber: period.totalCents,
          },
          {
            label: "Recebido",
            value: formatCentsAsBRL(paidCents),
            kind: "money",
            rawNumber: paidCents,
          },
          {
            label: "Saldo em aberto",
            value: formatCentsAsBRL(balanceCents),
            kind: "money",
            rawNumber: balanceCents,
          },
        ],
        matchedRecordIds: itemsForStatement.map((i) => i.id),
        totalMinutes: period.totalMinutes,
        billableMinutes: period.totalMinutes,
        totalCents: period.totalCents,
        workedDaysCount: distinctDates.size,
      };
    }

    const filteredPeriods = periods.filter((period) => {
      const activePayments = period.payments.filter(
        (p) => p.voidedAt === null && p.revision === period.revision,
      );
      const paidCents =
        period.status === "CLOSED"
          ? activePayments.reduce((acc, p) => acc + p.amountCents, 0)
          : 0;
      const derivedPayment = derivePaymentStatus(
        period.status,
        period.totalCents,
        paidCents,
      );
      if (
        filter.paymentStatus !== "ALL" &&
        derivedPayment !== filter.paymentStatus
      ) {
        return false;
      }
      return true;
    });

    assertWithinRowLimit(filteredPeriods.length);

    let totalClosedMinutes = 0;
    let totalClosedCents = 0;
    let totalPaidCents = 0;
    let totalBalanceCents = 0;

    const rows: ReportRow[] = filteredPeriods.map((period) => {
      const { competenceLabel } = getCompetenceDateBounds(
        period.year,
        period.month,
      );
      const displayClientName =
        period.clientNameSnapshot ?? period.client.name;
      const activePayments = period.payments.filter(
        (p) => p.voidedAt === null && p.revision === period.revision,
      );
      const paidCents =
        period.status === "CLOSED"
          ? activePayments.reduce((acc, p) => acc + p.amountCents, 0)
          : 0;
      const balanceCents =
        period.status === "CLOSED"
          ? Math.max(0, period.totalCents - paidCents)
          : 0;
      const paymentStatus = derivePaymentStatus(
        period.status,
        period.totalCents,
        paidCents,
      );

      if (period.status === "CLOSED") {
        totalClosedMinutes += period.totalMinutes;
        totalClosedCents += period.totalCents;
        totalPaidCents += paidCents;
        totalBalanceCents += balanceCents;
      }

      return {
        id: period.id,
        cells: {
          competence: competenceLabel,
          clientName: displayClientName,
          revision: `#${period.revision}`,
          statusLabel: formatBillingPeriodStatusLabel(period.status),
          paymentStatusLabel: formatPaymentStatusLabel(paymentStatus),
          totalMinutes: period.totalMinutes,
          totalCents: period.totalCents,
          paidCents,
          balanceCents,
        },
      };
    });

    return {
      reportType: filter.reportType,
      title: meta.title,
      subtitle: meta.description,
      generatedAtIso: now.toISOString(),
      generatedAtLabel,
      timezone: settings.timezone,
      filter,
      appliedFilterSummary,
      columns: [
        {
          key: "competence",
          label: "Competência",
          kind: "text",
          align: "center",
        },
        {
          key: "clientName",
          label: "Cliente (snapshot)",
          kind: "text",
          align: "left",
        },
        { key: "revision", label: "Revisão", kind: "badge", align: "center" },
        {
          key: "statusLabel",
          label: "Situação",
          kind: "badge",
          align: "center",
        },
        {
          key: "paymentStatusLabel",
          label: "Pagamento",
          kind: "badge",
          align: "center",
        },
        {
          key: "totalMinutes",
          label: "Horas",
          kind: "duration",
          align: "right",
        },
        {
          key: "totalCents",
          label: "Total fechado",
          kind: "money",
          align: "right",
        },
        { key: "paidCents", label: "Recebido", kind: "money", align: "right" },
        {
          key: "balanceCents",
          label: "Saldo em aberto",
          kind: "money",
          align: "right",
        },
      ],
      rows,
      totalsRow: {
        competence: `Total (${rows.length} competência(s))`,
        clientName: "",
        revision: "",
        statusLabel: "",
        paymentStatusLabel: "",
        totalMinutes: totalClosedMinutes,
        totalCents: totalClosedCents,
        paidCents: totalPaidCents,
        balanceCents: totalBalanceCents,
      },
      summaryMetrics: [
        {
          label: "Horas fechadas ativas",
          value: formatMinutesAsDuration(totalClosedMinutes),
          kind: "duration",
          rawNumber: totalClosedMinutes,
        },
        {
          label: "Total fechado ativo",
          value: formatCentsAsBRL(totalClosedCents),
          kind: "money",
          rawNumber: totalClosedCents,
        },
        {
          label: "Total recebido",
          value: formatCentsAsBRL(totalPaidCents),
          kind: "money",
          rawNumber: totalPaidCents,
        },
        {
          label: "Saldo em aberto",
          value: formatCentsAsBRL(totalBalanceCents),
          kind: "money",
          rawNumber: totalBalanceCents,
        },
      ],
      matchedRecordIds: filteredPeriods.map((p) => p.id),
      totalMinutes: totalClosedMinutes,
      billableMinutes: totalClosedMinutes,
      totalCents: totalClosedCents,
      workedDaysCount: 0,
    };
  }

  // payments-and-balances
  const rawPayments = await queryReportPayments(database, filter);
  const { startDate, endDate } = resolveEffectiveDateBounds(filter);

  const filteredPayments = rawPayments.filter((payment) => {
    const paidDate = payment.paidAt.toISOString().slice(0, 10);
    if (filter.paymentFilterMode === "PAID_AT") {
      if (startDate && paidDate < startDate) {
        return false;
      }
      if (endDate && paidDate > endDate) {
        return false;
      }
    } else {
      // COMPETENCE mode with startDate/endDate fallback
      const compDate = `${payment.billingPeriod.year}-${String(payment.billingPeriod.month).padStart(2, "0")}-01`;
      if (startDate && compDate < `${startDate.slice(0, 7)}-01`) {
        return false;
      }
      if (endDate && compDate > `${endDate.slice(0, 7)}-31`) {
        return false;
      }
    }
    return true;
  });

  assertWithinRowLimit(filteredPayments.length);

  let activePaidCents = 0;
  let voidedPaidCents = 0;

  const rows: ReportRow[] = filteredPayments.map((payment) => {
    const paidDate = payment.paidAt.toISOString().slice(0, 10);
    const period = payment.billingPeriod;
    const { competenceLabel } = getCompetenceDateBounds(
      period.year,
      period.month,
    );
    const displayClientName =
      period.clientNameSnapshot ?? period.client.name;
    const isVoided = payment.voidedAt !== null;

    if (isVoided) {
      voidedPaidCents += payment.amountCents;
    } else {
      activePaidCents += payment.amountCents;
    }

    const periodActivePaid =
      period.status === "CLOSED"
        ? period.payments
            .filter((p) => p.revision === period.revision)
            .reduce((acc, p) => acc + p.amountCents, 0)
        : 0;
    const periodBalanceCents =
      period.status === "CLOSED"
        ? Math.max(0, period.totalCents - periodActivePaid)
        : 0;

    return {
      id: payment.id,
      cells: {
        paidDate,
        clientName: displayClientName,
        competence: competenceLabel,
        revision: `#${payment.revision}`,
        method: payment.method ?? "Não informado",
        note: payment.note ?? "",
        statusLabel: isVoided ? "Estornado" : "Ativo",
        amountCents: payment.amountCents,
        periodBalanceCents,
      },
    };
  });

  return {
    reportType: filter.reportType,
    title: meta.title,
    subtitle: meta.description,
    generatedAtIso: now.toISOString(),
    generatedAtLabel,
    timezone: settings.timezone,
    filter,
    appliedFilterSummary,
    columns: [
      {
        key: "paidDate",
        label: "Data pagamento",
        kind: "date",
        align: "left",
      },
      { key: "clientName", label: "Cliente", kind: "text", align: "left" },
      {
        key: "competence",
        label: "Competência",
        kind: "text",
        align: "center",
      },
      { key: "revision", label: "Revisão", kind: "badge", align: "center" },
      { key: "method", label: "Método", kind: "text", align: "left" },
      { key: "note", label: "Observação", kind: "text", align: "left" },
      { key: "statusLabel", label: "Situação", kind: "badge", align: "center" },
      {
        key: "amountCents",
        label: "Valor pagamento",
        kind: "money",
        align: "right",
      },
      {
        key: "periodBalanceCents",
        label: "Saldo competência",
        kind: "money",
        align: "right",
      },
    ],
    rows,
    totalsRow: {
      paidDate: `Total ativo (${filteredPayments.filter((p) => p.voidedAt === null).length} pagamento(s))`,
      clientName: "",
      competence: "",
      revision: "",
      method: "",
      note:
        voidedPaidCents > 0
          ? `(Ignora ${formatCentsAsBRL(voidedPaidCents)} estornado(s))`
          : "",
      statusLabel: "Ativos",
      amountCents: activePaidCents,
      periodBalanceCents: null,
    },
    summaryMetrics: [
      {
        label: "Recebido ativo",
        value: formatCentsAsBRL(activePaidCents),
        kind: "money",
        rawNumber: activePaidCents,
      },
      {
        label: "Estornado (não somado)",
        value: formatCentsAsBRL(voidedPaidCents),
        kind: "money",
        rawNumber: voidedPaidCents,
      },
      {
        label: "Pagamentos ativos",
        value: String(
          filteredPayments.filter((p) => p.voidedAt === null).length,
        ),
        kind: "integer",
        rawNumber: filteredPayments.filter((p) => p.voidedAt === null).length,
      },
      {
        label: "Pagamentos estornados",
        value: String(
          filteredPayments.filter((p) => p.voidedAt !== null).length,
        ),
        kind: "integer",
        rawNumber: filteredPayments.filter((p) => p.voidedAt !== null).length,
      },
    ],
    matchedRecordIds: filteredPayments.map((p) => p.id),
    totalMinutes: 0,
    billableMinutes: 0,
    totalCents: activePaidCents,
    workedDaysCount: 0,
  };
}
