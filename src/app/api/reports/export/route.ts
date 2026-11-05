import { type NextRequest, NextResponse } from "next/server";
import { DomainError, NotFoundError, ValidationError } from "@/lib/errors";
import { evaluateRequestPolicy } from "@/lib/request-policy";
import { exportReportToCsv } from "@/modules/reporting/exporters/csv";
import { exportReportToPdf } from "@/modules/reporting/exporters/pdf";
import { exportReportToXlsx } from "@/modules/reporting/exporters/xlsx";
import {
  parseExportFormat,
  type RawReportFilterInput,
} from "@/modules/reporting/schema";
import { generateReportDataset } from "@/modules/reporting/service";
import type { ExportFormat, ReportDataset } from "@/modules/reporting/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function sanitizeFilenameSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function buildSafeExportFilename(
  dataset: ReportDataset,
  format: ExportFormat,
): string {
  const reportSlug = sanitizeFilenameSlug(dataset.reportType) || "relatorio";
  const datePart = sanitizeFilenameSlug(dataset.generatedAtIso.slice(0, 10));
  const competencePart =
    dataset.filter.year !== null && dataset.filter.month !== null
      ? `-${dataset.filter.year}-${String(dataset.filter.month).padStart(2, "0")}`
      : "";

  return `horaflow-${reportSlug}${competencePart}-${datePart}.${format}`;
}

export async function GET(request: NextRequest) {
  const decision = evaluateRequestPolicy({
    method: request.method,
    headers: request.headers,
  });

  if (!decision.allowed) {
    return NextResponse.json(
      { error: "request_rejected" },
      {
        status: 403,
        headers: {
          ...NO_STORE_HEADERS,
          Vary: "Host, Origin, X-Forwarded-Host, Forwarded",
        },
      },
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    // Nunca aceitar caminhos de arquivo vindos do cliente
    if (
      searchParams.has("file") ||
      searchParams.has("path") ||
      searchParams.has("filepath")
    ) {
      throw new ValidationError(
        "Parâmetros de caminho de arquivo não são permitidos na exportação.",
      );
    }

    const format = parseExportFormat(searchParams.get("format"));

    const rawFilter: RawReportFilterInput = {
      reportType: searchParams.get("reportType"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      clientId: searchParams.get("clientId"),
      projectId: searchParams.get("projectId"),
      billable: searchParams.get("billable"),
      entryStatus: searchParams.get("entryStatus"),
      year: searchParams.get("year"),
      month: searchParams.get("month"),
      billingPeriodId: searchParams.get("billingPeriodId"),
      periodStatus: searchParams.get("periodStatus"),
      paymentStatus: searchParams.get("paymentStatus"),
      paymentFilterMode: searchParams.get("paymentFilterMode"),
      includeVoidedPayments: searchParams.get("includeVoidedPayments"),
    };

    const dataset = await generateReportDataset(rawFilter);
    const filename = buildSafeExportFilename(dataset, format);
    const contentDisposition = `attachment; filename="${filename}"`;

    if (format === "csv") {
      const csvContent = exportReportToCsv(dataset);
      return new NextResponse(Buffer.from(csvContent, "utf-8"), {
        status: 200,
        headers: {
          ...NO_STORE_HEADERS,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": contentDisposition,
        },
      });
    }

    if (format === "xlsx") {
      const xlsxBuffer = await exportReportToXlsx(dataset);
      return new NextResponse(new Uint8Array(xlsxBuffer), {
        status: 200,
        headers: {
          ...NO_STORE_HEADERS,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": contentDisposition,
        },
      });
    }

    const pdfBuffer = await exportReportToPdf(dataset);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition,
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: error.message,
          fieldErrors: error.fieldErrors,
        },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    if (error instanceof DomainError) {
      const status = error instanceof NotFoundError ? 404 : 400;
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
        },
        { status, headers: NO_STORE_HEADERS },
      );
    }

    console.error("[reports/export] Falha ao gerar exportação:", error);
    return NextResponse.json(
      {
        error: "export_failed",
        message:
          "Não foi possível gerar o arquivo de exportação no momento. Tente novamente.",
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
