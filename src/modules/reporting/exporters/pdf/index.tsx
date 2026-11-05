import { inflateSync } from "node:zlib";
import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatReportCellForDisplay } from "../csv";
import type { ReportColumn, ReportDataset } from "../../types";

// Evita hifenização em inglês sobre termos em português (pt-BR)
Font.registerHyphenationCallback((word) => [word]);

function normalizePdfText(value: string): string {
  return value.replace(/\u00A0/g, " ");
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 42,
    paddingHorizontal: 28,
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  headerContainer: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  brandText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
    textTransform: "uppercase",
  },
  generatedText: {
    fontSize: 7.5,
    color: "#64748b",
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 8.5,
    color: "#475569",
    marginBottom: 4,
  },
  filterBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginTop: 4,
  },
  filterText: {
    fontSize: 7.5,
    color: "#334155",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: "22%",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 7,
  },
  metricLabel: {
    fontSize: 7,
    color: "#64748b",
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 2,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    minHeight: 20,
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    minHeight: 18,
    alignItems: "center",
  },
  tableTotalsRow: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    minHeight: 20,
    alignItems: "center",
  },
  cellHeader: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#334155",
  },
  cellBody: {
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    fontSize: 7.5,
    color: "#0f172a",
  },
  cellTotal: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  emptyBox: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 9,
    color: "#64748b",
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 4,
    fontSize: 7,
    color: "#64748b",
  },
});

function getColumnFlex(col: ReportColumn): number {
  if (col.key === "description" || col.key === "note") {
    return 2.4;
  }
  if (col.key === "clientName" || col.key === "projectName") {
    return 1.6;
  }
  return 1;
}

