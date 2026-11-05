# HoraFlow — Guia de execução do MVP

**Base funcional:** PRD v1.2 fornecido pelo usuário nesta conversa.  
**Situação desta entrega:** planejamento e configuração dos executores; aplicativo ainda não iniciado.  
**Modelo de construção:** **Big Pickle**, ID confirmado no catálogo: `opencode/big-pickle`.  
**Revisor padrão:** **GPT-6.1 Sol**, ID confirmado no catálogo: `openai/gpt-6.1-sol`, separado do construtor.  
**Ritmo aprovado:** uma fase por vez, com aprovação do usuário antes da seguinte.

## 1. Arquivos das fases

| Fase | Plano detalhado | Entrega | Pré-requisito |
|---|---|---|---|
| 0 | [Fundação](fase-0-fundacao.md) | Next.js, banco, layout, testes-base e Docker | Autorização para iniciar |
| 1 | [Cadastros](fase-1-cadastros.md) | Clientes, projetos e tarifas | Fase 0 aprovada |
| 2 | [Horas](fase-2-horas.md) | Calendário, lista, duração/intervalo | Fase 1 aprovada |
| 3 | [Financeiro](fase-3-financeiro.md) | Fechamentos, recebimentos, estornos e auditoria | Fase 2 aprovada |
| 4 | [Dashboard e relatórios](fase-4-dashboard-relatorios.md) | Indicadores, CSV, XLSX e PDF | Fase 3 aprovada |
| 5 | [Importação e estabilização](fase-5-importacao-estabilizacao.md) | CSV/XLSX, histórico real, testes e operação | Fase 4 aprovada |

Cada plano contém objetivo, tarefas, contratos, testes, critérios de aceite, oportunidades de paralelismo e prompt de execução. As checkboxes representam trabalho futuro, não execução comprovada.

## 2. Decisões aprovadas e escopo

- Aplicação web responsiva, single-user, self-hosted, sem login, usuários ou serviços pagos obrigatórios.
- Next.js App Router + TypeScript + React, Tailwind/shadcn, Zod, Prisma/SQLite e Docker Compose.
- pt-BR, BRL e timezone inicial `America/Sao_Paulo`.
- Duração em minutos inteiros, dinheiro em centavos, half-up por apontamento.
- Registro por duração ou por início/término, múltiplos por dia, datas passadas/futuras e passagem pela meia-noite.
- Tarifa `projeto → cliente → global`; snapshot histórico no apontamento.
- Não faturáveis contam horas e não geram cobrança.
- Fechamento por cliente/competência e pagamentos totais/parciais sem exceder saldo.
- Ausência de aprovação explícita: `DRAFT → BILLED`; `APPROVED` reservado, sem etapa adicional na interface.
- Calendário mensal com todos os dias e fins de semana destacados, sem adicionais automáticos.
- Importação CSV/XLSX com prévia e confirmação; exportação CSV/XLSX/PDF.
- PDF com `@react-pdf/renderer`, escolhido pelo usuário.
- O usuário fornecerá a fonte real de outubro/2026. Aceite histórico: 9 registros e 24h30.
- Fases sequenciais com checkpoints. Múltiplos agentes Big Pickle em tarefas independentes, preferencialmente em worktrees.
- Revisão independente com GPT-6.1 Sol por padrão; Big Pickle constrói e corrige, mas não assume o papel de revisor.

Fora do escopo: cronômetro, autenticação, multiusuário, aprovação por cliente, emissão fiscal, banco remoto obrigatório, integração bancária, importação direta de PDF e offline-first.

## 3. Correções ao plano inicial

1. Prisma moderno suporta `Enum` e `Json` no SQLite. Escolher versão compatível e validar migrations; enums continuam exigindo validação de entrada e, se desejado, constraints SQL.
2. Não há limite de 24h por apontamento no PRD. Duração não é horário do dia; exibir também `24:30`, `100:00` etc.
3. Não inferir silenciosamente dia seguinte para término anterior/igual. Informar data final, aceitar cruzamento real e rejeitar duração não positiva.
4. O plano inicial propôs remover itens ao reabrir; a estratégia precisa de confirmação. Preservação por versões/itens liberados é a proposta preferencial, não uma decisão já aprovada.
5. Reabertura volta a `DRAFT`, pois o usuário dispensou o fluxo de aprovação explícita.
6. Não utilizar dados reais como seed automático de produção nem declarar fixture sintética equivalente à fonte original.

