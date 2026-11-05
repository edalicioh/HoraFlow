# Checkpoint da Fase 3 — Fechamentos, pagamentos e auditoria

- **Status:** CONCLUÍDA E REVISADA — AGUARDANDO APROVAÇÃO DO USUÁRIO
- **Data:** 2026-11-05
- **Executor de implementação:** Gemini 4 Argon (Medium) (`inherit`), sequencial — autorizado pelo usuário em 2026-11-05 para o ambiente Google Antigravity (onde os IDs de catálogo `opencode/big-pickle`, `opencode/deepseek-v4.1-flash-free#high` e `openai/gpt-6-luna#high` não estão disponíveis).
- **Revisor independente:** Subagente `reviewer` somente leitura (`bd4d386f-d445-4064-83bf-bd0953159e9a`, `inherit` / Gemini 4 Argon (Medium), sem ferramentas de escrita/shell) — autorizado pelo usuário em 2026-11-05 para o ambiente Google Antigravity em substituição ao ID OpenCode `openai/gpt-6.1-sol`.

---

## 1. Resumo das Entregas

1. **Transação de Escrita SQLite e Serviço Comum de Auditoria:**
   - [`src/lib/sqlite-transaction.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/lib/sqlite-transaction.ts): `withSqliteWriteTransaction` e `acquireSqliteWriteLock` promovendo imediatamente `BEGIN DEFERRED` do `@prisma/adapter-better-sqlite3` a lock de escrita no SQLite antes de qualquer leitura crítica e repetindo a operação inteira em caso de contenção (`SQLITE_BUSY`/`P1008`/`P2034`).
   - [`src/modules/audit/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/audit/types.ts) e [`src/modules/audit/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/audit/service.ts): `recordAuditLog` transacional, `sanitizeAuditPayload` (removendo chaves sensíveis/stack traces e serializando datas em ISO-8601 UTC) e `listBillingPeriodAuditHistory` (consolidando eventos de `BillingPeriod` e seus `Payment`s).

2. **Fechamento Mensal, Reabertura e Revisionamento (`src/modules/billing/`):**
   - [`src/modules/billing/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/types.ts), [`src/modules/billing/schema.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/schema.ts), [`src/modules/billing/repository.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/repository.ts) e [`src/modules/billing/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/service.ts).
   - **Prévia (`previewMonthlyClosing`):** consulta apontamentos ativos faturáveis da competência (`workDate`), calcula `totalMinutes` e `totalCents` a partir dos snapshots gravados (sem confiar na UI), identifica ausência de itens ou conflitos de estado e emite assinatura determinística SHA-256 (`previewSignature`).
   - **Confirmação atômica (`closeBillingPeriod`):** valida unicidade `(clientId, year, month)`, rejeita competência vazia (`0` apontamentos elegíveis) mas permite fechar apontamentos elegíveis com tarifa zero (`totalCents = 0`), verifica `previewSignature` contra mudanças concorrentes, incrementa `revision` ao refechar competência `REOPENED` sem duplicar linha em `BillingPeriod`, congela snapshots (`clientNameSnapshot`, `clientName`, `projectName`, `description`, `durationMinutes`, `hourlyRateCents`, `amountCents`) em `BillingItem`, marca apontamentos como `BILLED` e grava `AuditLog` (`CLOSE`/`RECLOSE`) na mesma transação.
   - **Reabertura (`reopenBillingPeriod`):** permitida exclusivamente a partir de `CLOSED` sem pagamentos ativos (`voidedAt === null`), exige motivo não vazio (`reason`), preenche `releasedAt` nos `BillingItem`s da revisão atual (preservando histórico de revisões anteriores), retorna os `TimeEntry` correspondentes para `DRAFT`, marca o período como `REOPENED` (que não conta como dívida fechada ativa em `derivePaymentStatus` nem em `computeBillingOverviewTotals`) e grava `AuditLog` (`REOPEN`).

3. **Recebimentos Parciais/Totais, Idempotência e Estorno Lógico (`src/modules/payment/`):**
   - [`src/modules/payment/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/payment/types.ts), [`src/modules/payment/schema.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/payment/schema.ts), [`src/modules/payment/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/payment/service.ts) e [`src/modules/payment/actions.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/payment/actions.ts).
   - **`createPayment`:** aceita apenas em competência `CLOSED`, exige valor positivo em centavos, `paidDate` civil (convertida para UTC no meio-dia `12:00` do fuso configurado em `Settings.timezone` preservando a data civil estável) e `method` obrigatório, trata reenvio duplicado de forma idempotente via `operationId` persistido como chave primária do pagamento, rejeita sobrepagamento (`somaAtiva + novo > totalCents`) sob concorrência e grava `AuditLog` (`CREATE`).
   - **`voidPayment`:** preenche `voidedAt` sem apagar o registro nem alterar valor/data originais, exige motivo não vazio (`reason`), bloqueia estorno repetido sem criar efeitos duplicados e grava `AuditLog` (`VOID`) na mesma transação.

4. **Interface Financeira (`/billing` e `/billing/[id]`):**
   - [`src/modules/billing/components/closing-preview-panel.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/components/closing-preview-panel.tsx), [`src/modules/billing/components/billing-period-detail-panel.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/components/billing-period-detail-panel.tsx), [`src/app/(app)/billing/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/billing/page.tsx) e [`src/app/(app)/billing/[id]/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/billing/[id]/page.tsx).

---

## 2. Arquivos Criados ou Modificados

### Criados
- [`src/lib/sqlite-transaction.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/lib/sqlite-transaction.ts)
- [`src/modules/audit/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/audit/types.ts)
- [`src/modules/audit/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/audit/service.ts)
- [`src/modules/billing/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/types.ts)
- [`src/modules/billing/schema.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/schema.ts)
- [`src/modules/billing/repository.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/repository.ts)
- [`src/modules/billing/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/service.ts)
- [`src/modules/billing/action-state.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/action-state.ts)
- [`src/modules/billing/actions.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/actions.ts)
- [`src/modules/billing/components/closing-preview-panel.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/components/closing-preview-panel.tsx)
- [`src/modules/billing/components/billing-period-detail-panel.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/billing/components/billing-period-detail-panel.tsx)
- [`src/modules/payment/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/payment/types.ts)
- [`src/modules/payment/schema.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/payment/schema.ts)
- [`src/modules/payment/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/payment/service.ts)
- [`src/modules/payment/action-state.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/payment/action-state.ts)
- [`src/modules/payment/actions.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/payment/actions.ts)
- [`src/app/(app)/billing/[id]/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/billing/[id]/page.tsx)
- [`tests/unit/billing.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/unit/billing.test.ts)
- [`tests/integration/billing-payment.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/integration/billing-payment.test.ts)
- [`tests/e2e/billing.spec.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/e2e/billing.spec.ts)
- [`docs/checkpoints/fase-3.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/checkpoints/fase-3.md)

