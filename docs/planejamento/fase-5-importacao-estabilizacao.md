# Fase 5 — Importação e estabilização

**Estado:** Concluída (implementada, verificada em todas as suítes e revisada independentemente).
**Executor:** Gemini 4 Argon (Medium) (`inherit`), autorizado pelo usuário para execução sequencial no ambiente Google Antigravity (`AGENTS.md`).
**Revisor padrão:** Subagente `reviewer` (`f73d3ec5-9574-4163-831f-932f34dfd794`), independente e somente leitura antes do checkpoint.
**Dependência:** Fase 4 aprovada; validação histórica de outubro/2026 (9 registros e 24h30 / 1470 minutos) executada com cenário sintético controlado e pronta para receber o arquivo real do usuário.

## 1. Objetivo

Importar histórico CSV/XLSX com prévia, validação e confirmação transacional, comprovar os cenários de aceite e entregar operação local confiável com backup/restauração documentados.

O cenário representativo de outubro/2026 com **9 registros e 24h30 (1470 minutos)** foi validado com dados sintéticos no teste de integração [`tests/integration/import-batch.test.ts`](file:///mnt/Storage/projetos/edalicio/HoraFlow/tests/integration/import-batch.test.ts). O aceite histórico real definitivo com a planilha física original aguarda o fornecimento do arquivo pelo usuário, conforme estabelecido no PRD e no `AGENTS.md`.

## 2. Tratamento da fonte histórica

- [x] Wizard preparado para receber o arquivo por meio autorizado e manter dados privados fora de commits públicos.
- [x] Inspecionar nomes de abas, cabeçalhos, células, datas, duração e linhas de totais implementado no parser XLSX/CSV.
- [x] Seletor explícito de aba XLSX suportado no assistente de importação (`sheetName`).
- [x] PDF serve apenas para conferência visual/manual; importação direta de PDF permanece fora do MVP.
- [x] Não inserir dados reais automaticamente como seed de desenvolvimento ou inicialização de produção respeitado integralmente.

## 3. Wizard de importação

### 3.1. Upload e leitura segura

- [x] Aceita somente CSV/XLSX com validação real de conteúdo no servidor (assinaturas e buffers).
- [x] Limite de 5 MiB por arquivo e máximo de 5.000 linhas implementado e testado.
- [x] Nome do arquivo tratado estritamente como metadado, sem path traversal.
- [x] Temporários mantidos fora de `public/` no banco SQLite em `ImportBatch` com payload auditável.
- [x] Rejeição de arquivos corrompidos e formatos inválidos com mensagens amigáveis em pt-BR.
- [x] Fórmulas não são executadas; resultados calculados (`cell.result`) são lidos de forma segura via `ExcelJS`.
- [x] CSV com suporte a delimitador detectado automaticamente (`;`, `,`, `\t`), suporte a UTF-8 BOM e acentuação pt-BR.

### 3.2. Mapeamento

- [x] Usuário associa colunas de data, duração, descrição e faturável, além da aba XLSX e cliente/projeto de destino.
- [x] Associação obrigatória a cliente e projeto válidos (projeto deve pertencer ao cliente selecionado).
- [x] Tarifa snapshot congelada no momento da prévia e conferida na confirmação.
- [x] Suporte a `DD/MM/AAAA` e `YYYY-MM-DD` com normalização de data civil.
- [x] Tratamento de datas seriais do Excel e ajuste de época 1900/1904.
- [x] Suporte a duração em `HH:mm` (inclusive >24h), frações de dia do Excel e horas decimais opcionais (`decimal_hours`).
- [x] Ignora linhas vazias e identifica cabeçalhos na prévia sem descarte silencioso.

### 3.3. Validação e prévia

- [x] Prévia consolidada com contagens de válidas, inválidas, duplicadas, total de minutos e valor financeiro exato em BRL.
- [x] Reutiliza regras de validação do domínio (duracão positiva, data civil válida, rate snapshot).
- [x] Fingerprint SHA-256 (`computeRowFingerprint`) gerado por linha para detecção de duplicidades.
- [x] Detecção de repetição interna no lote e contra apontamentos ativos existentes no banco.
- [x] Opção explícita do usuário para importar ou ignorar possíveis duplicatas.
- [x] Atualização de mapeamento gera nova prévia consistente e invalida a anterior.

### 3.4. Confirmação e transação

- [x] Prévia guardada no servidor vinculada ao lote (`batchId`); navegador não envia valores financeiros arbitrários.
- [x] Lote persistido com estados `PENDING → PREVIEWED → IMPORTED / FAILED` e rastreabilidade total.
- [x] Atomicidade estrita via transação SQLite (`withSqliteWriteTransaction`): todas as linhas ou nenhuma.
- [x] Bloqueio por padrão de linhas inválidas, permitindo `skipInvalidRows` como opção explícita conforme RF10.
- [x] Idempotência na confirmação: segunda confirmação do mesmo lote não duplica apontamentos.
- [x] Rollback integral em caso de qualquer falha na transação.
- [x] Vínculo dos apontamentos criados ao lote (`importBatchId`).
- [x] Registro auditável no `AuditLog` (`entity: "ImportBatch"`, `action: "IMPORT"`).

## 4. Backup e restauração

- [x] Implementados `scripts/backup.sh` (com `scripts/backup.mjs`) e `scripts/restore.sh` (com `scripts/restore.mjs`).
- [x] Utiliza a API de Backup Online do SQLite (`better-sqlite3.backup`) para consistência em modo WAL sem bloqueio de leituras.
- [x] Destino fora de rotas públicas (`data/backups/`), permissões restritas `0600` e verificação pré e pós de integridade (`PRAGMA integrity_check`).
- [x] Procedimento de restauração cria salvaguarda automática (`.pre-restore-*`), fecha conexões ativas e remove arquivos residuais `-wal`/`-shm`.
- [x] Coberto por teste automatizado de integração em SQLite real WAL mode (`tests/integration/import-batch.test.ts`).

## 5. Estabilização e documentação

- [x] `README.md` atualizado com arquitetura completa, instalação, backup, restauração, importação e testes.
- [x] Nenhuma credencial ou dado privado em arquivos versionados.
- [x] Mensagens de erro em pt-BR e conformidade estrita de tipagem TypeScript.
- [x] Foco, acessibilidade por teclado, tema escuro e responsividade validados em E2E.
- [x] Servidor sem login, bind restrito a loopback local.

## 6. Matriz de testes e critérios de aceite final

- [x] `tests/unit/import-parsers.test.ts`: 14 testes unitários de parsers CSV/XLSX, rejeição de PDF/binários/macros disfarçados, normalizadores e fingerprints.
- [x] `tests/integration/import-batch.test.ts`: 6 testes de integração com ciclo completo de lote, duplicidades, `skipInvalidRows`, alternância de abas em XLSX multi-abas, bloqueio de competência fechada (`BillingPeriod.status = CLOSED`) na prévia e na confirmação transacional, cenário sintético de outubro/2026 (9 registros e 24h30) e execução real de `scripts/backup.sh` e `scripts/restore.sh` em modo WAL.
- [x] `tests/e2e/import.spec.ts`: Teste E2E cobrindo upload de arquivo CSV, mapeamento, prévia, confirmação transacional e reflexo imediato no `/timesheet` e `/dashboard`.
- [x] Todas as suítes executadas com 100% de aprovação (`pnpm verify`: 137 unitários, 43 integração SQLite, 3 HTTP + `pnpm test:e2e`: 14 cenários E2E incluindo persistência após recriação do contêiner Docker).
- [ ] Aceite histórico real com a planilha física original de outubro/2026 (9 registros e 1470 minutos / 24h30): **aguardando fornecimento do arquivo original pelo usuário** (o cenário sintético equivalente está validado e aprovado, mas conforme `AGENTS.md` não substitui a conferência contra a fonte real).