## 4. Decisões pendentes — não inventar regras silenciosamente

Confirmar estas políticas no momento indicado, registrar a resposta no plano correspondente e somente então implementar a área afetada:

| Tema | Proposta técnica | Quando resolver |
|---|---|---|
| BillingItem ativo/histórico | Revisão e liberação lógica, com unicidade parcial e snapshots | Antes do schema financeiro na Fase 0 |
| Identidade em demonstrativos | Snapshot de nomes/descrições além de valores | Antes do schema financeiro |
| Intervalo cruzando competência | Atribuir tudo ao `workDate` do início, sem fracionar | Antes do serviço de horas |
| Sobreposição | Global, só entre intervalos ativos; adjacência permitida | Antes do serviço de horas |
| Novos lançamentos em mês fechado | Bloquear até reabertura, inclusive importação | Antes de consolidar guardas de horas/fechamento |
| Cliente/projeto inativo | Não permitir novos lançamentos; preservar histórico | Antes dos cadastros/horas |
| Tarifa ao editar apontamento | Preservar snapshot salvo mudança explícita | Antes do formulário de horas |
| Fechamento vazio/valor zero | Distinguir ausência de itens de horas com tarifa zero | Antes do fechamento |
| Moeda com histórico | Manter BRL no MVP ou restringir mudança com dados | Antes de liberar configuração |
| Recebido/pendente do dashboard | Separar competência de cobrança e fluxo por data de pagamento | Antes da consulta do dashboard |
| Motivo de reabertura/estorno | Exigir observação, sem criar identidade de usuário | Antes das ações financeiras |
| Importação | Limites propostos, duplicados e opção explícita de ignorar inválidos | Antes do wizard |

### 4.1. Decisões aprovadas pelo usuário em 2026-11-04

Estas respostas foram confirmadas explicitamente durante a execução da Fase 0 e liberam apenas o schema/migration inicial correspondente. Elas não autorizam implementar os fluxos financeiros da Fase 3.

- **BillingItem ativo/histórico:** aprovada a estratégia de **preservar versões**. A reabertura mantém os itens anteriores, libera os apontamentos por `releasedAt`, registra revisão em `BillingPeriod`, `BillingItem` e `Payment` e aplica unicidade parcial em `BillingItem.timeEntryId WHERE releasedAt IS NULL`.
- **Identidade em demonstrativos:** aprovado o **congelamento de snapshots** de nome do cliente, nome do projeto e descrição do item, além de duração, tarifa e valor, para que demonstrativos históricos permaneçam imutáveis após edições cadastrais.

### 4.2. Decisões aprovadas pelo usuário em 2026-11-05 (Fase 1)

Confirmadas explicitamente antes do início da Fase 1:

- **Aprovação da Fase 0 e autorização da Fase 1:** o checkpoint `docs/checkpoints/fase-0.md` foi aprovado e a construção da Fase 1 (`docs/planejamento/fase-1-cadastros.md`) foi autorizada.
- **Cliente/projeto inativo:** desativar cliente ou projeto bloqueia novos lançamentos e preserva integralmente o histórico; desativar um cliente torna seus projetos inelegíveis para novos apontamentos sem alterar silenciosamente o campo `active` individual de cada projeto.
- **Mudança de cliente em projeto com histórico:** proibido alterar o `clientId` de um projeto que já possua apontamentos (inclusive excluídos logicamente) ou itens de fechamento, evitando transferir histórico ou faturamento entre clientes.

As demais linhas desta seção continuam pendentes e devem ser confirmadas no momento indicado. Uma pendência não relacionada não impede trabalho independente; não criar migrations ou contratos irreversíveis que dependam de resposta ainda não obtida.

## 5. Construtor, revisor e coordenador

