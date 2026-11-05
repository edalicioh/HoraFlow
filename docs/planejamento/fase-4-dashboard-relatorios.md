# Fase 4 — Dashboard e relatórios

**Estado:** implementada e verificada em 2026-11-05 (aguardando aprovação do checkpoint `docs/checkpoints/fase-4.md`).
**Executor:** Big Pickle (`opencode/big-pickle`) / autorizado em 2026-11-05 no Antigravity: Gemini 4 Argon (Medium) (`inherit`), sequencial.
**Revisor padrão:** GPT-6.1 Sol (`openai/gpt-6.1-sol`) / autorizado em 2026-11-05 no Antigravity: subagente `reviewer` somente leitura (`inherit`/`pro`) antes do checkpoint.
**Dependência:** Fase 3 aprovada em 2026-11-05.
**Próxima fase:** [Fase 5 — Importação e estabilização](fase-5-importacao-estabilizacao.md).

### Decisões de domínio confirmadas em 2026-11-05

- **Semântica financeira do Dashboard mensal vs. Relatórios:** nos cards do Dashboard mensal da competência selecionada (`YYYY-MM`), usar a semântica de competência: **Recebido da competência** soma os pagamentos ativos (`voidedAt === null`) vinculados aos fechamentos (`CLOSED`) daquela competência (independentemente da data `paidAt`); e **Pendente da competência** separa explicitamente **A faturar** (apontamentos faturáveis `DRAFT`/`APPROVED` ainda não incluídos em fechamento ativo) de **Saldo de fechamentos** (`balanceCents` dos `BillingPeriod`s `CLOSED` da competência), sem dupla contagem de apontamentos já representados em `BillingItem`. No relatório de Pagamentos e Pendências, permitir escolher explicitamente entre filtrar por **período do pagamento (`paidAt`)** ou por **competência do fechamento**.
- **Limite de linhas por exportação (CSV, XLSX e PDF):** aplicar limite explícito de **10.000 linhas** por exportação, retornando erro claro orientando o usuário a refinar os filtros caso a consulta ultrapasse esse limite (sem truncamento silencioso nem sobrecarga de memória).

## 1. Objetivo

Entregar visão mensal confiável e relatórios que consultem os mesmos dados e filtros nos formatos CSV, XLSX e PDF. A biblioteca PDF escolhida é `@react-pdf/renderer`; não instalar Chromium ou serviços externos.

## 2. Dashboard mensal

- [x] Seletor de competência com navegação entre meses e anos.
- [x] Horas trabalhadas: todos os apontamentos ativos do mês, inclusive não faturáveis.
- [x] Dias trabalhados: quantidade de `workDate` distintos com apontamentos ativos.
- [x] Horas faturáveis: soma apenas dos apontamentos faturáveis ativos.
- [x] Valor acumulado: soma dos `amountCents` dos faturáveis na competência, sem arredondar novamente o total.
- [x] Valor recebido e pendente com semântica de competência claramente indicada.
- [x] Distribuição de horas por cliente/projeto, com tabela acessível além de eventual gráfico.
- [x] Estados vazio, carregando, erro e valores zero corretos.
- [x] Revalidação após alterações de horas, fechamento, reabertura, pagamento e estorno.

### 2.1. Semântica financeira a confirmar

O PRD não define se "recebido no mês" usa data do pagamento ou competência do fechamento. Proposta: nos cards mensais, usar pagamentos ativos dos fechamentos da competência selecionada, independentemente da data do recebimento; os relatórios de fluxo usam `paidAt`. Exibir os rótulos correspondentes.

Separar "a faturar" (apontamentos ainda não fechados) de "saldo de fechamentos". Proposta para pendente geral da competência: valor a faturar + saldo dos fechamentos fechados. Não somar novamente os apontamentos já representados em `BillingItem`. Confirmar esses contratos antes de implementar as consultas.

## 3. Consultas e filtros reutilizáveis

Criar schema de filtros e camada de consulta única para tela e exportadores. Validar no servidor, normalizar datas civis e aplicar os mesmos filtros em todos os formatos.

Filtros conforme relatório: início/fim inclusivos para `workDate`, cliente, projeto, faturável, status e competência. Relatórios de pagamentos usam uma escolha explícita entre período do pagamento e competência do fechamento. Não aplicar filtros sem sentido a um relatório silenciosamente.

Todos os relatórios ignoram `TimeEntry.deletedAt` por padrão e pagamentos estornados nos totais ativos. Quando exibirem estornos para consulta, devem identificá-los claramente e não somá-los ao recebido.

## 4. Relatórios a entregar

