# Checkpoint — Fase 4: Dashboard e Relatórios

**Data:** 2026-11-05  
**Executor da implementação:** Gemini 4 Argon (Medium) (`inherit`), autorizado pelo usuário para execução sequencial no ambiente Google Antigravity (`AGENTS.md`).  
**Revisor independente:** Subagente `reviewer` (`bd4d386f-d445-4064-83bf-bd0953159e9a`), somente leitura (`EnableWriteTools: false`, `EnableSubagentTools: false`, `EnableMCPTools: false`).  
**Status:** Implementada, verificada e revisada — **Aguardando aprovação explícita do usuário antes de iniciar a Fase 5**.

---

## 1. Resumo das Entregas da Fase 4

1. **Dashboard Mensal Executivo (`/dashboard`):**
   - Implementado em [`src/modules/dashboard/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/dashboard/types.ts), [`src/modules/dashboard/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/dashboard/service.ts) (`getMonthlyDashboard`) e [`src/app/(app)/dashboard/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/dashboard/page.tsx).
   - Seletor de competência (`Mês` / `Ano` + atalhos `Anterior`, `Mês atual`, `Próximo`) sincronizado via URL (`?year=YYYY&month=M`).
   - Indicadores mensais (`KPIs`):
     - **Horas trabalhadas:** soma de todos os apontamentos ativos (`deletedAt: null`) da competência, faturáveis e não faturáveis, exibida em `HH:mm` sem redução módulo 24.
     - **Horas faturáveis:** soma dos apontamentos faturáveis ativos + subtítulo com **Não faturáveis**.
     - **Dias trabalhados:** contagem de datas civis (`workDate`) distintas com lançamento ativo na competência.
     - **Valor acumulado:** soma exata em centavos (`amountCents`) dos apontamentos faturáveis da competência (respeitando snapshots congelados de `BillingItem` quando fechados), sem arredondar novamente o total.
     - **Recebido (competência):** soma dos pagamentos ativos (`voidedAt === null` na revisão ativa) vinculados aos fechamentos `CLOSED` da competência selecionada, independentemente da data civil `paidAt`.
     - **Pendente (competência) sem dupla contagem:** separa explicitamente **A faturar (rascunho)** (`unbilledDraftCents`: apontamentos faturáveis sem fechamento ativo) de **Saldo de fechamentos** (`closedBalanceCents`: saldo em aberto dos `BillingPeriod`s `CLOSED` da competência), onde `totalPendingCompetenceCents = unbilledDraftCents + closedBalanceCents`.
   - Distribuição de horas e valores por **Cliente** e por **Projeto** com tabelas acessíveis acompanhadas de barras proporcionais e links diretos para os relatórios filtrados.
2. **Camada Única de Consulta e 7 Relatórios Oficiais (`/reports`):**
   - Implementada em [`src/modules/reporting/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/types.ts), [`src/modules/reporting/schema.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/schema.ts), [`src/modules/reporting/repository.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/repository.ts), [`src/modules/reporting/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/service.ts) (`generateReportDataset`) e [`src/app/(app)/reports/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/reports/page.tsx).
   - A mesma função `generateReportDataset` alimenta a tabela em `/reports` e os três exportadores (`CSV`, `XLSX`, `PDF`), garantindo paridade 1:1 de `matchedRecordIds`, `totalMinutes` e `totalCents`.
   - Catálogo completo dos 7 relatórios do PRD:
     1. `hours-by-period` (Horas por período)
     2. `hours-by-client` (Horas por cliente)
     3. `hours-by-project` (Horas por projeto)
     4. `detailed-entries` (Apontamentos detalhados)
     5. `billable-values` (Valores faturáveis)
     6. `monthly-closings` (Fechamentos mensais, incluindo demonstrativo detalhado individual por `billingPeriodId` conectado também em [`src/modules/billing/components/billing-period-detail-panel.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/components/billing-period-detail-panel.tsx))
     7. `payments-and-balances` (Pagamentos e pendências, com escolha explícita entre filtrar por **Data do pagamento (`PAID_AT`)** ou por **Competência do fechamento (`COMPETENCE`)** e exibição auditável de estornos sem somá-los ao total recebido).
   - **Limite seguro de exportação (`MAX_EXPORT_ROWS = 10_000`):** imposto antes da montagem/exportação, lançando `ValidationError` claro caso excedido, nunca truncando silenciosamente.
3. **Exportadores CSV, XLSX (`ExcelJS`) e PDF (`@react-pdf/renderer`) + Route Handler (`/api/reports/export`):**
   - **CSV ([`src/modules/reporting/exporters/csv/index.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/exporters/csv/index.ts)):** UTF-8 com BOM (`\uFEFF`), separador `;`, escape completo de aspas/quebras de linha/delimitadores e neutralização de injeção de fórmulas (`=`, `+`, `-`, `@`, tabulação/controle, inclusive precedidos por espaços) via prefixo `'`.
   - **XLSX ([`src/modules/reporting/exporters/xlsx/index.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/exporters/xlsx/index.ts)):** gerado com `ExcelJS`, exportando valores monetários como números formatados em BRL (`"R$ "#,##0.00`), durações `HH:mm` (inclusive acima de 24h como `24:30` e `100:00`) sem redução módulo 24, datas civis sem deslocamento de fuso e textos neutralizados contra fórmulas.
   - **PDF ([`src/modules/reporting/exporters/pdf/index.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/exporters/pdf/index.tsx)):** gerado no servidor Node.js com `@react-pdf/renderer` (sem Chromium), com cabeçalho repetível, paginação multi-página (`Página X de Y`), hifenização desativada para preservar palavras em pt-BR (`Font.registerHyphenationCallback`) e utilitário [`inspectGeneratedPdfBuffer`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/exporters/pdf/index.tsx#L363-L407) que descomprime os streams `FlateDecode` para verificação automatizada nos testes.
   - **Route Handler ([`src/app/api/reports/export/route.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/api/reports/export/route.ts)):** `runtime = "nodejs"`, `dynamic = "force-dynamic"`, protegido por `evaluateRequestPolicy`, bloqueia parâmetros de caminho vindos do cliente (`file`, `path`, `filepath`), sanitiza o nome do arquivo em `Content-Disposition` e define `Cache-Control: no-store`.

---

## 2. Arquivos Criados e Modificados

### Criados
- [`src/modules/dashboard/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/dashboard/types.ts)
- [`src/modules/dashboard/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/dashboard/service.ts)
- [`src/modules/reporting/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/types.ts)
- [`src/modules/reporting/schema.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/schema.ts)
- [`src/modules/reporting/repository.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/repository.ts)
- [`src/modules/reporting/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/service.ts)
- [`src/modules/reporting/exporters/csv/index.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/exporters/csv/index.ts)
- [`src/modules/reporting/exporters/xlsx/index.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/exporters/xlsx/index.ts)
- [`src/modules/reporting/exporters/pdf/index.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/exporters/pdf/index.tsx)
- [`src/app/api/reports/export/route.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/api/reports/export/route.ts)
- [`tests/unit/reporting-exporters.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/unit/reporting-exporters.test.ts)
- [`tests/integration/dashboard-reporting.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/integration/dashboard-reporting.test.ts)
- [`tests/e2e/dashboard-reports.spec.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/e2e/dashboard-reports.spec.ts)
- [`docs/checkpoints/fase-4.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/checkpoints/fase-4.md)

### Modificados
- [`package.json`](file:///mnt/Storage/projetos/edalicio/HoraFlow/package.json) e [`pnpm-lock.yaml`](file:///mnt/Storage/projetos/edalicio/HoraFlow/pnpm-lock.yaml) (`exceljs@4.4.0`, `@react-pdf/renderer@4.9.0`)
- [`next.config.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/next.config.ts) (`serverExternalPackages`)
- [`src/app/(app)/dashboard/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/dashboard/page.tsx)
- [`src/app/(app)/reports/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/reports/page.tsx)
- [`src/app/(app)/billing/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/billing/page.tsx)
- [`src/modules/billing/components/billing-period-detail-panel.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/components/billing-period-detail-panel.tsx)
- [`docs/planejamento/fase-4-dashboard-relatorios.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/planejamento/fase-4-dashboard-relatorios.md)

---

## 3. Comandos Executados e Resultados Verificáveis

| Comando | Resultado | Detalhes |
|---|---|---|
| `pnpm lint` | **PASS (exit 0)** | 0 erros e 0 warnings em todo o repositório. |
| `pnpm typecheck` | **PASS (exit 0)** | `tsc --noEmit` sem erros de tipos. |
| `pnpm test` | **PASS (exit 0)** | 9 suítes unitárias, **123 testes aprovados** (incluindo [`tests/unit/reporting-exporters.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/unit/reporting-exporters.test.ts): validação de filtro, CSV com BOM/aspas/quebra de linha/fórmulas neutralizadas, XLSX reaberto pelo `ExcelJS` com durações `24:30`/`100:00`/`124:30` e números BRL sem `cell.formula`, e PDF multi-página com 65 itens e estado vazio). |
| `pnpm test:integration` | **PASS (exit 0)** | 7 suítes de integração em SQLite real, **37 testes aprovados**, incluindo [`tests/integration/dashboard-reporting.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/integration/dashboard-reporting.test.ts) (dias distintos, horas não faturáveis com cobrança zero, paridade 1:1 entre tela e CSV/XLSX/PDF nos 7 relatórios, pagamento em outro mês `COMPETENCE` vs `PAID_AT`, estorno, reabertura sem dupla contagem e preservação de snapshot após mudança de tarifa/nome no catálogo). |
| `pnpm test:http` | **PASS (exit 0)** | `prisma generate && next build` compilou todas as rotas (`/dashboard`, `/reports`, `/api/reports/export` incluídas) + 3 testes HTTP (`tests/http/policy.test.ts`) aprovados. |
| `E2E_DATABASE_URL="file:/tmp/opencode/horaflow-f4-e2e.db" LD_LIBRARY_PATH="/tmp/opencode/pw-libs/extracted/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}" pnpm test:e2e` | **PASS (exit 0)** | **12 testes E2E aprovados** (1 skipped de recriação de contêiner Docker), incluindo [`tests/e2e/dashboard-reports.spec.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/e2e/dashboard-reports.spec.ts) validando o `/dashboard` antes e depois de fechamento e pagamento parcial, navegação para `/reports` e download real de `CSV`, `XLSX` e `PDF`. |

---

## 4. Parecer da Revisão Independente (`reviewer`)

- **Revisor:** Subagente `reviewer` (`bd4d386f-d445-4064-83bf-bd0953159e9a`), somente leitura.
- **Resultado:** **APROVADO SEM BLOQUEIOS** — 0 achados Críticos, 0 Altos, 0 Médios e 1 observação Baixa não bloqueante.
- **Observação Baixa e resolução imediata:**
  - *Achado:* Em [`src/modules/reporting/schema.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/reporting/schema.ts#L171-L185), caso o usuário selecionasse um `month` sem informar o `year` em um relatório baseado em intervalo de datas civis, o parâmetro `month` isolado era ignorado silenciosamente.
  - *Correção aplicada:* `parseReportFilter` agora exige `year` sempre que `month !== null`, lançando `ValidationError("Informe o ano ao filtrar por mês de competência.")`, coberto por teste unitário em [`tests/unit/reporting-exporters.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/unit/reporting-exporters.test.ts#L125-L131).

---

## 5. Riscos, Pendências e Decisões Necessárias para a Fase 5 (Importação e Estabilização)

Antes de iniciar a **Fase 5 — Importação e estabilização** ([`docs/planejamento/fase-5-importacao-estabilizacao.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/planejamento/fase-5-importacao-estabilizacao.md)), precisamos da sua aprovação deste checkpoint e das confirmações abaixo:

1. **Fonte histórica real de outubro/2026 (Seção 2 e Seção 8):**
   - Conforme `AGENTS.md` e `docs/planejamento/fase-5-importacao-estabilizacao.md`, dados sintéticos não comprovam o aceite histórico real de **outubro/2026 (9 registros e 24h30 / 1470 minutos)**.
   - Se o arquivo CSV/XLSX original (e eventual PDF de referência visual) já estiver disponível no workspace ou puder ser indicado por caminho local, informe onde está localizado para inspecionarmos cabeçalhos/abas sem commitar dados privados. Caso ainda não esteja disponível, implementaremos todo o wizard de importação, backup/restore e testes sintéticos, mantendo o item de aceite histórico real explicitamente sinalizado até o fornecimento do arquivo.
2. **Limites operacionais e políticas propostas na Seção 3 do plano da Fase 5:**
   - **Upload seguro (Seção 3.1):** limite máximo de **5 MiB** por arquivo CSV/XLSX, máximo de **5.000 linhas** por lote de importação e tamanho máximo descompactado de **25 MiB** para arquivos XLSX (prevenção contra zip bombs), mantendo temporários/lotes fora de `public/` com expiração de 24 horas.
   - **Duplicidade e linhas inválidas (Seções 3.3 e 3.4):** assinatura de possível duplicidade baseada em `(workDate, projectId, durationMinutes, mode, normalizedDescription, billable)` com opção explícita do usuário para importar ou ignorar duplicados; e bloqueio de confirmação por padrão quando houver linhas inválidas, permitindo a opção explícita *"Importar apenas linhas válidas e ignorar inválidas"* conforme RF10, em lote persistido (`PENDING -> PREVIEWED -> IMPORTED / FAILED`) com confirmação transacional idempotente.
