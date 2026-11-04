# Fase 3 — Fechamentos, pagamentos e auditoria

**Estado:** não iniciada.  
**Executor:** Big Pickle (`opencode/big-pickle`).  
**Revisor padrão:** GPT-6.1 Sol (`openai/gpt-6.1-sol`), independente e somente leitura antes do checkpoint.  
**Dependência:** Fase 2 aprovada; contratos de schema financeiro devem ser definidos já na Fase 0.  
**Próxima fase:** [Fase 4 — Dashboard e relatórios](fase-4-dashboard-relatorios.md).

## 1. Objetivo

Fechar horas faturáveis por cliente/competência, congelar valores, receber pagamentos parciais, estornar logicamente e reabrir com segurança. Toda mutação financeira deve ser auditável e transacional.

## 2. Decisões de modelo a confirmar

### 2.1. Histórico dos itens após reabertura

O PRD exige um único item **ativo** por apontamento, mas não possui campo que defina essa atividade. O plano anterior sugeriu excluir itens na reabertura e deixar snapshots só na auditoria. Isso não deve ser adotado silenciosamente.

**Proposta preferencial, sujeita a aprovação:** preservar itens antigos e adicionar revisionamento mínimo:

- `BillingPeriod.revision`: número do fechamento atual.
- `BillingItem.revision` e `releasedAt`: versão e liberação após reabertura.
- Índice único parcial em `timeEntryId WHERE releasedAt IS NULL`, via migration SQL testada, se não for expressável no schema Prisma escolhido.
- Associação da revisão em `Payment`, para que estornos de versões antigas não sejam atribuídos indevidamente ao fechamento atual.
- Snapshots de resumo, identidade exibida e itens na auditoria de cada fechamento/reabertura para reconstrução histórica.

Alternativa mais simples: remover itens apenas na reabertura e guardar snapshot completo no `AuditLog`. Exige aceite explícito, pois consultas históricas dependerão da auditoria. Escolher **uma** estratégia antes da migration inicial e documentar invariantes/consultas. Não implementar as duas em paralelo.

**Decisão aprovada pelo usuário em 2026-11-04:** adotar a proposta preferencial de preservação por versões. Ficam aprovados `BillingPeriod.revision`, `BillingItem.revision`, `BillingItem.releasedAt`, a associação da revisão em `Payment` e o índice único parcial em `BillingItem(timeEntryId) WHERE releasedAt IS NULL`, implementado por SQL na migration e coberto por teste real. A estratégia alternativa de remoção não será implementada.

### 2.2. Outras políticas pendentes

- **Competência fechada:** proposta de bloquear novos apontamentos/importação e alterações daquele cliente/mês até reabertura, inclusive mudança de um registro para dentro/fora dessa competência.
- **Fechamento sem itens/zero:** decidir se vazio é rejeitado; zero financeiro com minutos e tarifa zero é um caso distinto de vazio.
- **Identidade histórica:** tarifa/duração/valor são snapshots obrigatórios. Proposta de incluir nome de cliente/projeto e descrição exibida para manter demonstrativo idêntico após edição dos cadastros. **Aprovada pelo usuário em 2026-11-04:** congelar também os nomes de cliente/projeto e a descrição do item no fechamento, para demonstrativos históricos imutáveis.
- **Data do pagamento:** interface pede data civil; definir conversão para `paidAt` UTC no fuso configurado, sem usar timezone do navegador nem alterar a data histórica ao trocar configuração.
- **Motivo de reabertura/estorno:** proposta de exigir observação; não adicionar `User`, login ou autor fictício. Auditoria pode registrar origem da operação como sistema/local.

## 3. Máquina de estados

```text
TimeEntry: DRAFT → BILLED → DRAFT (somente por reabertura)
APPROVED: reservado; sem etapa de aprovação na interface

BillingPeriod: OPEN → CLOSED → REOPENED → CLOSED
Payment: ativo (voidedAt = null) → estornado (voidedAt preenchido)
```

Estado de pagamento é derivado: sem pagamento, parcial ou quitado. Não criar outro status persistido que possa divergir do saldo. Caso legado `APPROVED` apareça, tratá-lo como elegível conforme regra documentada, sem exigir aprovação na UI.

## 4. Fechamento mensal

### 4.1. Prévia

- [ ] Selecionar cliente, ano e mês.
- [ ] Consultar apontamentos ativos faturáveis da competência, conforme política de `workDate`.
- [ ] Exibir itens, total de minutos, valores e tarifa aplicada por item.
- [ ] Identificar ausência de itens, registros já vinculados e conflitos de estado.
- [ ] Não permitir que a interface imponha totais arbitrários ao servidor.

### 4.2. Confirmação atômica

Uma única transação deve:

1. Validar estado atual do período e unicidade `(clientId, year, month)`.
2. Reconsultar entradas elegíveis e proteger contra edição/criação concorrente.
3. Verificar que a revisão apresentada ao usuário ainda é válida; se mudou, exigir atualização da prévia.
4. Criar/atualizar o período existente, sem gerar nova linha para a mesma competência ao refechar.
5. Copiar duração, tarifa e valor já calculados para os itens; não aplicar a tarifa atual do cadastro.
6. Somar centavos e minutos dos snapshots, validar limites de armazenamento e marcar período `CLOSED`.
7. Marcar os apontamentos incluídos como `BILLED`.
8. Gravar auditoria completa dentro da mesma transação.

Falha em qualquer etapa implica rollback integral. Duplo clique e duas confirmações concorrentes não podem criar duas cobranças. A guarda de imutabilidade consulta status e vínculo ativo, não apenas um campo isolado.

## 5. Reabertura

