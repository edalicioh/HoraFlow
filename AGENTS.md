# HoraFlow — Instruções para agentes

## Escopo e autorização

- O projeto segue o PRD v1.2 e os planos em `docs/planejamento/`.
- Ler `docs/planejamento/README.md` e o arquivo da fase antes de trabalhar.
- A entrega inicial contém somente planos e configuração. Não iniciar construção só porque estes arquivos existem: aguardar autorização explícita da fase.
- Executar uma fase por vez, com checkpoint e aprovação do usuário antes da seguinte.
- Diferenciar requisitos aprovados de propostas pendentes. Pedir decisão antes de implementar uma regra não definida que afete dados/financeiro.

## Modelos de construção, revisão e coordenação

- Construção do aplicativo, testes e correções de implementação usam **Big Pickle**, ID `opencode/big-pickle`, como principal. Em caso de indisponibilidade/limite, o usuário autorizou em 2026-11-04 o primeiro fallback **DeepSeek V4.1 Flash Free**, ID `opencode/deepseek-v4.1-flash-free#high`.
- Segundo fallback autorizado: **GPT-6 Luna**, ID `openai/gpt-6-luna#high`. Após deixar a escolha pendente, o usuário confirmou em 2026-11-04 “vai ser o gpt-6-luna mesmo”, autorizando este modelo em `high`. Usá-lo quando Big Pickle e DeepSeek estiverem indisponíveis; se os três falharem, parar e aguardar decisão.
- A cadeia de fallback é um protocolo de coordenação: selecionar explicitamente o modelo em cada delegação, comunicar a troca e registrar o executor no checkpoint. Não presumir failover automático da configuração.
- O revisor padrão é **GPT-6.1 Sol**, ID `openai/gpt-6.1-sol`, pelo agente `reviewer`. Não usar Big Pickle como revisor.
- A revisão é independente e somente leitura: analisar alterações e evidências, apontar problemas e devolver correções ao construtor principal ou fallback autorizado. O revisor não implementa correções nem aprova avanço no lugar do usuário.
- Conferir o modelo efetivamente selecionado: arquivo de configuração não troca automaticamente uma sessão já aberta.
- Coordenadores de outro modelo podem planejar, revisar e orientar; delegar a implementação para Big Pickle ou fallback autorizado quando o principal estiver indisponível.
- Ao iniciar subagente construtor, informar explicitamente o modelo quando a ferramenta permitir. Se indisponível, comunicar a troca para o próximo fallback autorizado; esgotadas as opções autorizadas, comunicar o bloqueio sem substituir silenciosamente.
- Ao delegar revisão, usar `reviewer` com `openai/gpt-6.1-sol`. Se a ferramenta só oferecer `general`, informar explicitamente esse modelo e o escopo somente leitura, sem herdar o modelo Big Pickle de `general`.
- O usuário autorizou múltiplos agentes/worktrees para tarefas independentes. Isso não autoriza avanço automático de fase nem destruição de trabalho.

## Paralelismo

- Seguir integralmente o protocolo de `docs/planejamento/README.md`.
- Worktrees exigem Git e commit-base válidos. Não criar banco/servidor compartilhado entre agentes.
- Um responsável por arquivo; schema, migrations, lockfile, dependências e configurações compartilhadas têm dono único.
- Um subagente não é isolado automaticamente: fixar diretório/worktree real antes de escrita, com banco/porta próprios.
- Não usar agentes paralelos gravadores quando não houver isolamento garantido; executar sequencialmente nesse caso.
- Nunca descartar mudanças de terceiros, forçar limpeza ou remover volumes/worktrees com trabalho sem autorização.

## Invariantes técnicas

- Next.js App Router, TypeScript estrito, Prisma/SQLite e Docker Compose; sem autenticação no MVP.
- Entradas validadas no servidor com Zod. Não confiar em valores financeiros ou snapshots enviados pelo navegador.
- Duração em minutos inteiros, `workDate` como data civil e instantes em UTC. Não impor teto arbitrário de 24h.
- Dinheiro em centavos com aritmética inteira e half-up por apontamento. Snapshot da tarifa não muda com o catálogo.
- Fechamentos, pagamentos, reaberturas, estornos e auditoria correspondente são atômicos e testados sob concorrência.
- Nenhum login, `User`, sessão, serviço pago obrigatório, cronômetro ou emissão fiscal fora do escopo.
- pt-BR/BRL, timezone inicial `America/Sao_Paulo`, tema claro/escuro e responsividade.
- PDF: `@react-pdf/renderer`; XLSX: ExcelJS. PDF histórico não é formato de importação.
- SQLite, backups, uploads temporários e dados privados nunca em `public/` ou commits inadvertidos.
- Aplicação local por padrão em `127.0.0.1` no host; acesso privado remoto somente explicitamente configurado.

## Evidências

- Executar testes relevantes e registrar comandos/resultados no checkpoint da fase.
- Antes de apresentar o checkpoint para aprovação, solicitar revisão independente com GPT-6.1 Sol, registrar achados e encaminhar correções ao construtor principal ou fallback autorizado. Solicitar nova revisão quando necessário.
- Não declarar build, Docker, E2E ou aceite histórico aprovados sem execução verificável.
- Sem a planilha real, dados sintéticos não comprovam o aceite de outubro/2026.
- Preservar estes planos ao criar scaffold na raiz, sem apagar arquivos para satisfazer um gerador.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
