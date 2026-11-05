"use client";

import { useActionState, useId, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Upload,
} from "lucide-react";
import Link from "next/link";
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
import { formatMinutesAsDuration } from "@/lib/duration";
import { formatCentsAsBRL } from "@/lib/money";
import {
  confirmImportAction,
  updateImportMappingAction,
  uploadImportFileAction,
} from "../actions";
import { initialImportActionState } from "../action-state";
import type { ImportPreviewResult } from "../types";

type ImportWizardProps = {
  initialPreview: ImportPreviewResult | null;
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; clientId: string }>;
};

export function ImportWizard({
  initialPreview,
  clients,
  projects,
}: ImportWizardProps) {
  const activeBatch = initialPreview;

  // Estados dos formulários Server Actions
  const [uploadState, uploadAction, isUploadPending] = useActionState(
    uploadImportFileAction,
    initialImportActionState,
  );

  const [mappingState, mappingAction, isMappingPending] = useActionState(
    updateImportMappingAction,
    initialImportActionState,
  );

  const [confirmState, confirmAction, isConfirmPending] = useActionState(
    async (prev: typeof initialImportActionState, formData: FormData) => {
      const res = await confirmImportAction(prev, formData);
      return res;
    },
    initialImportActionState,
  );

  // Filtro de projetos pelo cliente selecionado no mapeamento
  const defaultClient = clients[0]?.id ?? "";
  const [selectedClientId, setSelectedClientId] = useState<string>(
    activeBatch?.mapping?.defaultClientId || defaultClient,
  );

  const filteredProjects = projects.filter(
    (p) => p.clientId === selectedClientId,
  );
  const defaultProject = filteredProjects[0]?.id ?? "";

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    activeBatch?.mapping?.defaultProjectId || defaultProject,
  );

  const [skipInvalid, setSkipInvalid] = useState(false);
  const [importDuplicates, setImportDuplicates] = useState(false);

  const fileInputId = useId();
  const dateColId = useId();
  const durationColId = useId();
  const descColId = useId();
  const billableColId = useId();
  const dateFormatId = useId();
  const durationFormatId = useId();
  const clientIdId = useId();
  const projectIdId = useId();
  const sheetNameId = useId();

  // Se a importação acabou de ser confirmada com sucesso:
  if (confirmState.status === "success") {
    return (
      <Card data-testid="import-success-card">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            <CardTitle>Importação concluída com sucesso!</CardTitle>
          </div>
          <CardDescription>{confirmState.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground">
            Os apontamentos importados foram adicionados ao banco de dados com
            status <strong>Rascunho (DRAFT)</strong> e vinculados ao lote de
            importação para rastreabilidade auditável.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/timesheet"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-strong"
              data-testid="link-after-import-timesheet"
            >
              Ver em Horas
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-4 text-xs font-medium text-foreground transition-colors hover:bg-surface-elevated"
            >
              Ir para o Dashboard
            </Link>
            <Link
              href="/import"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Importar outro arquivo
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="import-wizard">
      {/* Etapa 1: Upload */}
      <Card data-testid="import-upload-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
            1. Envio de arquivo (CSV ou XLSX)
          </CardTitle>
          <CardDescription>
            Selecione uma planilha XLSX ou arquivo CSV de até 5 MiB (máximo de
            5.000 linhas). O conteúdo é processado com validação de tipos e
            proteção contra injeção de fórmulas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={uploadAction}
            className="space-y-4"
            data-testid="import-upload-form"
          >
            {uploadState.status === "error" && uploadState.message ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro no envio</AlertTitle>
                <AlertDescription>{uploadState.message}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor={fileInputId}>Arquivo CSV ou XLSX</Label>
              <Input
                id={fileInputId}
                name="file"
                type="file"
                accept=".csv,.xlsx,.txt"
                required
                disabled={isUploadPending}
              />
              <p className="text-xs text-muted">
                Formatos aceitos: CSV (delimitado por ponto e vírgula ou
                vírgula, UTF-8 com ou sem BOM) e XLSX (Excel 2007+).
              </p>
            </div>

            <Button
              type="submit"
              disabled={isUploadPending}
              data-testid="upload-file-button"
            >
              {isUploadPending ? "Enviando e analisando..." : "Enviar arquivo"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Etapa 2 e 3: Mapeamento, Prévia e Confirmação */}
      {activeBatch ? (
        <>
          <Card data-testid="import-mapping-card">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {activeBatch.format === "xlsx" ? (
                      <FileSpreadsheet
                        className="h-5 w-5 text-primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <FileText
                        className="h-5 w-5 text-primary"
                        aria-hidden="true"
                      />
                    )}
                    2. Mapeamento de colunas — {activeBatch.fileName}
                  </CardTitle>
                  <CardDescription>
                    Associe as colunas detectadas no arquivo aos campos do
                    HoraFlow e escolha o cliente e projeto de destino.
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {activeBatch.totalRows} linha(s) detectada(s)
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <form
                action={mappingAction}
                className="space-y-4"
                data-testid="import-mapping-form"
              >
                <input type="hidden" name="batchId" value={activeBatch.batchId} />

                {mappingState.status === "error" && mappingState.message ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Erro no mapeamento</AlertTitle>
                    <AlertDescription>{mappingState.message}</AlertDescription>
                  </Alert>
                ) : null}

                {activeBatch.sheets.length > 1 ? (
                  <div className="space-y-1.5 max-w-sm">
                    <Label htmlFor={sheetNameId}>
                      Aba da planilha (Worksheet)
                    </Label>
                    <Select
                      id={sheetNameId}
                      name="sheetName"
                      defaultValue={activeBatch.activeSheet}
                    >
                      {activeBatch.sheets.map((sheet) => (
                        <option key={sheet} value={sheet}>
                          {sheet}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Coluna de Data */}
                  <div className="space-y-1.5">
                    <Label htmlFor={dateColId}>
                      Coluna de Data <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      id={dateColId}
                      name="dateColumn"
                      defaultValue={
                        activeBatch.mapping.dateColumn ||
                        activeBatch.detectedColumns.find((c) =>
                          /data|date|dia/i.test(c),
                        ) ||
                        activeBatch.detectedColumns[0] ||
                        ""
                      }
                      required
                    >
                      <option value="">Selecione a coluna</option>
                      {activeBatch.detectedColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Coluna de Duração */}
                  <div className="space-y-1.5">
                    <Label htmlFor={durationColId}>
                      Coluna de Duração{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      id={durationColId}
                      name="durationColumn"
                      defaultValue={
                        activeBatch.mapping.durationColumn ||
                        activeBatch.detectedColumns.find((c) =>
                          /dura[çc]|horas|tempo|duration|hours/i.test(c),
                        ) ||
                        activeBatch.detectedColumns[1] ||
                        ""
                      }
                      required
                    >
                      <option value="">Selecione a coluna</option>
                      {activeBatch.detectedColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Coluna de Descrição */}
                  <div className="space-y-1.5">
                    <Label htmlFor={descColId}>Coluna de Descrição</Label>
                    <Select
                      id={descColId}
                      name="descriptionColumn"
                      defaultValue={
                        activeBatch.mapping.descriptionColumn ||
                        activeBatch.detectedColumns.find((c) =>
                          /descri|tarefa|atividade|memo|note/i.test(c),
                        ) ||
                        ""
                      }
                    >
                      <option value="">(Opcional) Nenhuma coluna</option>
                      {activeBatch.detectedColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Coluna Faturável */}
                  <div className="space-y-1.5">
                    <Label htmlFor={billableColId}>Coluna Faturável</Label>
                    <Select
                      id={billableColId}
                      name="billableColumn"
                      defaultValue={
                        activeBatch.mapping.billableColumn ||
                        activeBatch.detectedColumns.find((c) =>
                          /fatur|billable/i.test(c),
                        ) ||
                        ""
                      }
                    >
                      <option value="">(Opcional) Todas faturáveis</option>
                      {activeBatch.detectedColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2">
                  {/* Formato de Data */}
                  <div className="space-y-1.5">
                    <Label htmlFor={dateFormatId}>Interpretação da Data</Label>
                    <Select
                      id={dateFormatId}
                      name="dateFormat"
                      defaultValue={activeBatch.mapping.dateFormat || "auto"}
                    >
                      <option value="auto">Detecção automática</option>
                      <option value="DD/MM/YYYY">
                        Dia/Mês/Ano (DD/MM/AAAA)
                      </option>
                      <option value="YYYY-MM-DD">
                        Ano-Mês-Dia (AAAA-MM-DD)
                      </option>
                    </Select>
                  </div>

                  {/* Formato de Duração */}
                  <div className="space-y-1.5">
                    <Label htmlFor={durationFormatId}>
                      Interpretação da Duração
                    </Label>
                    <Select
                      id={durationFormatId}
                      name="durationFormat"
                      defaultValue={
                        activeBatch.mapping.durationFormat || "auto"
                      }
                    >
                      <option value="auto">
                        Automático (HH:mm ou fração de dia)
                      </option>
                      <option value="HH:mm">Texto em formato HH:mm</option>
                      <option value="decimal_hours">
                        Horas decimais (ex: 5,5 -&gt; 05:30)
                      </option>
                    </Select>
                  </div>

                  {/* Cliente de Destino */}
                  <div className="space-y-1.5">
                    <Label htmlFor={clientIdId}>
                      Cliente de Destino{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      id={clientIdId}
                      name="defaultClientId"
                      value={selectedClientId}
                      onChange={(e) => {
                        const newClientId = e.target.value;
                        setSelectedClientId(newClientId);
                        const firstProj = projects.find(
                          (p) => p.clientId === newClientId,
                        );
                        setSelectedProjectId(firstProj?.id || "");
                      }}
                      required
                    >
                      <option value="">Selecione um cliente</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Projeto de Destino */}
                  <div className="space-y-1.5">
                    <Label htmlFor={projectIdId}>
                      Projeto de Destino{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      id={projectIdId}
                      name="defaultProjectId"
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      required
                    >
                      <option value="">Selecione um projeto</option>
                      {filteredProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={isMappingPending}
                    data-testid="generate-preview-button"
                  >
                    {isMappingPending
                      ? "Processando prévia..."
                      : "Gerar / Atualizar prévia"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Tabela de Prévia Validada */}
          {activeBatch.rows.length > 0 ? (
            <Card data-testid="import-preview-results-card">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Prévia validada dos apontamentos</CardTitle>
                    <CardDescription>
                      Inspecione as linhas antes de gravar no banco de dados.
                      Linhas com erros são sinalizadas individualmente.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">
                      {activeBatch.validRows} válida(s)
                    </Badge>
                    {activeBatch.invalidRows > 0 ? (
                      <Badge variant="destructive">
                        {activeBatch.invalidRows} inválida(s)
                      </Badge>
                    ) : null}
                    {activeBatch.duplicateRows > 0 ? (
                      <Badge variant="secondary">
                        {activeBatch.duplicateRows} possível(is) duplicada(s)
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Indicadores Consolidados da Prévia */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-border bg-surface p-3.5">
                    <p className="text-xs text-muted">Horas totais válidas</p>
                    <p
                      className="mt-1 font-mono text-xl font-bold text-foreground"
                      data-testid="preview-total-duration"
                    >
                      {formatMinutesAsDuration(activeBatch.totalMinutes)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-surface p-3.5">
                    <p className="text-xs text-muted">Valor faturável total</p>
                    <p
                      className="mt-1 font-mono text-xl font-bold text-primary"
                      data-testid="preview-total-amount"
                    >
                      {formatCentsAsBRL(activeBatch.totalCents)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-surface p-3.5">
                    <p className="text-xs text-muted">Cliente destino</p>
                    <p className="mt-1 text-sm font-semibold text-foreground truncate">
                      {activeBatch.rows[0]?.clientName || "—"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-surface p-3.5">
                    <p className="text-xs text-muted">Projeto destino</p>
                    <p className="mt-1 text-sm font-semibold text-foreground truncate">
                      {activeBatch.rows[0]?.projectName || "—"} (
                      {formatCentsAsBRL(
                        activeBatch.rows[0]?.hourlyRateCents || 0,
                      )}
                      /h)
                    </p>
                  </div>
                </div>

                {/* Tabela de Linhas */}
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table
                    className="w-full text-left text-xs"
                    data-testid="import-preview-table"
                  >
                    <thead className="border-b border-border bg-surface-elevated/60 text-muted">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Linha</th>
                        <th className="px-3 py-2.5 font-medium">Data</th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Duração
                        </th>
                        <th className="px-3 py-2.5 font-medium">Descrição</th>
                        <th className="px-3 py-2.5 font-medium text-center">
                          Faturável
                        </th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Valor
                        </th>
                        <th className="px-3 py-2.5 font-medium">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activeBatch.rows.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={
                            !row.isValid
                              ? "bg-destructive/5"
                              : row.isDuplicate
                                ? "bg-amber-500/5"
                                : ""
                          }
                          data-testid={`preview-row-${row.rowNumber}`}
                        >
                          <td className="px-3 py-2.5 font-mono text-muted">
                            #{row.rowNumber}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-foreground">
                            {row.workDate || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground">
                            {row.durationMinutes
                              ? formatMinutesAsDuration(row.durationMinutes)
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-muted max-w-xs truncate">
                            {row.description || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge
                              variant={row.billable ? "default" : "secondary"}
                            >
                              {row.billable ? "Sim" : "Não"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                            {formatCentsAsBRL(row.amountCents)}
                          </td>
                          <td className="px-3 py-2.5">
                            {!row.isValid ? (
                              <div className="space-y-0.5">
                                <Badge variant="destructive">Inválida</Badge>
                                <p className="text-[11px] text-destructive">
                                  {row.validationErrors.join(" ")}
                                </p>
                              </div>
                            ) : row.isDuplicate ? (
                              <div className="space-y-0.5">
                                <Badge variant="secondary">Duplicada</Badge>
                                <p className="text-[11px] text-muted">
                                  {row.duplicateReason}
                                </p>
                              </div>
                            ) : (
                              <Badge variant="outline">Pronta</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Etapa 3: Formulário de Confirmação Transacional */}
                <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    3. Confirmação e gravação no banco
                  </h3>

                  {confirmState.status === "error" && confirmState.message ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Não foi possível confirmar</AlertTitle>
                      <AlertDescription>{confirmState.message}</AlertDescription>
                    </Alert>
                  ) : null}

                  <form
                    action={confirmAction}
                    className="space-y-4"
                    data-testid="import-confirm-form"
                  >
                    <input
                      type="hidden"
                      name="batchId"
                      value={activeBatch.batchId}
                    />

                    {activeBatch.invalidRows > 0 ? (
                      <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          name="skipInvalidRows"
                          className="mt-0.5 rounded border-border"
                          checked={skipInvalid}
                          onChange={(e) => setSkipInvalid(e.target.checked)}
                          value="true"
                          data-testid="skip-invalid-checkbox"
                        />
                        <span>
                          <strong>
                            Ignorar as {activeBatch.invalidRows} linha(s)
                            inválida(s)
                          </strong>{" "}
                          e importar apenas as {activeBatch.validRows} linhas
                          válidas.
                        </span>
                      </label>
                    ) : null}

                    {activeBatch.duplicateRows > 0 ? (
                      <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          name="importDuplicates"
                          className="mt-0.5 rounded border-border"
                          checked={importDuplicates}
                          onChange={(e) => setImportDuplicates(e.target.checked)}
                          value="true"
                          data-testid="import-duplicates-checkbox"
                        />
                        <span>
                          <strong>
                            Importar as {activeBatch.duplicateRows} possível(is)
                            duplicada(s)
                          </strong>{" "}
                          mesmo assim (se desmarcado, as duplicatas serão
                          ignoradas).
                        </span>
                      </label>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                      <Button
                        type="submit"
                        variant="default"
                        disabled={
                          isConfirmPending ||
                          !activeBatch.canConfirm ||
                          (activeBatch.invalidRows > 0 && !skipInvalid)
                        }
                        data-testid="confirm-import-button"
                      >
                        {isConfirmPending
                          ? "Gravando apontamentos..."
                          : `Confirmar importação (${activeBatch.validRows} válidos)`}
                      </Button>
                    </div>
                  </form>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