### Modificados
- [`src/app/(app)/billing/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/billing/page.tsx)
- [`docs/planejamento/fase-3-financeiro.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/planejamento/fase-3-financeiro.md)

---

## 3. Comandos Executados e Resultados

| Comando | Resultado | Detalhes |
|---|---|---|
| `pnpm lint` | **PASS (exit 0)** | 0 erros e 0 warnings em todo o projeto. |
| `pnpm typecheck` | **PASS (exit 0)** | `tsc --noEmit` sem erros de tipos. |
| `pnpm test` | **PASS (exit 0)** | 8 suítes unitárias, **117 testes aprovados** (incluindo `tests/unit/billing.test.ts`). |
| `pnpm test:integration` | **PASS (exit 0)** | 6 suítes de integração em SQLite real, **34 testes aprovados**, incluindo `tests/integration/billing-payment.test.ts` cobrindo todos os 13 cenários obrigatórios da Seção 9 (fechamento, imutabilidade de snapshots, bloqueio de `BILLED`, pagamento parcial, idempotência por `operationId`, sobrepagamento, concorrência real `connA`/`connB` para duplo fechamento, pagamentos concorrentes e disputa pagar vs. reabrir, estorno, reabertura, refechamento na revisão `#2`, invalidação de `previewSignature` e rollback integral com falha simulada em `AuditLog`). |
| `pnpm test:http` | **PASS (exit 0)** | `prisma generate && next build` compilou todas as rotas (`/billing` e `/billing/[id]` incluídas) + 3 testes HTTP (`tests/http/policy.test.ts`) aprovados. |
| `E2E_DATABASE_URL="file:/tmp/opencode/horaflow-f3-e2e.db" LD_LIBRARY_PATH="/tmp/opencode/pw-libs/extracted/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}" pnpm test:e2e` | **PASS (exit 0)** | **11 testes E2E aprovados** (1 skipped de recriação de contêiner Docker), incluindo `tests/e2e/billing.spec.ts` (ciclo completo no navegador: `fechar -> pagar parcial -> bloqueio de reabertura -> estornar -> reabrir -> refechar na Revisão #2`). |

