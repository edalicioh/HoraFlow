# Fase 1 — Clientes, projetos e tarifas

**Estado:** revisão técnica concluída — aguardando aprovação do usuário (2026-11-05).  
**Executor:** Big Pickle (`opencode/big-pickle`) / autorizado em 2026-11-05 no Antigravity: Gemini 4 Argon (Medium) (`inherit`), sequencial.  
**Revisor padrão:** GPT-6.1 Sol (`openai/gpt-6.1-sol`) / autorizado em 2026-11-05 no Antigravity: subagente `reviewer` somente leitura (`inherit`/`pro`) antes do checkpoint.  
**Dependência:** Fase 0 aprovada em 2026-11-05.  
**Próxima fase:** [Fase 2 — Horas](fase-2-horas.md).

### Decisões de domínio confirmadas em 2026-11-05

- **Inativação de cliente/projeto:** desativar cliente ou projeto impede novos lançamentos e preserva o histórico; cliente inativo torna seus projetos inelegíveis para novos apontamentos sem alterar silenciosamente o campo `active` individual de cada projeto.
- **Imutabilidade de vínculo com histórico:** proibido alterar o `clientId` de um projeto que já possua apontamentos (inclusive excluídos logicamente) ou itens de fechamento.

## 1. Objetivo

Entregar cadastros utilizáveis de clientes e projetos, com tarifas em centavos, desativação segura e resolução da tarifa aplicável. Não antecipar fechamento ou pagamentos.

## 2. Modelo e contratos

`Client`: UUID, nome, descrição opcional, tarifa opcional, ativo, criação e atualização. `Project`: os mesmos campos, com `clientId` obrigatório. Um projeto pertence a exatamente um cliente.

O campo de tarifa do cliente é opcional no modelo consolidado do PRD, permitindo fallback global. Diferenciar **vazio/null** de **zero**: zero é uma tarifa definida e não deve acionar fallback.

Contratos mínimos, adaptáveis ao padrão estabelecido na Fase 0:

- `listClients`, `getClient`, `createClient`, `updateClient`, `setClientActive`, `deleteClient`.
- Equivalentes para projetos, com filtro por cliente.
- `resolveHourlyRate({ projectRateCents, clientRateCents, defaultRateCents })`.
- Erros previsíveis: validação, não encontrado, vínculo inválido e histórico que impede exclusão.

## 3. Tarefas detalhadas

### 3.1. Validação e domínio

- [x] Validar payloads com Zod no servidor e não confiar em IDs, tarifas ou status enviados pela interface.
- [x] Nome obrigatório após trim; definir limites documentados para nome/descrição e testar os limites.
- [x] Tarifa opcional, inteira e não negativa em centavos; validar limites compatíveis com Prisma `Int` e cálculos futuros.
- [x] Converter entrada monetária pt-BR para centavos sem multiplicar `float` de forma imprecisa.
- [x] Validar existência e elegibilidade do cliente ao criar projeto.
- [x] Não adicionar unicidade de nomes sem necessidade aprovada; se houver alerta de nomes parecidos, não tratá-lo como restrição silenciosa.
- [x] Proibir a mudança de cliente de um projeto com histórico, salvo política expressamente aprovada; isso evita transferir horas e fechamentos históricos para outro cliente.

### 3.2. Clientes

- [x] Tela de listagem com busca, filtro ativos/inativos e estado vazio.
- [x] Formulário de criação/edição com descrição e tarifa opcional.
- [x] Detalhe com projetos associados e área de histórico preparada, sem fabricar horas ou valores.
- [x] Ação de ativar/desativar com feedback imediato.
- [x] Exclusão física apenas quando não existe histórico nem dependência que a impeça; validar no servidor e manter FK restritiva.
- [x] Não remover projetos em cascata. Quando houver projetos vinculados, bloquear a exclusão e orientar desativação.

### 3.3. Projetos

