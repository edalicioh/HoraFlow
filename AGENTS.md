# HoraFlow — Instruções para agentes

## Escopo e autorização

- O projeto segue o PRD v1.2 e os planos em `docs/planejamento/`.
- Ler `docs/planejamento/README.md` e o arquivo da fase antes de trabalhar.
- A entrega inicial contém somente planos e configuração. Não iniciar construção só porque estes arquivos existem: aguardar autorização explícita da fase.
- Executar uma fase por vez, com checkpoint e aprovação do usuário antes da seguinte.
- Diferenciar requisitos aprovados de propostas pendentes. Pedir decisão antes de implementar uma regra não definida que afete dados/financeiro.

## Modelos de construção, revisão e coordenação

- Construção do aplicativo, testes e correções de implementação devem usar **Big Pickle**, ID `opencode/big-pickle`.
- O revisor padrão é **GPT-6.1 Sol**, ID `openai/gpt-6.1-sol`, pelo agente `reviewer`. Não usar Big Pickle como revisor.
- A revisão é independente e somente leitura: analisar alterações e evidências, apontar problemas e devolver correções ao construtor Big Pickle. O revisor não implementa correções nem aprova avanço no lugar do usuário.
- Conferir o modelo efetivamente selecionado: arquivo de configuração não troca automaticamente uma sessão já aberta.
- Coordenadores de outro modelo podem planejar, revisar e orientar; delegar a implementação para Big Pickle.
- Ao iniciar subagente construtor, informar explicitamente o modelo quando a ferramenta permitir. Se indisponível, comunicar o bloqueio; não substituir silenciosamente.
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
- Antes de apresentar o checkpoint para aprovação, solicitar revisão independente com GPT-6.1 Sol, registrar achados e encaminhar correções ao Big Pickle. Solicitar nova revisão quando necessário.
- Não declarar build, Docker, E2E ou aceite histórico aprovados sem execução verificável.
- Sem a planilha real, dados sintéticos não comprovam o aceite de outubro/2026.
- Preservar estes planos ao criar scaffold na raiz, sem apagar arquivos para satisfazer um gerador.
