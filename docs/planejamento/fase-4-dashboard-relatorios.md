# Fase 4 — Dashboard e relatórios

**Estado:** não iniciada.  
**Executor:** Big Pickle (`opencode/big-pickle`).  
**Revisor padrão:** GPT-6.1 Sol (`openai/gpt-6.1-sol`), independente e somente leitura antes do checkpoint.  
**Dependência:** Fase 3 aprovada.  
**Próxima fase:** [Fase 5 — Importação e estabilização](fase-5-importacao-estabilizacao.md).

## 1. Objetivo

Entregar visão mensal confiável e relatórios que consultem os mesmos dados e filtros nos formatos CSV, XLSX e PDF. A biblioteca PDF escolhida é `@react-pdf/renderer`; não instalar Chromium ou serviços externos.

## 2. Dashboard mensal

- [ ] Seletor de competência com navegação entre meses e anos.
- [ ] Horas trabalhadas: todos os apontamentos ativos do mês, inclusive não faturáveis.
- [ ] Dias trabalhados: quantidade de `workDate` distintos com apontamentos ativos.
- [ ] Horas faturáveis: soma apenas dos apontamentos faturáveis ativos.
- [ ] Valor acumulado: soma dos `amountCents` dos faturáveis na competência, sem arredondar novamente o total.
- [ ] Valor recebido e pendente com semântica de competência claramente indicada.
- [ ] Distribuição de horas por cliente/projeto, com tabela acessível além de eventual gráfico.
- [ ] Estados vazio, carregando, erro e valores zero corretos.
- [ ] Revalidação após alterações de horas, fechamento, reabertura, pagamento e estorno.

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

- [ ] UTF-8 com BOM e separador `;`, adequado ao Excel pt-BR.
- [ ] Escape correto de aspas, delimitadores e quebras de linha.
- [ ] Cabeçalhos legíveis, datas explícitas e duração em `HH:mm` sem virar horário do dia.
- [ ] Neutralizar injeção de fórmulas em campos textuais não confiáveis, inclusive valores iniciados por `=`, `+`, `-`, `@` ou caracteres de controle pertinentes.

### XLSX — ExcelJS

- [ ] Cabeçalho, filtros e linha de totais coerentes com a tela.
- [ ] Dinheiro exportado como número com formato monetário, sem fórmulas vindas do usuário.
- [ ] Durações acima de 24h exibidas como texto `HH:mm` ou número de dias com formato `[h]:mm`; testar round-trip.
- [ ] Datas civis exportadas sem deslocamento de fuso inadvertido.
- [ ] Campos textuais como strings, nunca como fórmulas/hyperlinks arbitrários.

### PDF — `@react-pdf/renderer`

- [ ] Cabeçalho com período/filtros, totais e data de geração no fuso configurado.
- [ ] Tabelas com quebra de página, cabeçalho repetível e número de página.
- [ ] Acentos pt-BR e fontes locais/embutidas, sem download obrigatório em runtime.
- [ ] Testar nomes e descrições longas, páginas múltiplas e linhas sem dados.
- [ ] Gerar no servidor Node, não depender de runtime Edge incompatível.

### Rotas e limites

- [ ] Route Handlers validam filtros e formato; não aceitam caminhos de arquivo enviados pelo cliente.
- [ ] Downloads com `Content-Type` e `Content-Disposition` corretos e nome de arquivo sanitizado.
- [ ] Definir limites de linhas e tratamento de relatórios grandes antes de carregar tudo em memória; não truncar silenciosamente.
- [ ] Erros não expõem SQL, caminhos locais ou stack traces.
- [ ] Não gravar relatórios com dados pessoais em `public/`.

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

- [ ] Mesmo filtro produz exatamente os mesmos IDs, minutos e centavos na consulta e nos três formatos.
- [ ] Dois lançamentos no mesmo dia contam um dia trabalhado; não faturável soma horas sem cobrança.
- [ ] Estorno deixa de somar ao recebido; fechamento parcial mantém saldo correto.
- [ ] Pagamento em outro mês obedece à semântica de competência versus fluxo.
- [ ] Sem dupla contagem de horas/valores após fechar e reabrir.
- [ ] Snapshot financeiro não muda quando tarifa atual é alterada.
- [ ] CSV com aspas, acentos, newline, `;` e tentativa de fórmula.
- [ ] XLSX reaberto por ExcelJS com valores/durações válidos; fórmula do usuário não executável.
- [ ] PDF gerado e verificado em quantidade de páginas, texto/valores e inspeção visual de tabela longa.
- [ ] E2E com filtros, download e dashboard atualizado após mutação.

## 8. Critérios de aceite e checkpoint

Todos os relatórios do PRD disponíveis em CSV/XLSX/PDF, filtros consistentes, indicadores sem dupla contagem, interface responsiva e build/testes verdes. Apresentar exemplos gerados com dados de teste não sensíveis e as evidências. Aguardar aprovação antes da importação.

## 9. Prompt de execução

> Execute a Fase 4 com Big Pickle. Leia o guia e confirme os contratos de competência/recebimentos. Congele filtros e DTOs antes de dividir dashboard e exportadores em worktrees. Use ExcelJS e @react-pdf/renderer, sem Chromium. Demonstre que os três formatos representam os mesmos dados e pare no checkpoint.