| Relatório | Conteúdo mínimo |
|---|---|
| Horas por período | Dias, totais trabalhados/faturáveis, valores |
| Horas por cliente | Agrupamento por cliente e total geral |
| Horas por projeto | Cliente, projeto, totais e filtros |
| Apontamentos detalhados | Data, cliente, projeto, descrição, duração, tarifa, faturável, valor |
| Valores faturáveis | Horas faturáveis, valor acumulado, a faturar e fechado |
| Fechamentos mensais | Competência, cliente, snapshots, recebido e saldo |
| Pagamentos e pendências | Data do pagamento, método, fechamento, estorno, saldo |

Demonstrativos de fechamento leem os snapshots da versão correspondente, não recalculam valores a partir das tarifas atuais. Identificação histórica de nomes/descrições deve seguir o contrato aprovado na Fase 3.

## 5. Exportadores

### CSV

- [x] UTF-8 com BOM e separador `;`, adequado ao Excel pt-BR.
- [x] Escape correto de aspas, delimitadores e quebras de linha.
- [x] Cabeçalhos legíveis, datas explícitas e duração em `HH:mm` sem virar horário do dia.
- [x] Neutralizar injeção de fórmulas em campos textuais não confiáveis, inclusive valores iniciados por `=`, `+`, `-`, `@` ou caracteres de controle pertinentes.

### XLSX — ExcelJS

- [x] Cabeçalho, filtros e linha de totais coerentes com a tela.
- [x] Dinheiro exportado como número com formato monetário, sem fórmulas vindas do usuário.
- [x] Durações acima de 24h exibidas como texto `HH:mm` ou número de dias com formato `[h]:mm`; testar round-trip.
- [x] Datas civis exportadas sem deslocamento de fuso inadvertido.
- [x] Campos textuais como strings, nunca como fórmulas/hyperlinks arbitrários.

### PDF — `@react-pdf/renderer`

- [x] Cabeçalho com período/filtros, totais e data de geração no fuso configurado.
- [x] Tabelas com quebra de página, cabeçalho repetível e número de página.
- [x] Acentos pt-BR e fontes locais/embutidas, sem download obrigatório em runtime.
- [x] Testar nomes e descrições longas, páginas múltiplas e linhas sem dados.
- [x] Gerar no servidor Node, não depender de runtime Edge incompatível.

### Rotas e limites

- [x] Route Handlers validam filtros e formato; não aceitam caminhos de arquivo enviados pelo cliente.
- [x] Downloads com `Content-Type` e `Content-Disposition` corretos e nome de arquivo sanitizado.
- [x] Definir limites de linhas e tratamento de relatórios grandes antes de carregar tudo em memória; não truncar silenciosamente.
- [x] Erros não expõem SQL, caminhos locais ou stack traces.
- [x] Não gravar relatórios com dados pessoais em `public/`.

## 6. Fronteiras e paralelismo

```text
src/modules/dashboard/
src/modules/reporting/{schema,service,repository,types}.ts
src/modules/reporting/exporters/{csv,xlsx,pdf}/
src/app/dashboard/
src/app/reports/
src/app/api/reports/
tests/{unit,integration,e2e}/
```

Primeiro estabilizar DTOs de relatório, filtros e semântica dos cards. Depois dividir em worktrees: dashboard; CSV/XLSX; PDF/interface de relatórios. Um único responsável mantém a consulta base e contratos. Dependências, lockfile e rotas compartilhadas são integrados pelo coordenador. Todos os construtores usam Big Pickle.

## 7. Testes obrigatórios

- [x] Mesmo filtro produz exatamente os mesmos IDs, minutos e centavos na consulta e nos três formatos.
- [x] Dois lançamentos no mesmo dia contam um dia trabalhado; não faturável soma horas sem cobrança.
- [x] Estorno deixa de somar ao recebido; fechamento parcial mantém saldo correto.
- [x] Pagamento em outro mês obedece à semântica de competência versus fluxo.
- [x] Sem dupla contagem de horas/valores após fechar e reabrir.
- [x] Snapshot financeiro não muda quando tarifa atual é alterada.
- [x] CSV com aspas, acentos, newline, `;` e tentativa de fórmula.
- [x] XLSX reaberto por ExcelJS com valores/durações válidos; fórmula do usuário não executável.
- [x] PDF gerado e verificado em quantidade de páginas, texto/valores e inspeção visual de tabela longa.
- [x] E2E com filtros, download e dashboard atualizado após mutação.

## 8. Critérios de aceite e checkpoint

Todos os relatórios do PRD disponíveis em CSV/XLSX/PDF, filtros consistentes, indicadores sem dupla contagem, interface responsiva e build/testes verdes. Apresentar exemplos gerados com dados de teste não sensíveis e as evidências. Aguardar aprovação antes da importação.

## 9. Prompt de execução

> Execute a Fase 4 com Big Pickle. Leia o guia e confirme os contratos de competência/recebimentos. Congele filtros e DTOs antes de dividir dashboard e exportadores em worktrees. Use ExcelJS e @react-pdf/renderer, sem Chromium. Demonstre que os três formatos representam os mesmos dados e pare no checkpoint.
