# Checkpoint — Fase 0 (fundação)

- **Estado:** EM REVISÃO (não aprovado)
- **Data da execução:** 2026-11-04
- **Construtor original:** Big Pickle (`opencode/big-pickle`), implementação inicial
- **Retomada corretiva:** GPT-6 Luna (`openai/gpt-6-luna#high`), construtor sequencial único, explicitamente autorizado pelo usuário em 2026-11-04 após indisponibilidade por cota de Big Pickle e DeepSeek
- **Revisão independente:** GPT-6.1 Sol (`openai/gpt-6.1-sol`, agente `reviewer`) pendente após correções
- **Aprovação do usuário:** pendente
- **Fase seguinte:** não iniciada

Este documento registra a entrega técnica da Fase 0. Ele não substitui a
revisão independente nem a aprovação explícita do usuário.

## 1. Escopo e commits

| Item | Valor |
| --- | --- |
| Baseline revisado | `9a00419f755ded3f0fb3e07ef8ed54de8f75dab1` |
| Registro das decisões aprovadas | `06c1270` |
| Implementação da Fase 0 | `5f3ca8470d3f8a166f20694cee4c1f60b1afb2e9` |
| Diff da fase | `9a00419..5f3ca84` — 75 arquivos, +9105/−2 |
| Correções após revisão | `e4088dd0b0e02e9e5c0b457ac7982c8e4b39ab73` |
| Diff corretivo | `33ed65e..e4088dd` — 28 arquivos, +1351/−54 |
| Migração inicial | `prisma/migrations/20261104093005_init` |

A entrega da fase está no commit `5f3ca84`. Um commit posterior apenas inclui
este checkpoint. Nenhum remoto foi publicado.

As alterações de coordenação em `AGENTS.md`/`opencode.jsonc` foram feitas pelo
coordenador e preservadas. Big
Pickle iniciou as correções, mas ficou sem cota; DeepSeek também ficou
indisponível por cota e não executou validações. GPT-6 Luna retomou como
construtor sequencial, sem delegação. A cadeia autorizada e a precedência sobre
instruções antigas estão emendadas no guia de planejamento.

## 2. Decisões de domínio aplicadas

As duas decisões que bloqueavam o schema financeiro foram aprovadas
explicitamente pelo usuário em 2026-11-04 e registradas sem apagar as propostas
originais:

1. **Preservar versões de `BillingItem`.** `releasedAt` libera o apontamento,
   `revision` existe em `BillingPeriod`, `BillingItem` e `Payment`, e há
   unicidade parcial em `BillingItem.timeEntryId WHERE releasedAt IS NULL`.
2. **Congelar identidade histórica.** Nome do cliente, nome do projeto,
   descrição do item, duração, tarifa e valor são snapshots no fechamento.

Isso autorizou somente o schema e os testes de migration. **Os fluxos
financeiros da Fase 3 não foram implementados.**

As demais decisões de domínio continuam pendentes, conforme a tabela de
[`docs/planejamento/README.md`](../planejamento/README.md). O campo de moeda não
é editável; `BRL` é fixo no MVP e protegido por `CHECK` no banco.

## 3. Matriz de versões validada

| Componente | Versão |
| --- | --- |
| Node.js | 22.23.2 (requisito `>=22.12.0`) |
| pnpm | 10.13.1 |
| Next.js | 16.4.5 |
| React / React DOM | 19.3.1 |
| TypeScript | 5.9.3 |
| Prisma / `@prisma/client` | 7.10.1 |
| `@prisma/adapter-better-sqlite3` | 7.10.1 |
| `better-sqlite3` | 12.11.1 |
| Tailwind CSS | 4.3.4 |
| Zod | 4.6.7 |
| Vitest | 5.1.0 |
| Playwright | 1.64.1 |
| Docker Engine / Compose | 29.5.2 / v5.1.4 |

`better-sqlite3` foi fixado em `12.11.1` para coincidir com a faixa suportada
pelo adapter. O build nativo é permitido por `pnpm-workspace.yaml` em
`onlyBuiltDependencies`. O lockfile é único e versionado.

## 4. O que foi entregue

### 4.1 Banco e integridade

- `prisma/schema.prisma` com `Client`, `Project`, `TimeEntry`,
  `BillingPeriod`, `BillingItem`, `Payment`, `Settings`, `AuditLog` e
  `ImportBatch`.
- Enums nativos do Prisma para modo/status; `Json` para auditoria e importação.
- `Settings` como singleton (`id = "singleton"`), com `BRL`, timezone IANA e
  tarifa em centavos.
