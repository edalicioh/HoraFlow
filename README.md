# HoraFlow

Aplicação local de controle de horas, projetos e faturamento para profissionais autônomos e pequenas equipes.
Desenvolvida com Next.js 16 (App Router), TypeScript estrito, Prisma 7, SQLite e Docker.

O sistema opera localmente por padrão (`127.0.0.1`), sem necessidade de login no MVP, com integridade financeira estrita em centavos inteiros (sem ponto flutuante), controle de durações sem truncamento de 24h e auditoria transacional completa.

---

## Funcionalidades do MVP

1. **Configurações e Segurança Local:**
   - Moeda base BRL (`R$`), fuso horário inicial `America/Sao_Paulo`.
   - Política restritiva de segurança: aceita apenas requisições em loopback (`127.0.0.1`, `localhost`), validação de `Origin` e `Host` confiáveis contra CSRF e DNS rebinding.
   - Tema claro e escuro persistente, design responsivo desktop e mobile.

2. **Clientes, Projetos e Tarifas:**
   - Gestão de clientes e projetos com hierarquia tarifária estrita: Tarifa do Projeto > Tarifa do Cliente > Tarifa Global.
   - Desativação suave de cadastros com preservação de todo o histórico faturável.

3. **Apontamento de Horas e Calendário (`/timesheet`):**
   - Calendário mensal interativo com destaque de finais de semana e indicadores diários de horas.
   - Registro por **Duração direta** (sem limite de 24h, suportando jornadas como `24:30`) ou por **Intervalo de início e término** (`startMinutes` a `endMinutes`).
   - Validação atômica contra sobreposição de horários no mesmo dia.
   - Apontamentos marcados como faturáveis ou não faturáveis, vinculados a projeto e cliente.

4. **Fechamento e Faturamento (`/billing`):**
   - Fechamento mensal transacional (`BillingPeriod`) com congelamento imutável de snapshots de tarifa (`rateSnapshotCents`), cliente, projeto e descrição (`BillingItem`).
   - Ciclo de vida financeiro completo: Rascunho -> Fechado (`CLOSED`) -> Parcialmente pago -> Totalmente pago (`PAID`).
   - Registro de pagamentos com validação estrita contra superfaturamento.
   - Estorno auditável de pagamentos com restauração de saldos.
   - Reabertura transacional de fechamentos com liberação auditada de apontamentos (`releasedAt`), mantendo histórico imutável das revisões financeiras.

5. **Dashboard Executivo e Relatórios Oficiais (`/dashboard`, `/reports`):**
   - Indicadores executivos mensais: Horas trabalhadas, Horas faturáveis, Dias trabalhados, Valor acumulado, Recebido na competência e Pendente separado em "A faturar (rascunho)" e "Saldo de fechamentos".
   - Distribuição de horas e faturamento por cliente e projeto com barras proporcionais.
   - Camada única de dados gerando 7 relatórios oficiais: Horas por período, Horas por cliente, Horas por projeto, Apontamentos detalhados, Valores faturáveis, Fechamentos mensais e Pagamentos/pendências.
   - Exportação em três formatos com paridade 1:1:
     - **CSV:** UTF-8 com BOM (`\uFEFF`), delimitador `;`, escape de caracteres e neutralização contra injeção de fórmulas (`=`, `+`, `-`, `@`).
     - **XLSX (`ExcelJS`):** valores monetários formatados, durações completas (`HH:mm`), fórmulas avaliadas e proteção de células.
     - **PDF (`@react-pdf/renderer`):** gerado no servidor Node.js sem Chromium, paginação multi-página, hifenização pt-BR e layout corporativo.

6. **Importação em Lote e Assistente Transacional (`/import`):**
   - Suporte a planilhas **CSV** (RFC 4180, detecção automática de delimitadores `,`, `;`, `\t`, suporte a UTF-8 BOM) e **XLSX** (multi-abas, datas seriais do Excel e durações fracionárias).
   - Wizard em 3 etapas: Envio seguro (limite de 5 MiB / 5.000 linhas), Mapeamento e Prévia consolidada, e Confirmação transacional.
   - Detecção inteligente de duplicidades contra o banco e linhas repetidas no lote via fingerprint SHA-256.
   - Opção para ignorar linhas inválidas (`skipInvalidRows`) ou duplicadas.
   - Snapshots de tarifa calculados no momento da importação e vínculo auditável de lote (`importBatchId`).