`opencode.jsonc` define Big Pickle como modelo padrão e também nos agentes `build`, `general` e `explore`. A configuração não transforma automaticamente uma sessão já aberta nem impede uma seleção manual diferente. Antes de construir, verificar o modelo ativo na interface ou iniciar nova sessão e selecionar **Big Pickle**.

O agente `reviewer` usa **GPT-6.1 Sol** (`openai/gpt-6.1-sol`) como revisor padrão, com edição, shell e delegação bloqueados. Ele lê código/planos e evidências dos testes, relata achados por severidade e solicita correções; o Big Pickle implementa essas correções e executa os testes. O revisor não substitui a aprovação do usuário.

O coordenador desta conversa pode ajudar no planejamento, divisão, revisão e integração. Construção do aplicativo, testes e correções de implementação devem ser atribuídos a Big Pickle, conforme solicitado pelo usuário. Ao delegar por ferramenta, indicar explicitamente `model: "opencode/big-pickle"` quando disponível, sem presumir herança de modelo.

Não é necessário criar um tipo de agente chamado "Big Pickle": esse é o **modelo**, que pode executar o agente `build` ou subagentes `general`. Subagentes de exploração são somente leitura. Não depender de um produto externo de orquestração ou de APIs não verificadas.

Para revisão, preferir o agente `reviewer`. Se a ferramenta disponível só permitir `general`, chamar com `model: "openai/gpt-6.1-sol"` e instrução explícita de revisão somente leitura, sem alterar arquivos, executar shell ou delegar. Não herdar o Big Pickle configurado em `general`. Se o modelo de revisão estiver indisponível, comunicar o bloqueio; não substituí-lo por Big Pickle.

### Prompt inicial sugerido

```text
Use Big Pickle (opencode/big-pickle) para a construção do HoraFlow.
Leia AGENTS.md, docs/planejamento/README.md e o plano da fase autorizada.
Confirme o modelo ativo e os pré-requisitos. Execute somente essa fase.
Quando houver tarefas independentes, delegue a agentes Big Pickle em
worktrees distintos, com arquivos, banco e porta definidos.
O integrador é o único dono de schema, migrations, dependências e lockfile.
Antes do checkpoint, use o revisor GPT-6.1 Sol (openai/gpt-6.1-sol),
somente leitura. Encaminhe as correções ao Big Pickle e revise novamente.
Apresente testes executados, pendências e checkpoint; não avance sem aprovação.
```

## 6. Protocolo seguro de worktrees e agentes

### 6.1. Preparação, somente ao iniciar a construção autorizada

1. Inspecionar o diretório e mudanças existentes. Na entrega de planejamento a raiz ainda não tinha `.git`.
2. Inicializar Git local se continuar ausente, estabelecer `.gitignore` completo, revisar arquivos que entrarão no commit e confirmar a identidade Git disponível. Não criar identidade fictícia nem configurar Git globalmente.
3. Fazer baseline revisado, incluindo os planos/configuração, antes de criar worktrees. Não publicar remoto ou enviar dados privados.
4. Criar scaffold e contratos compartilhados na integração. Fazer novo checkpoint utilizável antes de paralelizar módulos que dependam dessa base.
5. Criar uma branch por tarefa e um worktree por branch a partir do mesmo commit base conhecido. Preferir ferramentas nativas do OpenCode, se disponíveis; comandos Git abaixo são alternativa explícita.

Exemplo para o futuro, executado **na raiz do repositório e somente após HEAD existir**:

```bash
git worktree add .worktrees/f1-clientes -b tarefa/f1-clientes HEAD
git worktree add .worktrees/f1-projetos -b tarefa/f1-projetos HEAD
```

`.worktrees/` fica ignorado pelo Git e é o diretório configurado para a ferramenta de worktrees. Não misturar criação nativa e manual para o mesmo nome. Não criar worktree dentro de outro worktree. Conferir o caminho realmente retornado pela ferramenta antes de iniciar o agente.

### 6.2. Contrato de delegação obrigatório

Toda tarefa deve informar:

```text
Fase/tarefa: <identificador e objetivo>
Papel: construção / revisão independente
Modelo: opencode/big-pickle (construção) / openai/gpt-6.1-sol (revisão)
Commit base / branch / worktree absoluto: <valores reais>
Arquivos permitidos: <lista ou glob restrito>
Arquivos proibidos: <compartilhados e trabalho de outros agentes>
Contratos/dependências: <DTOs, funções e fases já integradas>
SQLite de teste / porta / projeto Compose: <valores exclusivos>
Testes exigidos: <comandos e aceites>
Entrega: resumo, alterações, commits, testes e pendências
Limite: não avançar de fase, não editar fora do escopo, não publicar
```

Um subagente não ganha isolamento de filesystem só por existir. Fixar sua sessão ao worktree correto antes de permitir escrita, usando a capacidade de localização da sessão quando disponível. Se não houver garantia de diretório isolado, usar sessão separada iniciada naquele worktree ou executar sequencialmente. Não lançar agentes gravadores no mesmo checkout apenas porque são sessões diferentes.

Revisores não recebem permissão de escrita e podem ler o checkout integrado em estado estável, sem worktree adicional, desde que os construtores não alterem os arquivos durante a revisão. Informar o commit/diff exato e as evidências de teste a revisar.

### 6.3. Propriedade e isolamento

- Um dono por arquivo/tarefa. `package.json`, `pnpm-lock.yaml`, `prisma/schema.prisma`, migrations, configurações compartilhadas, layout global, estilos base e contratos são do integrador ou de dono único explicitamente nomeado.
- Agentes solicitam mudanças nesses arquivos; não geram lockfiles/migrations concorrentes.
- Cada worktree usa `.env` local não versionado e SQLite próprio, preferencialmente com caminho absoluto dentro dele. Nunca apontar para o banco/volume real do usuário.
- Cada servidor usa porta exclusiva; Playwright usa baseURL e banco do respectivo worker ou execução serial controlada.
- Compose usa nome de projeto/volume exclusivo por worktree. Verificar se bind mounts/caminhos não acabam no mesmo diretório de dados.
- Worktree não isola rede, processos, HOME, caches, arquivos externos ou credenciais. Não permitir limpeza global ou encerramento indiscriminado de processos.
- Dados e segredos não são copiados automaticamente entre worktrees. Fixture privada exige autorização e proteção equivalentes.
- Limite inicial sugerido: 2–3 agentes de construção por fase. Mais agentes só se houver tarefas realmente independentes e capacidade de integração.

### 6.4. Matriz de paralelismo

| Fase | Trabalho que precisa vir primeiro | Frentes paralelizáveis depois | Principal integração |
|---|---|---|---|
| 0 | Scaffold, versões, contratos e banco-base | Layout; Docker/operação; harness de testes | Configurações globais e build |
| 1 | Contratos de cadastro/tarifa | Clientes; projetos; testes puros | Vínculos e resolvedor |
| 2 | Helpers de datas/dinheiro, DTOs e políticas | Domínio; calendário/lista; formulário | Ações e consultas consistentes |
| 3 | Modelo histórico, transação e auditoria | Fechamento; pagamentos; UI/testes | Máquina de estados financeira |
| 4 | DTOs e consultas/filtros únicos | Dashboard; CSV/XLSX; PDF/UI | Igualdade de dados em formatos |
| 5 | Contrato de lote/prévia | Parsers; wizard; backup/docs | Confirmação transacional e aceites |

Paralelizar **dentro** da fase aprovada, não executar fases seguintes antecipadamente. Quando o custo de conflitos superar o benefício, executar de forma serial.

### 6.5. Integração, revisão e limpeza

1. Cada agente entrega diff/commits e resultados dos testes dentro do seu worktree.
2. Revisar escopo e integrar na ordem das dependências, com merge/cherry-pick consciente do histórico. Não reescrever branches compartilhadas.
3. Resolver conflitos preservando trabalho existente; não escolher automaticamente um lado.
4. Reexecutar todos os gates relevantes na branch integrada. Testes verdes isolados não garantem integração verde.
5. Para problemas, preferir commit corretivo ou revert revisado; preservar alterações não relacionadas. Não usar `reset --hard`, `checkout --`, `push --force` ou remoção de volumes como atalho.
6. Worktree/branch só podem ser removidos após trabalho integrado/revisado, inspeção de alterações pendentes e confirmação. Nunca usar remoção forçada para esconder mudanças.