- [ ] Permitir somente a partir de `CLOSED` e **sem qualquer pagamento ativo** associado.
- [ ] Verificar bloqueio e alterar estado dentro da mesma transação; não basta checar antes de abri-la.
- [ ] Confirmar a ação e informar impacto na cobrança.
- [ ] Liberar os itens ativos conforme estratégia de histórico aprovada; nunca perder a versão anterior inadvertidamente.
- [ ] Retornar entradas a `DRAFT`, pois não existe fluxo explícito de aprovação.
- [ ] Marcar período `REOPENED`, preservando snapshots e informação do fechamento anterior na forma aprovada.
- [ ] Relatórios/saldos de cobrança ativa não contam período reaberto como dívida fechada atual.
- [ ] Refechamento recalcula a seleção e totais da nova versão, mantendo histórico.
- [ ] Pagamentos estornados permanecem consultáveis e não bloqueiam reabertura.

## 6. Recebimentos e estornos

`Payment`: período, valor positivo em centavos, `paidAt`, forma, observação, `voidedAt`, criação e versão quando adotada. RF08 lista forma de pagamento como campo; decidir sua obrigatoriedade na validação, pois o schema original permite null.

### Pagamento

- [ ] Aceitar somente em período `CLOSED`.
- [ ] Validar valor inteiro positivo, data e método/observação limitados.
- [ ] Na transação, obter total fechado e soma de pagamentos ativos da versão atual.
- [ ] Rejeitar `somaAtiva + novo > totalCents`; não permitir crédito/sobrepagamento no MVP.
- [ ] Criar pagamento e auditoria atomicamente.
- [ ] Tratar envio duplicado com identificador de operação persistido ou mecanismo idempotente equivalente; não deduzir duplicidade por valor/data, pois parcelas iguais podem ser legítimas.

### Estorno

- [ ] Preencher `voidedAt`, sem excluir pagamento e sem editar silenciosamente valor/data.
- [ ] Auditoria antes/depois na mesma transação.
- [ ] Recalcular recebido/saldo ignorando estornados.
- [ ] Estorno repetido não cria efeitos duplicados.
- [ ] Correção de pagamento: estornar e cadastrar novo, preservando o anterior.

## 7. Auditoria e concorrência

Criar serviço comum de auditoria: entidade, ID, ação, antes/depois, timestamp UTC e origem quando apropriado. Usar Json conforme o suporte da versão Prisma. Não incluir segredos, conteúdo arbitrário de arquivos ou stack traces como valores de negócio.

Auditar pelo menos criação/edição/exclusão lógica de apontamentos com impacto financeiro, mudança de tarifa, fechamento, reabertura, pagamento e estorno. Auditoria participa da transação da mutação; falha na auditoria não pode deixar uma alteração financeira sem rastro.

SQLite tem um escritor por vez, mas isso não torna segura uma sequência de leitura e escrita feita fora de uma transação. Documentar o comportamento do driver/adapter, timeout e retries. Não abrir transações concorrentes no mesmo arquivo de teste sem isolamento intencional. Testes de concorrência precisam de conexões/processos independentes quando o adapter serializa tudo numa conexão única.

## 8. Interface e divisão de trabalho

- [ ] `/billing`: lista por competência/cliente, situação, total, recebido e saldo.
- [ ] Detalhe: itens congelados, ação de exportação conectada na Fase 4, pagamentos e histórico de eventos.
- [ ] Diálogo de fechamento com prévia; reabertura com confirmação e motivo, se aprovado.
- [ ] Formulário de pagamento total/parcial e ação de estorno.
- [ ] Estados bloqueados explicam como reabrir e por que pagamentos ativos impedem a ação.

Arquivos-base: `src/modules/billing/`, `src/modules/payment/`, `src/modules/audit/`, `src/app/billing/`, testes de domínio/integração/E2E. Primeiro um dono estabiliza schema e contratos financeiros. Depois dividir worktrees em fechamento/reabertura, pagamentos/estornos e interface/testes. As funções de pagamento dependem do contrato fechado de período; não implementá-las sobre suposições divergentes. Big Pickle em todos os executores.

## 9. Testes obrigatórios

| Cenário | Resultado |
|---|---|
| Fechar mês | Itens/entradas/total/auditoria consistentes |
| Alterar tarifa depois de fechar | Snapshot inalterado |
| Editar/excluir BILLED por ação direta | Bloqueado |
| Pagar parcialmente | Saldo correto em centavos |
| Pagar acima do saldo | Rejeitado sem efeitos |
| Dois pagamentos que juntos excedem o saldo | No máximo o conjunto permitido é gravado |
| Fechar duas vezes concorrentemente | Uma competência, sem itens duplicados |
| Pagar enquanto tenta reabrir | Um estado consistente; nunca reaberto com pagamento ativo |
| Reabrir com pagamento ativo | Bloqueado |
| Estornar todos e reabrir | Permitido, com histórico preservado |
| Refechar mês reaberto | Nova versão consistente sem cobrança dupla |
| Falha intermediária/auditoria | Rollback integral |
| Inserir/editar durante fechamento | Nenhuma entrada escapa da política aprovada |

## 10. Critérios de aceite e checkpoint

Executar testes financeiros com SQLite real, concorrência intencional, E2E do ciclo fechar → pagar parcial → estornar → reabrir → refechar, além de lint/tipos/build. Demonstrar auditoria e recuperação de erros, entregar decisões adotadas e aguardar aprovação da Fase 4.

## 11. Prompt de execução

> Execute somente a Fase 3 usando Big Pickle. Confirme a estratégia de histórico/versão antes de mudar schema. Fechamentos, reabertura, pagamentos, estornos e auditoria devem ser atômicos, idempotentes quando aplicável e seguros sob concorrência SQLite. Divida worktrees após fixar os contratos; integre e teste o ciclo financeiro completo antes do checkpoint.