export function ReportPdfDocument({ dataset }: { dataset: ReportDataset }) {
  const isWideTable = dataset.columns.length >= 8;

  return (
    <Document
      title={normalizePdfText(dataset.title)}
      author="HoraFlow"
      subject={normalizePdfText(dataset.subtitle)}
      keywords={normalizePdfText(
        [
          dataset.reportType,
          `rows:${dataset.rows.length}`,
          `minutes:${dataset.totalMinutes}`,
          `cents:${dataset.totalCents}`,
          ...dataset.appliedFilterSummary,
        ].join("; "),
      )}
    >
      <Page
        size="A4"
        orientation={isWideTable ? "landscape" : "portrait"}
        style={styles.page}
        wrap
      >
        {/* Cabeçalho repetível */}
        <View style={styles.headerContainer} fixed>
          <View style={styles.brandRow}>
            <Text style={styles.brandText}>HoraFlow • Relatório Oficial</Text>
            <Text style={styles.generatedText}>
              Gerado em: {normalizePdfText(dataset.generatedAtLabel)}
            </Text>
          </View>
          <Text style={styles.title}>{normalizePdfText(dataset.title)}</Text>
          <Text style={styles.subtitle}>
            {normalizePdfText(dataset.subtitle)}
          </Text>
          <View style={styles.filterBox}>
            <Text style={styles.filterText}>
              Filtros:{" "}
              {normalizePdfText(dataset.appliedFilterSummary.join(" | "))}
            </Text>
          </View>
        </View>

        {/* Indicadores de resumo */}
        {dataset.summaryMetrics.length > 0 ? (
          <View style={styles.metricsGrid}>
            {dataset.summaryMetrics.map((metric) => (
              <View key={metric.label} style={styles.metricCard}>
                <Text style={styles.metricLabel}>
                  {normalizePdfText(metric.label)}
                </Text>
                <Text style={styles.metricValue}>
                  {normalizePdfText(metric.value)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Tabela ou Estado Vazio */}
        {dataset.rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              Nenhum registro encontrado para os filtros informados.
            </Text>
          </View>
        ) : (
          <View style={styles.table}>
            {/* Cabeçalho repetível da tabela */}
            <View style={styles.tableHeaderRow} fixed>
              {dataset.columns.map((col) => (
                <Text
                  key={col.key}
                  style={[
                    styles.cellHeader,
                    {
                      flex: getColumnFlex(col),
                      textAlign: col.align ?? "left",
                    },
                  ]}
                >
                  {normalizePdfText(col.label)}
                </Text>
              ))}
            </View>

            {/* Linhas de dados com quebra de página controlada */}
            {dataset.rows.map((row) => (
              <View key={row.id} style={styles.tableRow} wrap={false}>
                {dataset.columns.map((col) => {
                  const formatted = formatReportCellForDisplay(
                    row.cells[col.key] ?? null,
                    col,
                  );
                  return (
                    <Text
                      key={col.key}
                      style={[
                        styles.cellBody,
                        {
                          flex: getColumnFlex(col),
                          textAlign: col.align ?? "left",
                        },
                      ]}
                    >
                      {normalizePdfText(formatted)}
                    </Text>
                  );
                })}
              </View>
            ))}

            {/* Linha de totais */}
            {dataset.totalsRow ? (
              <View style={styles.tableTotalsRow} wrap={false}>
                {dataset.columns.map((col) => {
                  const formatted = formatReportCellForDisplay(
                    dataset.totalsRow?.[col.key] ?? null,
                    col,
                  );
                  return (
                    <Text
                      key={col.key}
                      style={[
                        styles.cellTotal,
                        {
                          flex: getColumnFlex(col),
                          textAlign: col.align ?? "left",
                        },
                      ]}
                    >
                      {normalizePdfText(formatted)}
                    </Text>
                  );
                })}
              </View>
            ) : null}
          </View>
        )}

        {/* Rodapé com paginação */}
        <View style={styles.footer} fixed>
          <Text>
            HoraFlow • {normalizePdfText(dataset.title)} • Fuso:{" "}
            {dataset.timezone}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/**
 * Renderiza o relatório em um `Buffer` PDF válido no servidor Node usando `@react-pdf/renderer`.
 */
export async function exportReportToPdf(
  dataset: ReportDataset,
): Promise<Buffer> {
  const buffer = await renderToBuffer(<ReportPdfDocument dataset={dataset} />);
  return Buffer.from(buffer);
}

/**
 * Inspeciona um buffer PDF real gerado pelo `@react-pdf/renderer`, extraindo:
 * - assinatura cabeçalho `%PDF-1.`
 * - quantidade de páginas (`/Type /Page`)
 * - texto decodificado dos streams FlateDecode e dicionários do PDF
 */
export function inspectGeneratedPdfBuffer(pdfBuffer: Buffer): {
  isValidPdfHeader: boolean;
  pageCount: number;
  extractedText: string;
} {
  const rawLatin1 = pdfBuffer.toString("latin1");
  const isValidPdfHeader = rawLatin1.startsWith("%PDF-");
  const pageMatches = rawLatin1.match(/\/Type\s*\/Page\b/g);
  const pageCount = pageMatches ? pageMatches.length : 0;

  const decodedChunks: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null = streamRegex.exec(rawLatin1);

  while (match !== null) {
    const streamContent = match[1];
    if (streamContent) {
      try {
        const compressed = Buffer.from(streamContent, "latin1");
        const inflated = inflateSync(compressed).toString("latin1");

        // Decodifica sequências hexadecimais `<486f7261...>` emitidas pelo PDFKit em operadores TJ/Tj
        const hexMatches = inflated.match(/<([0-9A-Fa-f]{2,})>/g);
        if (hexMatches) {
          const decodedHex = hexMatches
            .map((hexToken) => {
              const cleanHex = hexToken.slice(1, -1);
              return Buffer.from(cleanHex, "hex").toString("latin1");
            })
            .join("");
          decodedChunks.push(decodedHex);
        }
      } catch {
        // Stream não comprimido com zlib padrão; ignora binário bruto
      }
    }
    match = streamRegex.exec(rawLatin1);
  }

  return {
    isValidPdfHeader,
    pageCount,
    extractedText: decodedChunks.join("\n"),
  };
}