7. **Backup e Restauração Consistente do SQLite:**
   - Scripts nativos `scripts/backup.sh` e `scripts/restore.sh` baseados na API de Backup Online do SQLite (`better-sqlite3`).
   - Verificação rigorosa de integridade antes e depois (`PRAGMA integrity_check`).
   - Gestão estrita de modo WAL: fechamento de conexões ativas, remoção de arquivos residuais `-wal` e `-shm` e permissões seguras `0600`.

---

## Requisitos do Ambiente

- **Node.js:** `>= 22.12.0` (validado com Node 22)
- **Gerenciador de pacotes:** `pnpm` 10.13.1 (`corepack enable`)
- **Docker e Docker Compose v2:** (opcional, para implantação em contêiner local)

---

## Instalação e Execução Local

```bash
# 1. Configurar variáveis de ambiente
cp .env.example .env

# 2. Instalar dependências
pnpm install

# 3. Preparar banco SQLite e aplicar migrations
pnpm db:migrate

# 4. Iniciar servidor de desenvolvimento (escuta em 127.0.0.1:3000)
pnpm dev
```

Acesse no navegador: <http://127.0.0.1:3000>

Para rodar em modo produção local:

```bash
pnpm build
pnpm start
```

---

## Scripts de Backup e Restauração

O HoraFlow inclui ferramentas para garantir cópias de segurança consistentes do banco de dados SQLite sem interromper leituras concorrentes:

### 1. Criar Backup Online

```bash
# Gera snapshot consistente com timestamp em data/backups/
./scripts/backup.sh

# Ou especificando um diretório de destino customizado:
./scripts/backup.sh /caminho/meus-backups
```

O script executa `PRAGMA integrity_check` no banco ativo e no snapshot gerado, aplicando permissões `0600` no arquivo resultante.

### 2. Restaurar Snapshot

```bash
./scripts/restore.sh data/backups/horaflow-backup-20261105-120000.db
```

O script:
- Valida a integridade do snapshot antes de qualquer alteração.
- Cria salvaguarda automática do banco atual (`.pre-restore-*`).
- Remove arquivos residuais de log de transação (`-wal` e `-shm`) para evitar corrupção de páginas.
- Copia o snapshot, ajusta permissões e confirma a integridade final.

---

## Suíte de Testes e Qualidade

O projeto conta com automação abrangente de testes:

| Comando | Finalidade |
|---|---|
| `pnpm lint` | Verificação de código com ESLint (0 avisos tolerados) |
| `pnpm typecheck` | Checagem estrita de tipos TypeScript (`tsc --noEmit`) |
| `pnpm test` | Testes unitários (137 testes com Vitest) |
| `pnpm test:integration` | Testes de integração concorrentes com SQLite real (43 testes) |
| `pnpm test:http` | Build de produção Next.js e validação de segurança HTTP |
| `pnpm test:e2e` | 14 cenários ponta a ponta com Playwright em navegador real |
| `pnpm verify` | Execução completa de lint, tipos, unitários, integração e HTTP |

### Executando os testes E2E com Playwright:

```bash
# Instala o navegador Chromium caso ainda não o tenha instalado
pnpm exec playwright install chromium

# Executa os testes E2E
pnpm test:e2e
```

---

## Execução via Docker Compose

```bash
# Subir contêiner
HORAFLOW_PORT=3100 docker compose up -d --build

# Verificar integridade
curl http://127.0.0.1:3100/api/health

# Parar contêiner (os dados permanecem preservados no volume Docker horaflow-data)
docker compose stop
```

---

## Estrutura do Projeto

```text
prisma/                 Schema Prisma, migrations e restrições SQLite
src/app/                Next.js App Router (páginas, layouts e rota de exportação /api)
src/components/         Componentes compartilhados de interface e design system
src/lib/                Utilitários centrais: banco SQLite, dinheiro, duração, datas e erros
src/modules/
  ├── client/           Gestão de clientes e resolução de tarifas
  ├── project/          Gestão de projetos vinculados
  ├── time-entry/       Apontamento de horas, intervalos e validação de sobreposição
  ├── billing/          Fechamento mensal, pagamentos, estornos e reabertura
  ├── dashboard/        KPIs consolidados, métricas e distribuição por cliente/projeto
  ├── reporting/        Motor de relatórios, filtros e exportadores CSV, XLSX e PDF
  ├── import/           Wizard de carga de dados CSV/XLSX, normalização e prévia
  └── settings/         Configurações globais e tarifas padrão
scripts/                Scripts de migração, backup online e restauração consistente
tests/                  Suítes de testes: unitários, integração SQLite, rotas HTTP e E2E
docs/planejamento/      Planos arquiteturais das Fases 0 a 5 e PRD
docs/checkpoints/       Evidências de execução e pareceres de revisão independente
```
