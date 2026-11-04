# HoraFlow

Aplicação local de controle de horas, projetos e faturamento. Este repositório
está na **Fase 0 (fundação)** do plano em [`docs/planejamento/`](docs/planejamento/README.md).
A entrega atual é um scaffold executável: navegação base, configurações
persistentes, banco migrável, testes e Docker. Os fluxos das fases seguintes
ainda **não** foram implementados.

## Requisitos

- Node.js 22.12 ou superior (validado com 22.23.2)
- pnpm 10.13.1 (`corepack enable`)
- Docker com Compose v2 para a execução em contêiner

## Execução local

```bash
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm dev
```

A aplicação fica em <http://127.0.0.1:3000>. Tanto `pnpm dev` quanto `pnpm start`
escutam somente em `127.0.0.1` no host. O `pnpm dev` prepara o SQLite com
WAL, `foreign_keys=ON` e `busy_timeout`, aplica as migrations pendentes e inicia
o Next.js. Não há autenticação no MVP; a exposição padrão é local.

Hosts recebidos são permitidos apenas para loopback por padrão (`127.0.0.1`,
`localhost` e `[::1]`, em qualquer porta). Para uma implantação privada atrás
de proxy, configure explicitamente `HORAFLOW_TRUSTED_HOSTS` com hosts exatos
(separados por vírgula; pode incluir `:porta`). Não use curingas; encaminhe o
mesmo host em `Host` e `X-Forwarded-Host`/`Forwarded`. Todas as requisições,
inclusive leituras, têm host verificado. Mutations também exigem `Origin` HTTP(S)
válida, não nula e igual ao host confiável; origem ausente ou `null` é rejeitada.
Não confie em `X-Forwarded-Host` enviado livremente: o app o aceita somente se
coincidir com `Host`. Configurar host confiável não muda a interface de escuta;
acesso remoto deve permanecer em rede privada explicitamente configurada.

O banco local fica em `data/horaflow.db`, ignorado pelo Git. Nunca coloque
bancos, backups ou uploads em `public/`.

## Scripts

| Comando | Finalidade |
| --- | --- |
| `pnpm dev` | Prepara banco, aplica migrations e sobe o Next.js em `127.0.0.1:3000` |
| `pnpm build` | Gera o Prisma Client e compila a aplicação |
| `pnpm start` | Inicia a build de produção em `127.0.0.1:3000` |
| `pnpm lint` | ESLint com zero warnings |
| `pnpm typecheck` | TypeScript estrito, sem emissão |
| `pnpm test` | Testes unitários (Vitest) |
| `pnpm test:integration` | Integração real com SQLite em `/tmp/opencode` |
| `pnpm test:http` | Build de produção e testes HTTP contra ela |
| `pnpm test:e2e` | Playwright em `127.0.0.1:3100` com banco exclusivo |
| `pnpm verify` | Lint, typecheck, unitários, integração e testes HTTP (inclui build) |
| `pnpm db:migrate` | Prepara o banco e aplica migrations |

Os testes de integração criam bancos descartáveis em
`/tmp/opencode/horaflow-f0-*`; o E2E usa `horaflow-f0-e2e.db` no mesmo diretório.
Nenhum teste aponta para o banco real do usuário.

### Playwright

Instale o navegador antes da primeira execução:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

O E2E sobe automaticamente um servidor de desenvolvimento na porta `3100` com
banco próprio. Para rodar contra um servidor já existente, defina
`PLAYWRIGHT_BASE_URL`. Em hosts sem as bibliotecas gráficas do Chromium, é
necessário instalar as dependências de sistema do Playwright.

## Docker

```bash
HORFLOW_PORT=3100 docker compose up -d --build
curl http://127.0.0.1:3100/api/health
docker compose stop
```

- A porta publicada é vinculada a `127.0.0.1` e pode ser trocada por
  `HORFLOW_PORT` (o padrão é `3000`).
- O banco fica no volume nomeado `horaflow-f0-data`, montado em `/data`.
  Parar ou recriar o contêiner **não** apaga o volume.
- O entrypoint prepara o SQLite e aplica `prisma migrate deploy` antes de
  iniciar o servidor.
- O processo roda como usuário não-root (`nextjs`, uid 1001).
- O healthcheck consulta `GET /api/health`, que verifica o banco sem expor
  caminho, dados ou stack trace.
- Não use `docker compose down -v` sem autorização: isso remove o volume e os
  dados.

## Estrutura

```text
prisma/                 schema, migrations e restrições SQL
src/app/                App Router (layout, páginas e /api/health)
src/components/         layout, componentes compartilhados e UI base
src/lib/                banco, ambiente, dinheiro e erros
src/modules/settings/   schema Zod, serviço e formulário de configurações
tests/                  unitários, integração SQLite e E2E
scripts/                preparação de banco local e de testes
docker/                 entrypoint do contêiner
docs/                   planejamento e checkpoints
```

## Decisões e pendências

As duas decisões financeiras necessárias para o schema inicial foram aprovadas
em 2026-11-04: preservação de versões de `BillingItem` com `releasedAt` e
unicidade parcial do apontamento ativo, além de snapshots imutáveis de
cliente/projeto/descrição. Isso libera apenas o schema; **não** autoriza os
fluxos da Fase 3.

As demais decisões de domínio continuam pendentes e estão listadas em
[`docs/planejamento/README.md`](docs/planejamento/README.md). O checkpoint
técnico da fase está em
[`docs/checkpoints/fase-0.md`](docs/checkpoints/fase-0.md).
