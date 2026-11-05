# Checkpoint da Fase 2 — Gestão de horas e calendário

- **Status:** APROVADA PELO USUÁRIO EM 2026-11-05
- **Data:** 2026-11-05
- **Executor de implementação:** Gemini 4 Argon (Medium) (`inherit`), sequencial — autorizado pelo usuário em 2026-11-05 para o ambiente Google Antigravity (onde os IDs de catálogo `opencode/big-pickle`, `opencode/deepseek-v4.1-flash-free#high` e `openai/gpt-6-luna#high` não estão disponíveis).
- **Revisor independente:** Subagente `reviewer` somente leitura (`bd4d386f-d445-4064-83bf-bd0953159e9a`, `inherit` / Gemini 4 Argon (Medium), sem ferramentas de escrita/shell) — autorizado pelo usuário em 2026-11-05 para o ambiente Google Antigravity em substituição ao ID OpenCode `openai/gpt-6.1-sol`.

---

## 1. Resumo das Entregas

1. **Utilitários de Duração, Datas Civis, Fuso Horário e Arredondamento Financeiro:**
   - [`src/lib/duration.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/lib/duration.ts): `parseDurationToMinutes` com validação estrita `HH:mm` (`/^\d{2,}:[0-5]\d$/`, `> 0`, até `MAX_DURATION_MINUTES = 600_000`, sem teto artificial de 24h) e `formatMinutesAsDuration` (sem redução módulo 24).
   - [`src/lib/datetime.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/lib/datetime.ts): validação de datas civis (`isValidCivilDate`, anos bissextos, fins de semana, `addDaysToCivilDate`), conversão estrita `localDateTimeToUtc` com detecção de horários locais inexistentes ou ambíguos em transições de offset/DST (lançando `ValidationError` explícito em vez de ajuste silencioso), `resolveIntervalWindow` (exigindo `endAt > startAt` sem inferir dia seguinte silenciosamente e atribuindo a competência `workDate` à data civil de início), `formatInstantInTimeZone` e `intervalsOverlap` (`aStart < bEnd && bStart < aEnd`).
   - [`src/lib/money.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/lib/money.ts): `calculateTimeEntryAmountCents` com aritmética inteira `BigInt` e arredondamento half-up por apontamento (`(BigInt(durationMinutes) * BigInt(hourlyRateCents) + 30n) / 60n`), validando `MAX_CENTS` antes de converter para `Number` e retornando `0` quando `billable === false` (preservando duração e tarifa no registro).

2. **Domínio, Persistência, Sobreposição e Concorrência SQLite (`time-entry`):**
   - [`src/modules/time-entry/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/types.ts), [`src/modules/time-entry/schema.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/schema.ts), [`src/modules/time-entry/repository.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/repository.ts) e [`src/modules/time-entry/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/service.ts).
   - **Sobreposição global de intervalos:** verifica todos os apontamentos `INTERVAL` ativos (`deletedAt: null`) entre todos os clientes/projetos (incluindo registros `BILLED`/`APPROVED`, ignorando `DURATION`, excluindo o próprio `id` na edição e sem restringir ao mesmo `workDate`).
   - **Atomicidade e concorrência SQLite:** dentro de `db.$transaction`, executa um `upsert` no singleton `Settings` como primeiro statement para promover imediatamente a transação `BEGIN DEFERRED` do `@prisma/adapter-better-sqlite3` a lock de escrita antes de ler os intervalos existentes, combinado com `withSqliteWriteTransaction` (retry completo da operação em erros `SQLITE_BUSY`/`P1008`/`P2034`/`SocketTimeout`).
   - **Guardas financeiras e de catálogo:** bloqueia criação, edição (competência original e de destino) e exclusão quando `BillingPeriod` (`clientId + year + month` de `workDate`) está `CLOSED`; bloqueia edição/exclusão quando `TimeEntry.status !== "DRAFT"` ou possui `BillingItem` ativo (`releasedAt: null`). Na edição de rascunho (`DRAFT`), preserva `hourlyRateCents` salvo por padrão (salvo alteração explícita) e permite manter o `projectId` original mesmo se o projeto ou cliente tiver sido desativado posteriormente.
   - **Auditoria transacional:** todas as mutações (`CREATE`, `UPDATE`, `DELETE`) gravam `AuditLog` com snapshots `before`/`after` na mesma transação SQLite.

3. **Server Actions, Calendário Mensal, Detalhe do Dia e Lista Filtrável (`/timesheet`):**
   - [`src/modules/time-entry/action-state.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/action-state.ts) e [`src/modules/time-entry/actions.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/actions.ts): Server Actions protegidas por `evaluateRequestPolicy` e validação Zod, revalidando `/timesheet`, `/clients`, `/projects`, `/dashboard`, `/billing` e `/reports`.
   - [`src/modules/time-entry/components/monthly-calendar.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/components/monthly-calendar.tsx): grade completa do mês (incluindo dias sem apontamentos), navegação de mês/ano, atalho "Hoje", seleção de dia, destaque visual de sábados e domingos sem adicional financeiro, totais `HH:mm` diários/mensais e dias trabalhados, além de versão responsiva para mobile.
   - [`src/modules/time-entry/components/time-entry-form.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/components/time-entry-form.tsx) e [`src/modules/time-entry/components/time-entry-card.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/components/time-entry-card.tsx): alternância entre `DURATION` e `INTERVAL`, filtro dinâmico de projetos por cliente (limpando projeto incompatível ao trocar cliente), botão explícito "+1 dia (virada)" no modo intervalo, prévia informativa de duração/tarifa/valor (recalculada pelo servidor ao salvar), edição inline, exclusão lógica com confirmação e exibição de estado bloqueado para itens faturados.
   - [`src/app/(app)/timesheet/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/timesheet/page.tsx): página integrada com resumo mensal, calendário mensal, detalhe do dia selecionado, formulário de novo apontamento e lista filtrável (período, cliente, projeto, faturável, status) com paginação explícita. Note-se que os dados exibidos nos testes automatizados são sintéticos e não substituem o aceite histórico real da Fase 5.

---

## 2. Arquivos Criados ou Modificados

### Criados
- [`src/lib/duration.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/lib/duration.ts)
- [`src/lib/datetime.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/lib/datetime.ts)
- [`src/modules/time-entry/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/types.ts)
- [`src/modules/time-entry/schema.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/schema.ts)
- [`src/modules/time-entry/repository.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/repository.ts)
- [`src/modules/time-entry/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/service.ts)
- [`src/modules/time-entry/action-state.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/action-state.ts)
- [`src/modules/time-entry/actions.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/actions.ts)
- [`src/modules/time-entry/components/monthly-calendar.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/components/monthly-calendar.tsx)
- [`src/modules/time-entry/components/time-entry-form.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/components/time-entry-form.tsx)
- [`src/modules/time-entry/components/time-entry-card.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/components/time-entry-card.tsx)
- [`tests/unit/duration.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/unit/duration.test.ts)
- [`tests/unit/datetime.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/unit/datetime.test.ts)
- [`tests/unit/overlap.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/unit/overlap.test.ts)
- [`tests/integration/time-entry.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/integration/time-entry.test.ts)
- [`tests/e2e/timesheet.spec.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/e2e/timesheet.spec.ts)
- [`docs/checkpoints/fase-2.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/checkpoints/fase-2.md)