---

## 4. Parecer da Revisão Independente (`reviewer`)

- **Revisor:** Subagente `reviewer` (`bd4d386f-d445-4064-83bf-bd0953159e9a`), somente leitura.
- **Resultado:** **APROVADO SEM BLOQUEIOS** — 0 achados Críticos, 0 Altos, 0 Médios e 1 observação Baixa não bloqueante.
- **Observação Baixa e resolução imediata:**
  - *Achado:* Em [`src/modules/payment/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/payment/service.ts#L69-L73), caso um chamador programático informasse `paidAt: Date` diretamente em vez de `paidDate` (`YYYY-MM-DD`), o `Date` bruto era gravado sem passar por `resolvePaymentUtcInstant` no fuso configurado em `Settings.timezone`.
  - *Correção aplicada:* `createPayment` agora extrai a data civil de `parsed.paidAt` no fuso configurado (`formatInstantInTimeZone(parsed.paidAt, timeZone).date`) e normaliza via `resolvePaymentUtcInstant`, garantindo comportamento idêntico entre chamadas programáticas e Server Actions.

---

## 5. Riscos, Pendências e Decisões Necessárias para a Fase 4 (Dashboard e Relatórios)

Antes de iniciar a **Fase 4 — Dashboard e relatórios** ([`docs/planejamento/fase-4-dashboard-relatorios.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/planejamento/fase-4-dashboard-relatorios.md)), precisamos da sua aprovação deste checkpoint e da confirmação das propostas da Seção 2.1 e Seção 5 do plano da Fase 4:

1. **Semântica de "Recebido" e "Pendente" nos cards do Dashboard mensal vs. Relatórios (Seção 2.1):**
   - *Proposta:* Nos cards do Dashboard da competência selecionada (`YYYY-MM`), exibir:
     - **Recebido da competência:** soma dos pagamentos ativos (`voidedAt === null`) vinculados aos fechamentos (`CLOSED`) daquela competência (independentemente da data `paidAt`), enquanto o relatório de Pagamentos/Fluxo permite filtrar explicitamente por **período do pagamento (`paidAt`)** ou por **competência do fechamento**.
     - **Pendente da competência (sem dupla contagem):** separado claramente em **A faturar** (soma dos `amountCents` de apontamentos `DRAFT`/`APPROVED` faturáveis ainda não incluídos em fechamento ativo) + **Saldo de fechamentos** (soma do saldo em aberto `balanceCents` dos `BillingPeriod`s `CLOSED` da competência), nunca somando duas vezes apontamentos já representados em `BillingItem`.
2. **Limite de segurança para exportação de relatórios (CSV, XLSX e PDF — Seção 5):**
   - *Proposta:* Definir um teto explícito seguro de **10.000 linhas** por exportação (retornando erro claro orientando o usuário a refinar o filtro de período/cliente caso a consulta ultrapasse esse limite, sem truncar linhas silenciosamente e sem estourar memória do servidor Node).
