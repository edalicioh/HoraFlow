# Checkpoint — Fase 5: Importação e Estabilização

**Data:** 2026-11-05
**Executor da implementação:** Gemini 4 Argon (Medium) (`inherit`), autorizado pelo usuário para execução sequencial no ambiente Google Antigravity (`AGENTS.md`).
**Revisor independente:** Subagente `reviewer` (`f73d3ec5-9574-4163-831f-932f34dfd794`), somente leitura (`EnableWriteTools: false`, `EnableSubagentTools: false`, `EnableMCPTools: false`).
**Status:** Implementada, verificada em todas as suítes (incluindo Docker smoke test) e revisada independentemente — **Aguardando homologação final do usuário e planilha física original de outubro/2026 para o aceite histórico real**.

---

## 1. Resumo das Entregas da Fase 5

1. **Analisadores Seguros CSV e XLSX (`src/modules/import/parsers/`):**
   - **CSV ([`src/modules/import/parsers/csv.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/parsers/csv.ts)):**
     - Valida limite de tamanho (`MAX_IMPORT_FILE_SIZE = 5 MiB`), rejeita arquivos binários/PDF/ZIP disfarçados (`%PDF`, `PK\x03\x04`, bytes nulos `0x00`), remove UTF-8 BOM (`0xFEFF`), detecta automaticamente delimitador (`;`, `,`, `\t`), analisa campos RFC 4180 com quebras de linha e aspas escapadas (`""`) e aplica limite seguro de `MAX_IMPORT_ROWS = 5_000`.
   - **XLSX ([`src/modules/import/parsers/xlsx.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/parsers/xlsx.ts)):**
     - Inspeciona o pacote ZIP antes de carregar no `ExcelJS` (`validateXlsxZipContainer`), validando assinatura `PK\x03\x04`, máximo de 1.000 entradas internas, limite de tamanho descompactado de `MAX_XLSX_UNCOMPRESSED_SIZE = 25 MiB` (prevenção contra zip bombs) e bloqueio estrito de macros VBA (`vbaProject.bin` e extensão `.xlsm`).
     - Extrai todas as abas legíveis (`sheetsData`) para permitir alternância dinâmica de aba (`sheetName`) no passo de mapeamento e prévia.
     - Não executa fórmulas: lê apenas valores já avaliados (`cell.result`), datas nativas/seriais do Excel e durações fracionárias ou textuais (`HH:mm`, inclusive `>24h`).