- Migration inicial com constraints SQL personalizadas:
  - nomes obrigatórios não vazios;
  - valores monetários não negativos;
  - `workDate` no formato civil `YYYY-MM-DD`;
  - duração positiva;
  - coerência entre `mode`, `startAt` e `endAt`, com `endAt > startAt`;
  - mês entre 1 e 12, revisões positivas;
  - `Payment.amountCents > 0`;
  - `Settings.currency = 'BRL'`;
  - status válidos em todas as entidades;
  - não negatividade de totais e contagens.
- FKs restritivas (`RESTRICT`) nas relações de cadastros, horas e financeiro;
  `ImportBatch` usa `SET NULL` em `TimeEntry.importBatchId`.
- Unicidade `BillingPeriod(clientId, year, month)`.
- Índice único parcial
  `BillingItem_timeEntryId_active_key ON BillingItem(timeEntryId) WHERE releasedAt IS NULL`,
  criado por SQL na migration.
- SQLite preparado com `journal_mode=WAL`, `foreign_keys=ON`,
  `busy_timeout=5000` e arquivo com permissão `0600`.
- Prisma 7 com `prisma.config.ts`, cliente gerado em `src/generated/prisma` e
  adapter `better-sqlite3` em runtime. O navegador não acessa o banco.

### 4.2 Aplicação

- App Router com layout raiz, providers de tema e toaster.
- Sidebar no desktop e menu acessível no mobile.
- Tema claro/escuro sem chamada externa e sem erro de hidratação.
- Rotas `/dashboard`, `/timesheet`, `/clients`, `/projects`, `/billing`,
  `/reports`, `/import` e `/settings`; `/` redireciona para `/dashboard`.
- Estados vazios reais nas áreas ainda não implementadas, sem métricas
  fictícias.
- Páginas de loading, erro e não encontrada.
- `/settings` funcional: formulário com validação Zod no servidor, persistência,
  auditoria antes/depois e moeda BRL não editável.
- `/api/health` verifica o banco e retorna apenas `{"status":"ok"}` ou `503`,
  sem caminho, dados ou stack trace.
- Helpers compartilhados de moeda (centavos inteiros e parsing pt-BR), erros de
  domínio, ambiente e cliente Prisma.

### 4.3 Testes

- **Unitários (25):** parsing/formatação monetária e schemas de configuração.
- **Integração (11):** aplicação da migration em SQLite vazio, segunda execução
  no-op, WAL/FK/busy timeout efetivos, índice parcial (incluindo bloqueio do
  segundo item ativo e liberação por `releasedAt`), unicidade de competência,
  FK restritiva, checks de duração/moeda, singleton concorrente, persistência,
  auditoria e proteção do BRL.
- **E2E (6 + 1 específico de Docker):** abertura sem login, navegação desktop e
  mobile, tema, healthcheck, salvamento de configurações, rejeição de valor
  inválido e persistência após recriar o contêiner.
- Bancos de teste exclusivos em `/tmp/opencode/horaflow-f0-*`; nenhum teste usa
  o banco real.

### 4.4 Docker e operação

- `Dockerfile` multi-stage com instalação pelo lockfile, build de produção e
  estágio de runtime com dependências de produção.
- Entrypoint executa `prepare-local-db` e `prisma migrate deploy`; falha de
  migration impede o servidor de iniciar.
- Runtime como usuário não-root `nextjs` (uid/gid 1001).
- Volume nomeado `horaflow-f0-data` em `/data`; banco com owner `nextjs` e
  permissão `0600`.
- Compose publica `127.0.0.1:${HORFLOW_PORT:-3000}:3000`, com
  `restart: unless-stopped`, `no-new-privileges`, `cap_drop: ALL` e healthcheck.
- Imagem final: `horaflow:phase-0`, ID
  `sha256:9a67a6d67a3f2f1f42f674c2e1b8ff8233eb73f3235cbe25fa97d1c1bd5e5a93`
  (1,14 GB).
- README documenta execução local, testes, Docker e isolamento de dados.

## 5. Evidências executadas

Todas as execuções abaixo ocorreram nesta máquina em 2026-11-04.

