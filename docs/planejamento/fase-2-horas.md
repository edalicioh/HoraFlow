# Fase 2 — Gestão de horas e calendário

**Estado:** concluída e revisada em 2026-11-05 (aguardando aprovação do checkpoint pelo usuário).
**Executor:** Big Pickle (`opencode/big-pickle`) / autorizado em 2026-11-05 no Antigravity: Gemini 4 Argon (Medium) (`inherit`), sequencial.  
**Revisor padrão:** GPT-6.1 Sol (`openai/gpt-6.1-sol`) / autorizado em 2026-11-05 no Antigravity: subagente `reviewer` somente leitura (`inherit`/`pro`) antes do checkpoint.  
**Dependência:** Fase 1 aprovada em 2026-11-05.  
**Próxima fase:** [Fase 3 — Financeiro](fase-3-financeiro.md).

### Decisões de domínio confirmadas em 2026-11-05

- **Competência de intervalo cruzando dia/mês:** atribuir toda a duração ao `workDate` da data civil de início (no fuso configurado), sem dividir automaticamente.
- **Sobreposição:** bloqueio global entre todos os clientes/projetos apenas para apontamentos `INTERVAL` ativos (`deletedAt IS NULL`), permitindo intervalos adjacentes (`aStart < bEnd && bStart < aEnd`); lançamentos `DURATION` não possuem janela temporal e não participam da comparação.
- **Competência fechada e registro faturado:** bloquear criação, edição e exclusão quando o `BillingPeriod` daquele cliente/competência (`workDate`) estiver `CLOSED`, bem como bloquear edição/exclusão de registros `TimeEntry` faturados (`status !== DRAFT` ou com `BillingItem` ativo `releasedAt IS NULL`).
- **Cadastro inativo em edições históricas:** bloquear novos lançamentos em clientes/projetos inativos, mas permitir editar um apontamento `DRAFT` existente mantendo seu projeto original caso o projeto/cliente tenha sido desativado depois (sem exigir troca automática para cadastro ativo).
- **Edição de tarifa histórica:** preservar o snapshot `hourlyRateCents` gravado por padrão ao editar apontamentos, permitindo alteração explícita antes do faturamento e jamais recalculando apontamentos quando o catálogo muda.

## 1. Objetivo

Substituir o lançamento diário da planilha por calendário mensal, lista filtrável e formulário de duração ou início/término. Garantir que minutos, datas civis, intervalos e valores sejam consistentes antes do financeiro.

## 2. Decisões antes da implementação

As regras abaixo não foram todas explicitadas no PRD. Confirmar e registrar a política adotada, sem apresentá-la como decisão já aprovada:

1. **Competência de intervalo cruzando mês:** proposta de atribuir toda a duração ao `workDate` do início, sem dividir automaticamente. Isso é consistente com um apontamento possuir uma única data civil.
2. **Sobreposição:** proposta de bloquear globalmente entre todos os clientes/projetos; manual não tem janela temporal e não participa da comparação de intervalos.
3. **Competência fechada:** proposta de bloquear criação, importação e alterações de apontamentos daquele cliente/mês até reabertura. A Fase 3 implementará a proteção completa.
4. **Cadastro inativo:** proposta de impedir novos lançamentos e permitir visualizar histórico; a edição histórica não deve exigir troca automática para cadastro ativo.
5. **Edição de tarifa histórica:** preservar a tarifa gravada por padrão. Oferecer mudança explícita antes de faturar, sem recalcular porque o catálogo mudou.

## 3. Domínio e persistência

`TimeEntry`: projeto obrigatório, `workDate` string `YYYY-MM-DD`, modo `DURATION`/`INTERVAL`, `startAt`/`endAt` opcionais UTC, duração inteira em minutos, descrição, tarifa em centavos, valor em centavos, faturável, status, exclusão lógica e timestamps.

- `DURATION`: início/fim devem ser nulos; data civil e duração são informadas diretamente.
- `INTERVAL`: início/fim obrigatórios e consistentes; duração calculada no servidor.
- Cliente é derivado de `Project.clientId`; validar que o projeto corresponde ao cliente selecionado.
- Novo apontamento nasce `DRAFT`. Não haverá botão de aprovação. `APPROVED` fica reservado e não é requisito para fechamento.
- Só registros sem faturamento ativo podem ser editados/excluídos; implementar a guarda desde esta fase.

## 4. Duração, datas e fuso

### 4.1. Duração manual

- [x] Parser estrito de duração: horas com dois ou mais dígitos, minutos `00–59`, duração maior que zero.
- [x] `05:30 → 330`, `24:30 → 1470`, `100:00 → 6000`.
- [x] Rejeitar `00:00`, negativos, minuto `60`, string vazia, horas decimais e valores além dos limites numéricos documentados.
- [x] Formatar todos os totais como duração `HH:mm`, sem reduzir horas módulo 24.
- [x] Não converter duração manual para UTC: ela não é um instante.

### 4.2. Início/término

- [x] Formulário informa data e hora de início **e data e hora de término**; permitir dias diferentes e passagem pela meia-noite.
- [x] Usar timezone IANA configurado para converter datas/horas locais em instantes UTC.
- [x] Exigir `endAt > startAt`; início igual ao término é inválido e não vira automaticamente 24h.
- [x] Não inferir dia seguinte silenciosamente quando término for anterior. Se houver atalho de "dia seguinte", deixá-lo explícito.
- [x] Não criar limite de 24h por apontamento: ele não existe no PRD.
- [x] Calcular minutos no servidor a partir dos instantes, não de duração enviada pelo cliente.
- [x] Proposta de precisão: campos em minutos e rejeição de segundos/subminutos em payload externo, sem arredondamento silencioso.
- [x] Validar datas impossíveis, bissextos, fim anterior e timezone inválido.
- [x] Definir política para horários locais inexistentes/ambíguos por mudanças de offset; preferir erro com orientação a interpretação silenciosa.
- [x] `workDate` é uma data civil estável: não reatribuir competência de registros quando mudar o fuso global.