### Modificados
- [`src/lib/money.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/lib/money.ts)
- [`src/app/(app)/timesheet/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/timesheet/page.tsx)
- [`tests/unit/money.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/unit/money.test.ts)
- [`docs/planejamento/fase-2-horas.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/planejamento/fase-2-horas.md)

---

## 3. Comandos Executados e Resultados

| Comando | Resultado | Detalhes |
|---|---|---|
| `pnpm lint` | **PASS (exit 0)** | 0 erros e 0 warnings em todo o projeto. |
| `pnpm typecheck` | **PASS (exit 0)** | `tsc --noEmit` sem erros de tipos. |
| `pnpm test` | **PASS (exit 0)** | 7 suítes unitárias, **111 testes aprovados** (`duration.test.ts`, `datetime.test.ts`, `overlap.test.ts`, `money.test.ts`, `rates.test.ts`, `env.test.ts`, `request-policy.test.ts`). |
| `pnpm test:integration` | **PASS (exit 0)** | 5 suítes de integração em SQLite real, **30 testes aprovados**, incluindo `tests/integration/time-entry.test.ts` (5 testes cobrindo cálculos, viradas de dia/mês/ano, bissexto, sobreposição global, concorrência real entre duas conexões SQLite independentes `connA`/`connB`, fuso estável, inativação pós-lançamento e bloqueio por `BillingPeriod` `CLOSED` / `TimeEntry` `BILLED`). |
| `pnpm test:http` | **PASS (exit 0)** | `prisma generate && next build` compilou todas as rotas sem erros + 3 testes HTTP (`tests/http/policy.test.ts`) aprovados. |
| `E2E_DATABASE_URL="file:/tmp/opencode/horaflow-f2-e2e.db" LD_LIBRARY_PATH="/tmp/opencode/pw-libs/extracted/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}" pnpm test:e2e` | **PASS (exit 0)** | **10 testes E2E aprovados** (1 skipped de recriação de contêiner Docker), incluindo `tests/e2e/timesheet.spec.ts` (criação por duração `24:30` e intervalo `08:00–13:30`, destaque de fim de semana, limpeza de projeto incompatível ao trocar cliente, conflito de sobreposição, exclusão lógica e atualização de totais). |

