# Checkpoint — Fase 1 (clientes, projetos e tarifas)

- **Estado:** APROVADA PELO USUÁRIO
- **Data da execução:** 2026-11-05
- **Modelo executor e agentes:** Gemini 4 Argon (Medium) (`inherit`), construtor sequencial único autorizado explicitamente pelo usuário em 2026-11-05 para o ambiente Google Antigravity
- **Revisor:** Subagente independente `reviewer` (`inherit` / Gemini 4 Argon (Medium), somente leitura, sem ferramentas de escrita, shell ou delegação), autorizado pelo usuário em 2026-11-05
- **Aprovação do usuário:** Aprovada explicitamente em 2026-11-05; Fase 2 autorizada
- **Fase seguinte:** Fase 2 (Horas) — autorizada em 2026-11-05

Este documento registra a entrega técnica da Fase 1 conforme o protocolo de [`docs/planejamento/README.md`](../planejamento/README.md). Ele não substitui a aprovação explícita do usuário para avançar à Fase 2.

---

## 1. Escopo, commits e revisão

| Item | Valor |
| --- | --- |
| Aprovação da Fase 0 e decisões da Fase 1 | `8a0e621` |
| Implementação da Fase 1 | `d3de7701deb82ebdf10254ce1f1770525c99b248` |
| Diff revisado pelo agente `reviewer` | `8a0e621..d3de770` — 30 arquivos, +4685/−27 |
| Refinamento pós-revisão (revalidação de rotas dinâmicas) | Aplicado em `src/modules/project/actions.ts` e `src/modules/settings/actions.ts` |
| Branch / worktree | `main` (execução sequencial sem agentes gravadores concorrentes) |
| Impacto de migration / backup | Nenhuma migration adicional necessária (schema e constraints SQL de `Client` e `Project` já criados na Fase 0) |

### Parecer da revisão independente (`bd4d386f-d445-4064-83bf-bd0953159e9a`)

- **Achados Altos:** 0
- **Achados Médios:** 0
- **Observação Baixa (não bloqueante, já endereçada):** recomendou incluir `revalidatePath("/clients/[id]", "page")` em `src/modules/project/actions.ts` e revalidar `/clients` e `/projects` em `src/modules/settings/actions.ts`. O ajuste foi aplicado e revalidado antes de fechar este checkpoint.
- **Resolução da ressalva baixa da Fase 0:** confirmada pelo revisor em `src/lib/request-policy.ts` (linhas 231–243) e `tests/unit/request-policy.test.ts` (rejeição de `Origin` com porta não padrão quando `Host` omite porta, como `Host: localhost` com `Origin: http://localhost:9999`).

---

## 2. Decisões confirmadas pelo usuário em 2026-11-05

1. **Aprovação da Fase 0 e autorização da Fase 1:** checkpoint `docs/checkpoints/fase-0.md` aprovado e início da Fase 1 autorizado.
2. **Coordenação no Antigravity:** autorizado o modelo ativo **Gemini 4 Argon (Medium)** (`inherit`) para construção sequencial e subagente `reviewer` somente leitura para revisão independente.
3. **Inativação de cliente e projeto:** desativar cliente ou projeto impede novos lançamentos e preserva todo o histórico; desativar um cliente torna seus projetos inelegíveis para novos apontamentos (`eligibleForTimeEntries = client.active && project.active`) **sem alterar silenciosamente** o campo `active` individual de cada projeto.
4. **Imutabilidade de cliente em projeto com histórico:** proibido alterar o `clientId` de um projeto que já possua apontamentos (`TimeEntry`, inclusive excluídos logicamente com `deletedAt !== null`) ou itens de fechamento (`BillingItem`).

---

## 3. Funcionalidades entregues

### 3.1. Resolução de tarifas e helpers monetários (`src/lib/rates.ts`, `src/lib/money.ts`, `src/lib/errors.ts`)
- `resolveHourlyRate({ projectRateCents, clientRateCents, defaultRateCents })` e `resolveHourlyRateWithSource(...)` com prioridade estrita `projectRateCents ?? clientRateCents ?? defaultRateCents`.
- Diferenciação exata entre `null`/`undefined` (aciona fallback) e `0` (tarifa zero definida, sem fallback para cliente ou global).
- `parseOptionalBRLToCents` em `src/lib/money.ts`: converte strings pt-BR para centavos inteiros sem multiplicação de ponto flutuante, tratando string vazia como `null` e `"0"`/`"0,00"` como `0`.
- Classes de erro previsíveis em `src/lib/errors.ts`: `ValidationError`, `NotFoundError` e `ConflictError`.