Não alterar a data de registros históricos ao formatar UTC com o timezone do navegador. Se for necessário preservar o timezone de criação, propor campo adicional e migration ao integrador antes da implementação.

## 5. Sobreposição e concorrência

Para dois intervalos semiabertos `[aStart, aEnd)` e `[bStart, bEnd)`, existe conflito quando:

```text
aStart < bEnd && bStart < aEnd
```

- [x] Intervalos adjacentes são permitidos: 08:00–09:00 e 09:00–10:00.
- [x] Excluir da consulta o próprio registro durante edição e registros com `deletedAt` definido.
- [x] Incluir intervalos faturados ainda ativos: faturamento não libera a janela.
- [x] Não restringir a consulta ao mesmo `workDate`; intervalos podem atravessar dias e meses.
- [x] Verificação + escrita precisam de atomicidade que evite dois lançamentos concorrentes conflitantes.
- [x] Verificar o isolamento real do adapter SQLite escolhido e sua transação de escrita; não emitir `BEGIN IMMEDIATE` dentro de uma transação Prisma já aberta sem suporte documentado.
- [x] Implementar tratamento limitado de conflitos/busy e repetir **a operação inteira**, com nova validação, quando necessário.
- [x] Bloqueio apenas em memória/processo não é garantia suficiente para testes e processos concorrentes.

## 6. Valor e tarifa

Resolver a tarifa na criação com `projeto ?? cliente ?? global`, permitir edição explícita e persistir o snapshot. `billable=false` preserva duração e tarifa, mas grava `amountCents=0`.

Para valores não negativos, half-up exato por apontamento pode ser calculado com inteiros:

```text
numerador = BigInt(durationMinutes) * BigInt(hourlyRateCents)
amountCents = (numerador + 30n) / 60n
```

Validar limites antes de converter para `number`/Prisma `Int`. Não usar ponto flutuante para dinheiro nem arredondar o total mensal novamente. Compartilhar o helper com financeiro, importação e relatórios.

## 7. Interface

### Calendário mensal

- [x] Todos os dias do mês, inclusive sem apontamentos.
- [x] Navegação por mês/ano, indicação de hoje e seleção de dia.
- [x] Total `HH:mm` por dia e mensal, dias trabalhados e destaque visual de sábados/domingos sem adicional financeiro.
- [x] Detalhe do dia com múltiplos lançamentos e ações de criar/editar/excluir.
- [x] Lista e formulário utilizáveis no mobile sem depender de hover ou célula minúscula.

### Lista e formulário

- [x] Lista com período, cliente, projeto, faturável e status; paginação ou limite explícito.
- [x] Seleção de cliente restringe projetos; trocar cliente limpa projeto incompatível.
- [x] Modalidades duração e intervalo com campos e mensagens apropriados.
- [x] Prévia de duração/valor é informativa; servidor recalcula ao salvar.
- [x] Datas passadas/futuras permitidas.
- [x] Exclusão lógica com confirmação, auditoria financeira e revalidação dos totais.
- [x] Feedback de sobreposição informa o conflito sem expor erro técnico.

## 8. Arquivos e divisão em worktrees

```text
src/modules/time-entry/{schema,service,repository,types}.ts
src/modules/time-entry/components/
src/app/timesheet/
src/lib/{duration,datetime,money}.ts
tests/unit/{duration,datetime,money,overlap}.test.ts
tests/integration/time-entry.test.ts
tests/e2e/timesheet.spec.ts
```

Primeiro estabilizar DTOs, serviços e helpers. Depois: agente A cuida do domínio/persistência; B do calendário/lista; C do formulário e testes de interface, desde que componentes e arquivos não se sobreponham. O integrador mantém helpers compartilhados, migrations e wiring de rotas. Executores Big Pickle, worktrees/bancos/portas separados.

## 9. Testes e aceite

- [x] 05:30 e 08:00–13:30 resultam em 330 minutos.
- [x] 330 minutos a 7500 centavos/h resultam em 41250 centavos.
- [x] 1 minuto a 30 centavos/h arredonda 0,5 centavo para 1 centavo.
- [x] Múltiplos lançamentos no dia somam horas e contam um dia trabalhado.
- [x] Não faturável soma horas e gera zero cobrança.
- [x] Tarifa alterada no catálogo não muda lançamentos gravados.
- [x] Intervalos iguais, contidos, cruzados e adjacentes; edição não conflita consigo.
- [x] Duas criações concorrentes sobrepostas não são ambas aceitas.
- [x] Virada de dia/mês/ano e fevereiro bissexto obedecem à competência aprovada.
- [x] Horas acima de 24 não quebram formulário, calendário ou total.
- [x] Registro faturado não pode ser editado/excluído por requisição direta.
- [x] Calendário reproduz fonte histórica se disponível; sem arquivo, distinguir demonstração sintética.

Executar qualidade, integração e E2E relevantes. Demonstrar criação nas duas modalidades e calendário no checkpoint; aguardar autorização para a Fase 3.

## 10. Prompt de execução

> Use Big Pickle para a Fase 2. Confirme as políticas de competência e sobreposição antes de implementar. Estabilize helpers de datas, duração e dinheiro; não invente teto de 24h nem inferência silenciosa de dia seguinte. Divida domínio, calendário e formulário somente após contratos definidos. Valide concorrência em SQLite real e pare no checkpoint.