| Comando / verificação | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` (estágio Docker limpo) | Sucesso, incluindo build nativo do `better-sqlite3` |
| `pnpm lint` | Sucesso, zero warnings |
| `pnpm typecheck` | Sucesso |
| `pnpm test` | 2 arquivos, 25 testes aprovados |
| `pnpm test:integration` | 2 arquivos, 11 testes aprovados |
| `pnpm test:e2e` | 6 aprovados, 1 ignorado (específico de Docker) |
| E2E de persistência no contêiner | 1 aprovado com `EXPECTED_SETTINGS_RATE=150,00` |
| `pnpm build` | Sucesso; 10 rotas geradas |
| `docker compose config` | Configuração válida |
| `docker compose build` | Sucesso |
| Subida em `HORFLOW_PORT=3100` | Healthcheck `healthy` |
| `GET /api/health` | `200` com `{"status":"ok"}` |
| `docker exec … id` | `uid=1001(nextjs) gid=1001(nodejs)` |
| `GET /data/horaflow.db` | `404` (banco não exposto) |
| Recriação do contêiner | Migration `No pending migrations to apply` |
| Persistência | `defaultHourlyRateCents = 15000` antes e depois de recriar e de reconstruir a imagem |
| Volume após o smoke | `horaflow-f0-data` mantido; contêiner apenas parado |

### 5.2 Revisão corretiva após bloqueio independente

A primeira revisão independente bloqueou a entrega com três achados. Correções
e evidências desta retomada:

1. **Alta — interface de escuta no host:** scripts `dev` e `start` fixados em
   `127.0.0.1`; Docker mantém escuta interna adequada em `0.0.0.0` e publicação
   externa do host em `127.0.0.1`. E2E de desenvolvimento consultou `ss` na
   porta 3100 e confirmou somente `127.0.0.1`; teste HTTP contra o servidor de
   produção consultou `ss` na porta 3101 e confirmou somente `127.0.0.1`.
   Docker Compose publicou em `127.0.0.1:3100`.
2. **Alta — Host/Origin/CSRF:** adicionada política server-side em `src/proxy.ts`
   para todas as rotas, com loopback como padrão e lista explícita
   `HORAFLOW_TRUSTED_HOSTS` sem curingas. Host desconhecido é recusado inclusive
   em leitura; `X-Forwarded-Host` e `Forwarded` não substituem o Host e devem
   coincidir. Server Action também valida Host e exige Origin HTTP(S) presente,
   não nula e correspondente ao host; ausência, `null`, origem divergente e
   headers forwarded contraditórios são recusados. Teste HTTP contra build e
   servidor de produção: 3 testes aprovados, incluindo host desconhecido com
   origem maliciosa igual, origens inválidas, forwarded conflitante, leitura
   local legítima e mutação local legítima. Configuração e documentação em
   `.env.example`/README.
3. **Média — `.env` do preparo SQLite:** resolução unificada carrega os mesmos
   arquivos dotenv com precedência para variáveis exportadas. Teste cria projeto
   isolado onde apenas `.env` define URL relativa não padrão; confirma que só o
   arquivo esperado foi criado, ausência do banco padrão, diretório `0700`, DB
   `0600`, WAL e log do preparo com `foreign_keys=1` e `busy_timeout=5000`; Prisma
   aplica migration nesse mesmo banco.
4. **Rollback integral de Settings:** teste injeta falha de banco no insert de
   auditoria e confirma que timezone, tarifa e contagem de auditoria permanecem
   exatamente como antes da transação.

Também foram ampliados checks negativos para pagamentos, revisões, ID fixo do
singleton e FKs, e concorrência de inicialização por conexões SQLite
independentes. Para contendas temporárias da conexão no upsert, `getSettings`
repete apenas erro Prisma P1008 até duas vezes; outros erros são propagados.
Navegação mobile/teclado permanece coberta pelo E2E e o E2E atual passou com
teste explícito de escuta local.

Comandos corretivos executados nesta máquina:

| Comando / verificação | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Sucesso, lockfile inalterado |
| `pnpm lint` | Sucesso, zero warnings |
| `pnpm typecheck` | Sucesso |
| `pnpm test` | 2 arquivos, 25 testes aprovados |
| `pnpm test:integration` | 3 arquivos, 16 testes aprovados |
| `pnpm test:http` | Build produção + 3 testes HTTP aprovados |
| `LD_LIBRARY_PATH=/tmp/opencode/pw-libs/extracted/usr/lib/x86_64-linux-gnu pnpm test:e2e` | 7 aprovados, 1 Docker-only ignorado; inclui bind real de dev |
| `DOCKER_CONFIG=/tmp/opencode/docker-anon docker compose -p horaflow-f0 config` | Configuração válida, bind `127.0.0.1` e volume de teste esperado |
| `DOCKER_CONFIG=/tmp/opencode/docker-anon docker compose -p horaflow-f0 build` | Sucesso após incluir scripts no estágio de dependências |
| Compose up em porta 3100 + healthcheck | `200 {"status":"ok"}`, contêiner healthy, uid 1001, DB `0600`, rota pública do banco `404` |
| Recriação de contêiner com volume preservado | Migration sem pendências; Settings permaneceu `America/Sao_Paulo`, BRL, `15000` centavos |
| `docker compose -p horaflow-f0 stop` | Contêiner próprio parado; volume `horaflow-f0-data` preservado |
| `git diff --check` | Sem whitespace errors |

### 5.1 Condições específicas desta máquina

- O host não possui `libasound.so.2`, exigida pelo Chromium do Playwright. O E2E
  foi executado com `LD_LIBRARY_PATH=/tmp/opencode/pw-libs/extracted/usr/lib/x86_64-linux-gnu`,
  apontando para extração local, sem alteração do sistema ou do projeto. A
  primeira tentativa usou caminho pai incorreto e falhou; a repetição com o
  diretório real passou. Em outra máquina, instale as dependências de sistema.
- As credenciais antigas do Docker Hub nesta máquina estão inválidas. O build e
  o smoke usaram `DOCKER_CONFIG=/tmp/opencode/docker-anon` apenas para pulls
  anônimos de imagens públicas. Nenhuma credencial ou configuração do usuário
  foi alterada.
- O `next dev` acrescentou um bloco de instruções ao `AGENTS.md`; ele foi
  preservado e commitado junto com a fase.
- A primeira tentativa de build Docker após mudança em `prisma.config.ts`
  revelou que `scripts/` não estava copiado antes do `postinstall`; o Dockerfile
  foi corrigido e rebuild/smoke completos passaram. Aviso Prisma sobre
  identificação automática de OpenSSL apareceu durante instalação; build e
  runtime Docker passaram com OpenSSL instalado na imagem final.

## 6. Rastreabilidade dos requisitos da fase

| Requisito da Fase 0 | Situação |
| --- | --- |
| Baseline, Git local e lockfile único | Atendido |
| Matriz de versões e compatibilidade | Atendida |
| Modelagem inicial completa, incluindo financeiro | Atendida |
| Migration com índices, FKs e constraints SQL | Atendida |
| Settings singleton validado no servidor | Atendida |
| Interface base, tema e responsividade | Atendida |
| Estados de loading, erro e vazio | Atendidos |
| Sem fontes/chamadas externas obrigatórias | Atendido |
| Docker reproduzível, não-root e volume | Atendido |
| Migrations antes do servidor | Atendido |
| Healthcheck sem dados sensíveis | Atendido |
| Banco fora de `public/` e sem rota pública | Atendido |
| Persistência após recriar o contêiner | Comprovada |
| Testes unitários, integração e E2E | Executados |
| Scripts de qualidade (`lint`, `typecheck`, `test`, `build`) | Executados |

## 7. Pendências e limites conhecidos

- **Revisão independente e aprovação do usuário:** obrigatórias antes da
  Fase 1.
- **Decisões de domínio ainda pendentes:** regras de competência/sobreposição,
  desativação de cadastros, arredondamento de fechamento, pagamentos
  parciais/estornos, reabertura, política de troca de moeda e limites de
  importação. Ver a tabela do guia de planejamento.
- **Fluxos das fases seguintes:** cadastros, apontamentos, fechamento,
  pagamentos, relatórios, PDF/XLSX e importação não foram implementados. As
  páginas correspondentes são estados vazios reais.
- **Sem autenticação:** por escopo do MVP. A aplicação deve permanecer local ou
  em rede privada explicitamente configurada.
- **Imagem Docker:** 1,14 GB por incluir dependências de produção e a CLI do
  Prisma necessária às migrations. Otimização de imagem não bloqueia a fase.
- **Teste E2E de sistema:** depende das bibliotecas gráficas do Chromium no
  host, documentadas no README.

## 8. Como reproduzir

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e

HORFLOW_PORT=3100 docker compose up -d --build
curl http://127.0.0.1:3100/api/health
# alterar a tarifa em http://127.0.0.1:3100/settings
docker compose up -d --force-recreate
curl http://127.0.0.1:3100/api/health
docker compose stop
```

Não executar `docker compose down -v` sem autorização: o volume contém dados.
