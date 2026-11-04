# Fase 5 — Importação e estabilização

**Estado:** não iniciada.  
**Executor:** Big Pickle (`opencode/big-pickle`).  
**Revisor padrão:** GPT-6.1 Sol (`openai/gpt-6.1-sol`), independente e somente leitura antes do checkpoint.  
**Dependência:** Fase 4 aprovada e arquivo histórico fornecido pelo usuário para o aceite real.

## 1. Objetivo

Importar histórico CSV/XLSX com prévia, validação e confirmação transacional, comprovar os cenários de aceite e entregar operação local confiável com backup/restauração documentados.

O usuário informou que fornecerá a planilha/PDF original de outubro/2026. Enquanto o arquivo não estiver disponível, testes sintéticos são permitidos, mas não substituem nem comprovam o aceite histórico real de **9 registros e 24h30 (1470 minutos)**.

## 2. Tratamento da fonte histórica

- [ ] Receber o arquivo por meio autorizado e manter dados privados fora de commits públicos.
- [ ] Inspecionar nomes de abas, cabeçalhos, células, datas, duração e linhas de totais.
- [ ] Se a planilha tiver abas mensais, permitir seleção explícita da aba no wizard.
- [ ] PDF serve apenas para conferência visual/manual; importação direta de PDF continua fora do MVP.
- [ ] Se somente PDF for fornecido, pedir CSV/XLSX ou combinar transcrição conferida; não prometer parser de PDF como importador.
- [ ] Não inserir dados reais automaticamente como seed de desenvolvimento ou inicialização de produção.

## 3. Wizard de importação

### 3.1. Upload e leitura segura

- [ ] Aceitar somente CSV/XLSX e validar conteúdo, não apenas extensão ou MIME informado pelo navegador.
- [ ] Proposta de limite inicial: 5 MiB por arquivo. Confirmar e documentar limite de linhas, colunas, planilhas e tamanho descompactado do XLSX para conter zip bombs e consumo de memória.
- [ ] Nome do arquivo é metadado, nunca caminho de escrita.
- [ ] Manter temporários fora de `public/`, com limpeza e prazo de expiração.
- [ ] Rejeitar arquivos corrompidos, formatos não suportados, macros e dependências externas suspeitas.
- [ ] Não executar fórmulas nem links externos de planilha; exigir valores explícitos nas colunas importadas ou tratamento aprovado para valores cacheados.
- [ ] CSV suporta o delimitador confirmado/detectado com prévia, incluindo `;` e `,`, BOM e acentos; reportar encoding não suportado.

### 3.2. Mapeamento

- [ ] Usuário escolhe cabeçalho, aba XLSX e colunas de data/duração.
- [ ] Associar obrigatoriamente cliente e projeto válidos; o projeto deve pertencer ao cliente.
- [ ] Mapear descrição opcional e opção faturável. Definir explicitamente tarifa/fallback usados antes da confirmação.
- [ ] Aceitar `DD/MM/AAAA` e `YYYY-MM-DD` quando selecionados; não adivinhar datas ambíguas sem informar.
- [ ] XLSX: tratar datas seriais e sistemas de data 1900/1904 conforme metadados; validar anomalias de calendário.
- [ ] Tratar duração textual `HH:mm` e duração numérica Excel (fração de dia), inclusive valores acima de 24h.
- [ ] Não interpretar `5,5` automaticamente como 5h30 sem uma opção explícita de horas decimais.
- [ ] Ignorar linhas vazias e identificar cabeçalhos/totais na prévia, sem silenciosamente descartar dados aparentemente válidos.

### 3.3. Validação e prévia

- [ ] Cada linha exibe número original, data, duração normalizada, cliente, projeto, tarifa, faturável e valor calculado.
- [ ] Mostrar contagens de válidas, inválidas e possíveis duplicadas, mais total de horas/valor.
- [ ] Reutilizar as regras da Fase 2: duração positiva em minutos inteiros, data civil válida, limites numéricos e snapshot de tarifa.
- [ ] Calcular hash do arquivo para rastreabilidade; o hash sozinho não determina duplicidade de apontamentos nem autoriza reimportação.
- [ ] Sugerir assinatura de duplicidade com data, projeto, duração, modo, descrição normalizada e faturável; não transformar semelhança em rejeição automática. Duas atividades iguais podem ser legítimas.
- [ ] Detectar repetição dentro do arquivo e contra registros ativos já persistidos.
- [ ] Proposta de política: usuário decide importar/ignorar possíveis duplicados; seleção e contagens ficam explícitas.
- [ ] Uma alteração de mapeamento, cliente, projeto ou seleção invalida a prévia anterior.

### 3.4. Confirmação e transação

