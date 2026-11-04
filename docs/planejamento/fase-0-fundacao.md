# Fase 0 — Fundação

**Estado:** não iniciada.  
**Executor de construção:** Big Pickle (`opencode/big-pickle`).  
**Revisor padrão:** GPT-6.1 Sol (`openai/gpt-6.1-sol`), independente e somente leitura antes do checkpoint.  
**Pré-requisito:** autorização do usuário para iniciar esta fase.  
**Próxima fase:** [Fase 1 — Cadastros](fase-1-cadastros.md).

## 1. Objetivo e limite da entrega

Preparar uma aplicação executável, testável e implantável em Docker, sem implementar antecipadamente os fluxos completos das fases seguintes. Preservar os arquivos de planejamento existentes ao gerar o scaffold na raiz de `HoraFlow/`; não criar uma segunda raiz `worktime/`.

Ler primeiro o [guia de execução](README.md) e o `AGENTS.md` da raiz. Não instalar serviços pagos, autenticação ou dependências externas obrigatórias.

## 2. Entregáveis

- Next.js App Router, React, TypeScript estrito, pnpm e lockfile versionado.
- Tailwind CSS, shadcn/ui, ícones locais e tema claro/escuro.
- Layout responsivo com navegação principal e páginas de estado inicial.
- Prisma, SQLite local, schema inicial e migrations versionadas.
- Configurações globais persistidas como singleton.
- Vitest, testes de integração SQLite e infraestrutura Playwright.
- Dockerfile multi-stage, Compose, entrypoint de migrations e healthcheck.
- `.env.example`, `.gitignore` e README inicial de desenvolvimento/implantação.

## 3. Sequência de trabalho

### 3.1. Pré-voo e baseline

- [ ] Inspecionar a raiz, instruções herdadas, versões de Node/pnpm/Docker e alterações existentes.
- [ ] Confirmar que todos os agentes de construção usam `opencode/big-pickle`.
- [ ] Preparar Git local para a execução autorizada, conforme o protocolo do guia; não publicar remoto.
- [ ] Registrar a matriz de versões escolhidas e compatibilidades. Não usar `latest` sem verificar requisitos de Node e build.
- [ ] Gerar scaffold em diretório temporário se o gerador exigir destino vazio; transferir somente arquivos novos e revisar conflitos. Nunca limpar a raiz para satisfazer o gerador.
- [ ] Instalar dependências e gerar um único `pnpm-lock.yaml` pelo integrador.

### 3.2. Organização modular

```text
src/app/                   # rotas e composição de telas
src/modules/               # schema, service, repository, types, apresentação
src/components/ui/         # componentes shadcn
src/components/layout/     # sidebar, navegação mobile, cabeçalho
src/components/shared/     # duração, moeda, estados vazios, confirmações
src/lib/                   # banco, validação de ambiente, datas e dinheiro
prisma/migrations/         # histórico versionado
tests/{unit,integration,e2e}/
fixtures/                  # apenas exemplos e dados autorizados
```

Criar rotas `/dashboard`, `/timesheet`, `/clients`, `/projects`, `/billing`, `/reports`, `/import` e `/settings`. A raiz redireciona para `/dashboard`, conforme o aceite de abertura sem login; o calendário será a principal área de trabalho em `/timesheet`. Exibir estados vazios reais, sem métricas fictícias.

### 3.3. Persistência e integridade inicial

- [ ] Modelar `Client`, `Project`, `TimeEntry`, `BillingPeriod`, `BillingItem`, `Payment`, `Settings`, `AuditLog` e `ImportBatch` segundo os planos de domínio.
- [ ] Antes de consolidar as tabelas financeiras, resolver os bloqueadores descritos no guia e na Fase 3; não esconder decisões em migrations.
- [ ] Usar UUIDs, timestamps, relações com restrição de exclusão e índices relevantes.
- [ ] Criar unicidade de `BillingPeriod(clientId, year, month)`.
- [ ] Para Prisma atual, verificar suporte real a `Enum` e `Json` com SQLite. Ambos existem em versões modernas; não substituí-los por strings por uma limitação antiga presumida.
- [ ] Quando houver Prisma 7, configurar o adapter SQLite, cliente gerado e `prisma.config.ts` conforme a versão instalada. Não misturar configuração de versões distintas.
- [ ] Configurar `foreign_keys`, timeout de escrita e estratégia de concorrência compatível com o driver; registrar os valores efetivamente aplicados.
- [ ] Garantir que migrations recriem todos os índices e constraints, inclusive SQL personalizado.
- [ ] Cliente Prisma isolado por ambiente, sem acesso do navegador ao banco.
- [ ] Não conectar ao banco real durante `next build` para pré-renderizar páginas dinâmicas.