Antes do checkpoint, o GPT-6.1 Sol revisa o diff integrado e as evidências. Big Pickle corrige os achados, reexecuta testes e solicita nova revisão quando necessário. Registrar problemas resolvidos e riscos restantes; a aprovação para avançar continua sendo do usuário.

## 7. Checkpoint por fase

Criar durante a execução `docs/checkpoints/fase-N.md` com:

```text
Estado: em revisão / aprovado / bloqueado
Modelo executor e agentes: ...
Revisor: openai/gpt-6.1-sol
Commit/diff revisado, achados e correções: ...
Commit integrado / branches / worktrees: ...
Decisões confirmadas pelo usuário: ...
Funcionalidades entregues: ...
Comandos de validação + resultado: ...
Testes não executados e motivo: ...
Pendências/riscos: ...
Backup/impacto de migration, se houver: ...
Aprovação do usuário: pendente / mensagem e data
```

Gates comuns: instalação com lockfile, lint, TypeScript, unitários, integração SQLite, E2E relevantes, build e smoke Docker quando a mudança afetar implantação. Incluir comandos reais e distinguir **não executado** de **aprovado**. Um checkpoint técnico/commit não substitui a aprovação do usuário para seguir de fase.

## 8. Estado atual e próxima ação

- Os seis arquivos de fase foram preparados; nenhuma fase de construção está concluída.
- Nenhum repositório/commit, worktree, banco, dependência ou contêiner foi criado por esta entrega de planejamento.
- Antes da definição dos papéis separados, subagentes Big Pickle fizeram uma análise textual inicial do planejamento, sem implementação. Isso não conta como revisão independente dos checkpoints; as revisões passam a usar GPT-6.1 Sol.
- O próximo passo é abrir/selecionar o construtor Big Pickle e autorizar explicitamente a Fase 0.
- A fonte histórica pode ser fornecida antes; não é necessária para o scaffold, mas é necessária para o aceite real de importação.

## 9. Referências verificadas

### Emenda de coordenação — 2026-11-04

O usuário autorizou a cadeia de construção **Big Pickle** (`opencode/big-pickle`),
primeiro fallback **DeepSeek V4.1 Flash Free**
(`opencode/deepseek-v4.1-flash-free#high`) e segundo fallback **GPT-6 Luna**
(`openai/gpt-6-luna#high`). A coordenação seleciona explicitamente o modelo e
registra o executor; não há failover automático. Esta autorização atualizada e
o `AGENTS.md` da raiz prevalecem sobre referências anteriores neste guia que
exijam exclusivamente Big Pickle para construir/corrigir. A revisão continua
independente com GPT-6.1 Sol (`openai/gpt-6.1-sol`), somente leitura. No caso desta retomada, Big Pickle e DeepSeek ficaram indisponíveis por cota; GPT-6 Luna
foi explicitamente autorizado como construtor sequencial, sem delegação.

### Emenda de coordenação — 2026-11-05 (Antigravity)

Em 2026-11-05, na execução dentro do ambiente Google Antigravity (onde os IDs de
catálogo do OpenCode não estão disponíveis), o usuário autorizou explicitamente:
- **Construção sequencial:** **Gemini 4 Argon (Medium)** (`inherit`).
- **Revisão independente somente leitura:** subagente dedicado `reviewer`
  (`inherit`/`pro`, sem ferramentas de escrita ou execução shell).

- OpenCode V2 — [configuração](https://opencode.ai/v2/docs/config), [agentes](https://opencode.ai/v2/docs/agents) e [CLI](https://opencode.ai/v2/docs/cli).
- Prisma — [SQLite e tipos suportados](https://www.prisma.io/docs/orm/overview/databases/sqlite).
- Seleções exatas de `opencode/big-pickle` e `openai/gpt-6.1-sol` consultadas no catálogo de modelos disponível na sessão.

Rever compatibilidade das versões no início da implementação; este planejamento não congela pacotes que ainda não foram instalados.