- [ ] Guardar a prévia validada no servidor ou token opaco ligado a um lote persistido; nunca confiar em valores financeiros reenviados pelo navegador.
- [ ] Proposta de estados de lote: `PENDING → PREVIEWED → IMPORTED`, com `FAILED` para falhas finais. Persistir hash, mapeamento, erros, contagens e timestamps necessários.
- [ ] Usar os mesmos valores/tarifas exibidos na prévia; se configuração ou elegibilidade mudar, exigir nova prévia em vez de cobrar silenciosamente outro valor.
- [ ] Confirmar todas as linhas selecionadas em uma única transação com verificação final dos cadastros, competência e duplicidades.
- [ ] Por padrão, qualquer linha inválida bloqueia confirmação. Importar só válidas é permitido apenas como opção explícita com contagem e confirmação de ignoradas, conforme RF10.
- [ ] Segunda confirmação do mesmo lote não cria novas entradas; implementar idempotência no banco/transação, não apenas desabilitar botão.
- [ ] Se qualquer inserção falhar, rollback integral do conjunto confirmado.
- [ ] Associar os apontamentos ao lote com relação/campo apropriado ou mapeamento auditável; submeter a migration ao integrador.
- [ ] Registrar auditoria do lote e das alterações financeiras com volume controlado e rastreabilidade.

## 4. Backup e restauração

- [ ] Implementar `scripts/backup.sh` ou equivalente e fornecer pré-requisitos reais da imagem/host.
- [ ] Usar mecanismo consistente de snapshot SQLite, como backup API ou `VACUUM INTO`; não copiar apenas `.db` enquanto houver escrita/WAL ativo.
- [ ] Destino fora de rotas públicas, nome seguro, permissões restritas e espaço livre verificado.
- [ ] Documentar retenção, cópia para outro dispositivo e responsabilidade do operador; não contratar serviço externo obrigatório.
- [ ] Procedimento de restauração exige parar aplicação, preservar estado atual, validar cópia e integridade, restaurar com dono/permissões corretos e reiniciar.
- [ ] Não reutilizar arquivos `-wal`/`-shm` de outro snapshot. Nunca apagar dados atuais sem confirmação e backup verificável.
- [ ] Testar restauração primeiro em ambiente/volume de teste, verificar migrations, horas, fechamentos, pagamentos e configurações.
- [ ] Documentar backup antes de upgrade e limites de rollback de schema; voltar imagem não desfaz migration automaticamente.

## 5. Estabilização e documentação

- [ ] README com instalação, variáveis, comandos, uso diário, import/export, fechamento/reabertura, estorno, backup, atualização e acesso privado.
- [ ] Nenhuma credencial, banco real, backup ou fixture privada em arquivos públicos/versionados inadvertidamente.
- [ ] Mensagens de erro em pt-BR, tratamento de falha de disco, arquivo inválido, SQLite ocupado e limite de upload.
- [ ] Revisar mobile, tema escuro, foco/teclado, duração maior que 24h e textos longos.
- [ ] Validar servidor sem login, bind local e ausência de arquivos privados por rotas.
- [ ] Conferir que nenhum recurso fora do escopo foi introduzido.

## 6. Paralelismo e propriedade

Depois de fechar o contrato de prévia/lote, dividir entre parser CSV/XLSX; wizard/interface; operações/backup/documentação. Integrador mantém confirmação transacional, schema/migrations e dependências. Cada agente Big Pickle tem worktree, banco e fixtures de teste independentes. Os testes de aceite finais executam somente sobre a integração consolidada.

## 7. Matriz de testes

| Área | Casos mínimos |
|---|---|
| CSV | BOM, `;`/`,`, aspas, newline, encoding e coluna ausente |
| XLSX | Aba correta, 1900/1904, duração numérica/textual, >24h e arquivo corrompido |
| Validação | Data impossível, zero/negativo, formato ambíguo, cliente/projeto inválido |
| Duplicidade | Mesmo arquivo, linhas iguais legítimas, ignorar/importar explicitamente |
| Transação | Falha no meio resulta em zero inserções do lote |
| Idempotência | Confirmação duplicada/concomitante não duplica apontamentos |
| Segurança | Tamanho, arquivo disfarçado, zip bomb controlada, fórmulas e path traversal |
| Histórico real | Outubro/2026: 9 registros, 1470 minutos, equivalência com fonte |
| Operação | Restart/recriação preserva dados, backup consistente e restore testado |

Executar todos os cenários da seção 10 do PRD: 05:30/330 minutos; intervalo 08:00–13:30/330; múltiplos por dia; tarifa histórica; não faturável; fechamento congelado; pagamento parcial; export filtrado; importação histórica; persistência Docker; dashboard sem login. Acrescentar regressão de reabertura, estorno e concorrência financeira.

## 8. Critérios de aceite final

- [ ] Importação real conferida contra fonte ou explicitamente marcada como bloqueada pela falta do arquivo.
- [ ] Unitários, integração SQLite, E2E e build completos com resultados registrados.
- [ ] Smoke Docker em ambiente limpo, volume persistente e restauração comprovada.
- [ ] Documentação permite ao usuário substituir a planilha no registro diário e financeiro.
- [ ] Entrega final distingue pronto, não testado e pendente. Não declarar MVP completo com critérios obrigatórios bloqueados.

## 9. Prompt de execução

> Use Big Pickle para a Fase 5. Leia o guia e solicite a fonte histórica se faltar. Entregue importação CSV/XLSX com prévia, confirmação idempotente e atomicidade; PDF é só referência. Divida parsers, wizard e operação em worktrees quando os contratos estiverem estáveis. Teste backup/restore e todos os aceites do MVP. Pare para homologação final, sem ocultar bloqueios.