2. **Serviço de Importação em Lote, Prévia e Confirmação Transacional ([`src/modules/import/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/service.ts)):**
   - **Upload e Criação de Lote (`createImportBatchFromFile`):** cria registro `ImportBatch` com status `PENDING`, hash SHA-256 do arquivo, abas detectadas e linhas brutas fora de `public/`.
   - **Mapeamento e Prévia (`previewImportBatch`):**
     - Permite alternar entre abas de planilhas XLSX multi-abas (`mapping.sheetName`), atualizando cabeçalhos e linhas da aba selecionada.
     - Valida que o cliente e o projeto de destino existem, pertencem um ao outro e estão ativos (`active = true`).
     - Resolve o snapshot da tarifa horária (`resolveHourlyRateWithSource`) e calcula `amountCents` por apontamento usando `calculateTimeEntryAmountCents` (aritmética inteira com arredondamento half-up `BigInt`).
     - Verifica competências fechadas (`BillingPeriod.status = CLOSED`) do cliente e invalida linhas cuja data civil (`workDate`) caia em mês fechado.
     - Detecta duplicidades tanto dentro do próprio arquivo quanto contra apontamentos ativos existentes no banco via fingerprint SHA-256 (`computeRowFingerprint`).
   - **Confirmação Transacional e Idempotência (`confirmImportBatch`):**
     - Executa integralmente dentro de `withSqliteWriteTransaction`.
     - **Idempotência:** chamadas repetidas para um lote já `IMPORTED` retornam o resultado consolidado sem duplicar lançamentos.
     - **Guarda RF10:** bloqueia por padrão lotes com linhas inválidas, permitindo importar apenas as válidas somente quando `skipInvalidRows: true` é marcado explicitamente.
     - **Revalidação transacional:** revalida dentro da transação de escrita se cliente e projeto permanecem ativos e se nenhuma competência das linhas a importar foi fechada concorrentemente entre a prévia e a confirmação.
     - Insere apontamentos com `mode: "DURATION"`, `status: "DRAFT"` e `importBatchId: batch.id`, atualiza o lote para `IMPORTED` e grava auditoria em `AuditLog` (`entity: "ImportBatch"`, `action: "IMPORT"`).

3. **Assistente de Importação (`/import`) e Server Actions (`src/modules/import/components/import-wizard.tsx`, `src/modules/import/actions.ts`):**
   - Fluxo guiado em 3 etapas: Upload seguro -> Mapeamento de colunas/aba/formatos/destino + Tabela de prévia validada com indicadores consolidados -> Confirmação transacional com opções explícitas para linhas inválidas e duplicadas.
   - Protegido por `evaluateRequestPolicy` e revalidação automática de `/import`, `/timesheet`, `/dashboard`, `/reports` e `/billing`.

4. **Backup Online e Restauração Consistente do SQLite (`scripts/backup.sh`, `scripts/backup.mjs`, `scripts/restore.sh`, `scripts/restore.mjs`):**
   - `scripts/backup.sh` / `scripts/backup.mjs`: utiliza `loadProjectEnv()`, `resolveDatabaseFile()`, `PRAGMA integrity_check` pré e pós-cópia e a API de Backup Online do SQLite (`better-sqlite3.backup`), gravando snapshots com permissão `0600` fora de `public/` (`data/backups/` por padrão ou diretório customizado via argumento/variável `HORAFLOW_BACKUP_DIR`).
   - `scripts/restore.sh` / `scripts/restore.mjs`: valida `PRAGMA integrity_check` do arquivo de origem, cria salvaguarda automática (`.pre-restore-*`), remove arquivos `-wal` e `-shm` residuais, restaura com permissão `0600` e verifica a integridade pós-restauração.

5. **Documentação e Operação (`README.md`, `Dockerfile`, `compose.yaml`):**
   - [`README.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/README.md) completo documentando arquitetura, instalação local, backup/restauração, suíte de testes e execução via Docker Compose.
   - [`Dockerfile`](file:///mnt/Storage/projetos/edalicio/HoraFlow/Dockerfile) e [`compose.yaml`](file:///mnt/Storage/projetos/edalicio/HoraFlow/compose.yaml) atualizados e verificados com build multi-stage real e teste de persistência de volume após recriação do contêiner.

---

## 2. Arquivos Criados e Modificados

### Criados
- [`src/modules/import/types.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/types.ts)
- [`src/modules/import/schema.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/schema.ts)
- [`src/modules/import/parsers/csv.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/parsers/csv.ts)
- [`src/modules/import/parsers/xlsx.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/parsers/xlsx.ts)
- [`src/modules/import/service.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/service.ts)
- [`src/modules/import/action-state.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/action-state.ts)
- [`src/modules/import/actions.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/actions.ts)
- [`src/modules/import/components/import-wizard.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/modules/import/components/import-wizard.tsx)
- [`scripts/backup.sh`](file:///mnt/Storage/projetos/edalicio/HoraFlow/scripts/backup.sh) e [`scripts/backup.mjs`](file:///mnt/Storage/projetos/edalicio/HoraFlow/scripts/backup.mjs)
- [`scripts/restore.sh`](file:///mnt/Storage/projetos/edalicio/HoraFlow/scripts/restore.sh) e [`scripts/restore.mjs`](file:///mnt/Storage/projetos/edalicio/HoraFlow/scripts/restore.mjs)
- [`tests/unit/import-parsers.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/unit/import-parsers.test.ts)
- [`tests/integration/import-batch.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/integration/import-batch.test.ts)
- [`tests/e2e/import.spec.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/e2e/import.spec.ts)
- [`docs/checkpoints/fase-5.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/checkpoints/fase-5.md)

### Modificados
- [`src/app/(app)/import/page.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/app/(app)/import/page.tsx)
- [`src/components/ui/badge.tsx`](file:///mnt/Storage/projetos/edalicio/HoraFlow/src/components/ui/badge.tsx)
- [`Dockerfile`](file:///mnt/Storage/projetos/edalicio/HoraFlow/Dockerfile) e [`compose.yaml`](file:///mnt/Storage/projetos/edalicio/HoraFlow/compose.yaml)
- [`README.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/README.md)
- [`docs/planejamento/README.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/planejamento/README.md)
- [`docs/planejamento/fase-5-importacao-estabilizacao.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/planejamento/fase-5-importacao-estabilizacao.md)
- [`docs/checkpoints/fase-4.md`](file:///mnt/Storage/projetos/edalicio/HoraFlow/docs/checkpoints/fase-4.md)

---

## 3. Comandos de Validação Executados e Resultados

| Comando | Resultado | Detalhes |
|---|---|---|
| `pnpm lint` | **PASS (exit 0)** | 0 erros e 0 warnings em todo o repositório. |
| `pnpm typecheck` | **PASS (exit 0)** | `tsc --noEmit` sem erros de tipos. |
| `pnpm test` | **PASS (exit 0)** | 10 suítes unitárias, **137 testes aprovados**, incluindo [`tests/unit/import-parsers.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/unit/import-parsers.test.ts) (14 testes cobrindo CSV com BOM/aspas/delimitadores, rejeição de PDF/binário disfarçado, XLSX multi-abas/fórmulas avaliadas e normalizadores de data/duração/fingerprint). |
| `pnpm test:integration` | **PASS (exit 0)** | 8 suítes de integração em SQLite real, **43 testes aprovados**, incluindo [`tests/integration/import-batch.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/integration/import-batch.test.ts) (6 testes cobrindo ciclo completo e idempotência, duplicidades, `skipInvalidRows`, alternância de abas XLSX, bloqueio de competência fechada `CLOSED` na prévia e na confirmação transacional, cenário sintético de outubro/2026 com 9 registros e 24h30 / 1470 minutos, e execução real de `scripts/backup.sh` e `scripts/restore.sh`). |
| `pnpm test:http` | **PASS (exit 0)** | `prisma generate && next build` compilou todas as rotas de produção + 3 testes HTTP (`tests/http/policy.test.ts`) aprovados. |
| `PLAYWRIGHT_BASE_URL="http://127.0.0.1:3100" E2E_DATABASE_URL="file:/tmp/opencode/horaflow-f5-e2e.db" LD_LIBRARY_PATH="/tmp/opencode/pw-libs/extracted/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}" pnpm test:e2e` | **PASS (exit 0)** | **13 testes E2E aprovados** contra o servidor de produção local (`next start`), incluindo [`tests/e2e/import.spec.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/e2e/import.spec.ts). |
| `DOCKER_CONFIG=/tmp/opencode/docker-anon HORAFLOW_PORT=3210 docker compose up -d --build` + `EXPECTED_SETTINGS_RATE="150,00" PLAYWRIGHT_BASE_URL="http://127.0.0.1:3210" pnpm test:e2e tests/e2e/settings.spec.ts` | **PASS (exit 0)** | Build multi-stage Docker concluído, healthcheck `200 OK` em `127.0.0.1:3210`, recriação do contêiner (`--force-recreate`) e aprovação do 14º teste E2E (`mantém a configuração após recriar o contêiner Docker`), totalizando **14/14 cenários E2E comprovados**. |

---

## 4. Parecer da Revisão Independente (`reviewer`)

- **Revisor:** Subagente `reviewer` (`f73d3ec5-9574-4163-831f-932f34dfd794`), somente leitura.
- **Resultado:** **APROVADO SEM BLOQUEIOS** — 0 achados Críticos, 0 Altos, 0 Médios e 2 observações Baixas cosméticas não bloqueantes (ambas documentadas/alinhadas).
- **Correções preventivas aplicadas antes do parecer final:**
  1. Adicionado bloqueio de lançamentos em competência fechada (`BillingPeriod.status = CLOSED`) tanto na geração da prévia (`previewImportBatch`) quanto na transação de confirmação (`confirmImportBatch`), além de revalidação transacional de cliente/projeto ativos e uso de `calculateTimeEntryAmountCents`.
  2. Persistido `sheetsData` em lotes XLSX multi-abas para permitir alternar entre abas (`sheetName`) durante o mapeamento sem perda de dados das demais abas, além de validação de pacote ZIP (`MAX_XLSX_UNCOMPRESSED_SIZE = 25 MiB` e bloqueio de `vbaProject.bin`).
  3. Alinhados `scripts/backup.mjs` e `scripts/restore.mjs` com `loadProjectEnv()` e `resolveDatabaseFile()`, suporte a argumento posicional de diretório destino, proteção contra destino em `public/` e cobertura por teste de integração executando `sh scripts/backup.sh` e `sh scripts/restore.sh`.

---

## 5. Distinção entre Entregas Concluídas e Pendência Externa

- **Pronto, testado e verificado:**
  - Todas as funcionalidades das Fases 0 a 5 (Fundação, Cadastros/Tarifas, Horas/Calendário, Fechamento/Pagamentos/Estornos/Reabertura, Dashboard/7 Relatórios/Exportadores CSV-XLSX-PDF, Wizard de Importação CSV/XLSX, Backup/Restauração Online SQLite e Docker Compose).
  - Cenário representativo de outubro/2026 (**9 registros e 24h30 / 1470 minutos**) validado com dados sintéticos em [`tests/integration/import-batch.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/integration/import-batch.test.ts).
- **Pendente de insumo externo do usuário:**
  - **Conferência do aceite histórico real com a planilha física original de outubro/2026:** conforme regra estrita do `AGENTS.md` (*"Sem a planilha real, dados sintéticos não comprovam o aceite de outubro/2026"*), o sistema está pronto para importar a planilha original assim que você disponibilizar o arquivo.