---

## 4. Parecer da Revisão Independente (`reviewer`)

- **Revisor:** Subagente `reviewer` (`bd4d386f-d445-4064-83bf-bd0953159e9a`), somente leitura.
- **Resultado:** **APROVADO** — 0 achados Críticos, 0 Altos, 0 Médios e 1 observação Baixa não bloqueante.
- **Observação Baixa e resolução imediata:**
  - *Achado:* Em [`src/modules/time-entry/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/time-entry/service.ts#L282-L300), na variante programática `TimeEntryIntervalUtcWriteInput` (quando `startAt` e `endAt` são instantes `Date`), caso `input.workDate` fosse informado manualmente, era validado com `civilDateSchema.parse` (podendo lançar `ZodError` bruto ou divergir de `startInZone.date`).
  - *Correção aplicada:* Substituído por `civilDateSchema.safeParse` com lançamento de `ValidationError` e verificação estrita de igualdade com `startInZone.date`, garantindo consistência total também para chamadas programáticas futuras.

---

## 5. Riscos, Pendências e Decisões Necessárias para a Fase 3 (Financeiro)

Antes de iniciar a **Fase 3 — Fechamentos, pagamentos e auditoria** ([`docs/planejamento/fase-3-financeiro.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/planejamento/fase-3-financeiro.md)), precisamos da sua aprovação deste checkpoint e da confirmação das seguintes políticas pendentes da Seção 2.2 do plano da Fase 3 (as decisões de revisionamento `BillingPeriod.revision`/`BillingItem.revision`/`releasedAt` e congelamento de nomes de cliente/projeto/descrição já foram aprovadas em 2026-11-04):

1. **Fechamento sem itens vs. fechamento com total R$ 0,00:**
   - *Proposta:* Rejeitar fechamento quando não houver nenhum apontamento elegível na competência (`0 itens`), mas **permitir** fechar quando houver apontamentos faturáveis elegíveis com minutos registrados cuja tarifa/valor resulte em `totalCents = 0` (caso distinto de vazio).
2. **Data do pagamento (`paidAt`) e forma de pagamento (`method`):**
   - *Proposta:* O formulário recebe a data civil do pagamento (`YYYY-MM-DD`) e o servidor converte para instante UTC (`12:00:00` local no fuso configurado em `Settings.timezone`, evitando deslocamento de data civil entre fusos) ou preserva a data civil estável na exibição; e tornar o campo **forma de pagamento** (`method`, ex.: PIX, Transferência/TED, Boleto, Cartão, Outro) obrigatório na validação Zod do formulário de recebimento (conforme RF08), embora a coluna no banco seja nullable para compatibilidade legada.
3. **Motivo obrigatório em reabertura e estorno:**
   - *Proposta:* Exigir preenchimento de motivo/observação não vazio tanto ao **reabrir** um fechamento quanto ao **estornar** um pagamento, gravando o motivo no `AuditLog` correspondente (sem criar `User` ou login).