`Settings`: uma única linha com identificador fixo, timezone IANA padrão `America/Sao_Paulo`, moeda `BRL`, tarifa global não negativa em centavos. Inicialização idempotente, sem seed automático de clientes, horas ou pagamentos reais. Validar alterações no servidor. Política de troca de moeda com histórico deverá ser confirmada antes de liberar o campo.

### 3.4. Interface base

- [ ] Sidebar no desktop e navegação acessível no mobile.
- [ ] Alternância de tema sem erros de hidratação.
- [ ] Textos, datas e dinheiro em pt-BR.
- [ ] Componentes de loading, erro, vazio, toast e confirmação.
- [ ] Navegação por teclado, labels nos formulários e foco visível.
- [ ] Não depender de Google Fonts ou outra chamada externa para executar a aplicação.

### 3.5. Docker e segurança

- [ ] Escolher imagem Node suportada e estratégia de build reproduzível; validar módulos nativos do adapter SQLite na imagem escolhida.
- [ ] Executar como usuário não-root, com volume gravável em `/data`.
- [ ] Publicar por padrão `127.0.0.1:3000:3000`. Dentro do contêiner, o servidor precisa aceitar conexões na interface apropriada, normalmente `0.0.0.0`.
- [ ] Manter banco, WAL, arquivos temporários e backups fora de `public/`.
- [ ] Executar `prisma migrate deploy` antes de iniciar o servidor; incluir CLI, configuração, migrations e dependências necessárias no runtime ou estágio de implantação efetivamente usado.
- [ ] Entrada falha se migrations falharem; não iniciar com schema incompatível.
- [ ] `restart: unless-stopped`, volume persistente e `/api/health` sem detalhes sensíveis.
- [ ] Verificar acesso ao banco no healthcheck sem expor caminho, dados ou stack trace.
- [ ] Documentar acesso remoto somente via rede privada configurada explicitamente.
- [ ] Planejar validação de origem/host em mutações e rotas customizadas; ausência de login não autoriza aceitar requisições cross-origin irrestritas.

## 4. Contratos compartilhados

O integrador define e estabiliza antes de delegar: alias de importação, cliente Prisma, formato de erros de domínio, validação no servidor, formato de resultados de ações, testes e comandos de qualidade. Serviços não importam componentes React. Repositórios aceitam o contexto transacional quando necessário; não abrir conexões independentes dentro de uma operação financeira atômica.

Arquivos estruturais são de dono único: `package.json`, lockfile, schema/migrations, configurações Next/TS/testes, layout global e arquivos de ambiente. A divisão em worktrees só começa após um baseline utilizável e segue o guia geral.

## 5. Testes e evidências

- [ ] `pnpm install --frozen-lockfile` funciona a partir do lockfile gerado.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passam; criar estes scripts.
- [ ] Migração em SQLite vazio, segunda execução sem alterações e validação de chaves estrangeiras.
- [ ] Settings inicializa uma única vez e preserva valores após reinício.
- [ ] Playwright abre dashboard sem login e navega até configurações.
- [ ] `docker compose config`, build e subida resultam em healthcheck saudável.
- [ ] Alterar configuração de teste, recriar apenas o contêiner e comprovar persistência no volume.
- [ ] Confirmar bind local, usuário não-root e ausência de rota pública para arquivos do banco.

Comandos que dependem de software indisponível devem ser marcados como não executados, com justificativa. Não declarar E2E ou Docker validados apenas porque os arquivos existem.

## 6. Critérios de aceite e checkpoint

A fase termina com interface base navegável, configurações persistentes, banco migrável, testes-base e Docker funcional. Entregar ao usuário versões, arquivos, comandos/resultados, pendências e eventuais decisões de domínio. Aguardar aprovação antes da Fase 1.

## 7. Prompt de execução

> Use Big Pickle (`opencode/big-pickle`). Leia AGENTS.md, docs/planejamento/README.md e este arquivo. Execute somente a Fase 0 após autorização, preservando a documentação existente. Resolva bloqueadores explicitamente, prepare baseline Git antes dos worktrees e delegue apenas escopos independentes. Integre e teste a entrega. Não inicie cadastros nem fases seguintes sem checkpoint aprovado.