### 3.2. Módulo de clientes (`src/modules/client/*`, `/clients`, `/clients/[id]`)
- Contratos completos no servidor: `listClients`, `getClient`, `createClient`, `updateClient`, `setClientActive` e `deleteClient`.
- Validação Zod no servidor (`name` obrigatório após trim até 120 caracteres, `description` opcional até 500 caracteres, `hourlyRateCents` inteiro não negativo opcional até `MAX_CENTS`).
- Tela `/clients` com criação, busca textual, filtro por status (`all`, `active`, `inactive`), estado vazio real, edição inline acessível por teclado (`Enter`/`Escape`), ativação/desativação e exclusão segura.
- Tela `/clients/[id]` com resumo cadastral, tarifa própria e efetiva, listagem e criação de projetos associados ao cliente e seção preparada para o histórico de horas e fechamentos (exibindo contagens reais sem fabricar horas ou valores).
- Bloqueio de exclusão física quando existem projetos ou períodos de faturamento vinculados, orientando a desativação e sem jamais excluir projetos em cascata.

### 3.3. Módulo de projetos (`src/modules/project/*`, `/projects`)
- Contratos completos no servidor: `listProjects`, `getProject`, `createProject`, `updateProject`, `setProjectActive` e `deleteProject`.
- Validação de existência e elegibilidade (`client.active === true`) do cliente ao criar projeto ou ao transferir projeto sem histórico.
- Bloqueio de troca de `clientId` quando o projeto já possui apontamentos (inclusive com `deletedAt` preenchido) ou itens de fechamento.
- Exibição explícita do valor e da origem da tarifa efetiva (`Origem da tarifa: Projeto | Cliente | Global`) e da elegibilidade para novos apontamentos (`Elegível para apontamentos`, `Inelegível: cliente inativo` ou `Inelegível: projeto inativo`).
- Bloqueio de exclusão física quando existem apontamentos (ativos ou excluídos logicamente) ou itens de faturamento.

### 3.4. Auditoria e proteção de histórico
- Todas as mutações de `Client` e `Project` (`CREATE`, `UPDATE`, `ACTIVATE`, `DEACTIVATE`, `DELETE`) registram `AuditLog` com snapshots `before` e `after` na mesma transação SQLite (`db.$transaction`).
- Alterações de tarifas em `Settings`, `Client` ou `Project` nunca recalculam `TimeEntry.hourlyRateCents`, `TimeEntry.amountCents` ou `BillingItem`.

---

## 4. Comandos de validação e resultados

Executados nesta máquina em 2026-11-05:

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | Sucesso (0 erros, 0 warnings) |
| `pnpm typecheck` | Sucesso (`tsc --noEmit` sem erros) |
| `pnpm test` | Sucesso — 4 arquivos, **76 testes unitários aprovados** (`money.test.ts`, `rates.test.ts`, `request-policy.test.ts`, `settings-schema.test.ts`) |
| `pnpm test:integration` | Sucesso — 4 arquivos, **25 testes de integração aprovados** em SQLite real temporário (`client-project.test.ts`, `env-loading.test.ts`, `migrations.test.ts`, `settings.test.ts`) |
| `pnpm test:http` | Sucesso — `pnpm build` (11 rotas geradas) + **3 testes HTTP aprovados** (`policy.test.ts`) |
| `E2E_DATABASE_URL="file:/tmp/opencode/horaflow-f1-e2e.db" LD_LIBRARY_PATH="/tmp/opencode/pw-libs/extracted/usr/lib/x86_64-linux-gnu" pnpm test:e2e` | Sucesso — **9 testes E2E aprovados**, 1 ignorado (específico de persistência Docker) |
| `git diff --check` | Sucesso — sem erros de whitespace |

### Testes não executados nesta fase e motivo
- **Smoke de recriação de contêiner Docker (`EXPECTED_SETTINGS_RATE`):** não reexecutado na Fase 1 porque `Dockerfile`, `docker-compose.yml`, scripts de entrypoint, dependências (`package.json`/`pnpm-lock.yaml`) e migrations Prisma não sofreram alterações desde a Fase 0.

---

## 5. Pendências e próximas decisões (Fase 2)

- **Aprovação do usuário para a Fase 1:** pendente. A Fase 2 não será iniciada antes da aprovação explícita deste checkpoint.
- **Decisões de domínio pendentes antes de implementar o serviço de horas na Fase 2** (conforme `docs/planejamento/README.md` e `docs/planejamento/fase-2-horas.md`):
  1. **Intervalo cruzando competência:** confirmar a proposta de atribuir toda a duração ao `workDate` do início, sem fracionar automaticamente o apontamento.
  2. **Sobreposição de intervalos:** confirmar a proposta de bloqueio global entre intervalos ativos (`aStart < bEnd && bStart < aEnd`), permitindo intervalos adjacentes e ignorando lançamentos por duração manual na comparação de janelas.
  3. **Competência fechada:** confirmar o bloqueio de novos lançamentos e edições em cliente/mês fechado até eventual reabertura.
  4. **Tarifa ao editar apontamento:** confirmar a preservação do snapshot gravado por padrão, salvo alteração explícita antes do faturamento.