- [x] Listagem filtrável por cliente e status.
- [x] Formulários com cliente obrigatório e tarifa própria opcional.
- [x] Exibir de onde vem a tarifa efetiva: projeto, cliente ou global.
- [x] Ativar/desativar preservando vínculos e histórico.
- [x] Exclusão física bloqueada com apontamentos, inclusive excluídos logicamente.
- [x] Cliente inativo torna seus projetos inelegíveis para novos apontamentos, sem alterar silenciosamente o campo `active` de cada projeto; confirmar essa proposta no checkpoint.

### 3.4. Tarifas

- [x] Resolver com prioridade `projectRateCents ?? clientRateCents ?? defaultRateCents`.
- [x] Deixar explícito que o resolvedor fornece a tarifa para um novo lançamento, não recalcula históricos.
- [x] Alterações em cadastros não atualizam `TimeEntry.hourlyRateCents` nem `amountCents` já gravados.
- [x] Registrar alterações financeiras de tarifas em `AuditLog`, com antes/depois na mesma transação.
- [x] Apresentar valores em BRL e manter centavos no domínio e na persistência.

## 4. Arquivos e fronteiras

```text
src/modules/client/{schema,service,repository,types}.ts
src/modules/project/{schema,service,repository,types}.ts
src/modules/client/components/
src/modules/project/components/
src/app/clients/
src/app/projects/
src/lib/rates.ts
tests/unit/rates.test.ts
tests/integration/client-project.test.ts
tests/e2e/clients-projects.spec.ts
```

Os nomes são referência; seguir convenções efetivamente estabelecidas. Não copiar validação para múltiplas camadas com regras divergentes.

## 5. Paralelismo possível

Após estabilizar os contratos: um agente implementa módulo/telas de clientes, outro módulo/telas de projetos, outro pode escrever testes puros do resolvedor. Cada executor usa Big Pickle e worktree próprio. O integrador mantém `src/lib/rates.ts`, schema, migrações e arquivos estruturais, ou atribui cada um a um único responsável. Integrar clientes antes de finalizar vínculos de projetos. Aplicar o protocolo do guia, sem testes compartilharem o mesmo SQLite.

## 6. Testes obrigatórios

| Caso | Resultado |
|---|---|
| Projeto 12000, cliente 10000, global 8000 | 12000 centavos/h |
| Projeto null, cliente 10000 | 10000 centavos/h |
| Projeto e cliente null, global 8000 | 8000 centavos/h |
| Projeto com tarifa zero | Zero, sem fallback |
| Nome vazio ou tarifa negativa/fracionária | Rejeitado no servidor |
| Cliente/projeto inexistente | Erro previsível, sem registro órfão |
| Excluir entidade com histórico | Bloqueio, com opção de desativação |
| Desativar cadastro | Histórico preservado |
| Alterar tarifa | Auditoria e nenhum recálculo histórico |

Integração deve usar SQLite real temporário. E2E: criar cliente, criar projeto, editar tarifa, filtrar, desativar e reativar. Incluir uso mobile e navegação por teclado nos formulários.

## 7. Critérios de aceite

- [x] CRUD e ativação/desativação funcionam com validação no servidor.
- [x] Integridade impede exclusões destrutivas e reassociação histórica indevida.
- [x] Fallback de tarifas e zero cobertos por testes.
- [x] Lint, tipos, unitários, integração, E2E relevante e build passam.
- [x] Nenhum fluxo financeiro ou de horas antecipado sem autorização.

Entregar resumo e evidências; solicitar aprovação para iniciar a Fase 2.

## 8. Prompt de execução

> Use Big Pickle (`opencode/big-pickle`). Leia AGENTS.md e o guia. Verifique aprovação da Fase 0 e execute apenas a Fase 1. Estabilize contratos e divida clientes/projetos/testes entre worktrees quando forem independentes. Preserve histórico e audite tarifas. Integre, execute os testes e pare no checkpoint.
