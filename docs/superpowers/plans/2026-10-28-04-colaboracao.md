# Plano 04 — Colaboração

**Status: concluído em 28/10/2026, em execução direta.**

Parte do código real dos Planos 01–03: `withUser`/RLS, timeline e auditoria
transacionais, SSE que só emite `{ type }`, permissões em `@npac/shared` e
casca responsiva (`[secao]` ainda mostra “Em breve” para Chat, Equipe e Playbook).

## Entregas propostas

| # | Entrega | Critério de pronto |
|---|---|---|
| 1 | Schema do chat: canais (`GENERAL`, `DM`), membros, mensagens, leitura | Migration + RLS como npac_app: Geral visível a todo usuário ativo; DM só aos 2 membros (HEAD também não lê DM alheia); mensagens append-only (autor edita/apaga só via soft delete próprio); par de DM único |
| 2 | API do chat | `GET /chat/channels` com não-lidas; `POST /chat/dm` abre/reaproveita DM; mensagens paginadas por cursor; `POST` com corpo ≤ 2 000 chars; marcar lido; usuário inativo não envia nem recebe |
| 3 | Menção `#lead` | Mensagem guarda só o ID do lead; ao ler, a API resolve nome **por RLS do leitor** — quem não vê o lead recebe “lead restrito” sem nome; link abre ficha (404 se invisível) |
| 4 | Tempo real | Digest do SSE inclui revisão do chat calculada por RLS (`max(id)` das mensagens visíveis + leituras próprias); cliente refaz a consulta; nenhum texto no stream |
| 5 | Tela Chat | Lista de canais com badge de não-lidas, conversa com envio otimista e indicador de erro, seletor de `#lead` por busca POST; mobile (lista → conversa) e desktop (duas colunas) |
| 6 | Handoff e Google Agenda na ficha | “Copiar handoff” monta texto no servidor (nome, faixa, perfil, resumo, próxima reunião; **sem telefone**); “Adicionar ao Google Agenda” gera link `calendar.google.com/render` com título/horário BRT sem contato, aberto só por clique |
| 7 | Equipe | Cards de membros ativos com papel, flags e números do período reutilizando o SQL de relatórios no escopo do leitor (SDR/CLOSER só veem os próprios números; dos outros, só nome/papel) |
| 8 | Playbook | Tabelas `playbook_topics`/`playbook_scripts` com RLS (leitura todos, escrita HEAD), seed com temas iniciais, busca POST, “copiar”, edição com versão; timeline/auditoria da edição |
| 9 | Regressão | Testes RLS (DM alheia invisível, inclusive para HEAD), API e e2e com screenshots desktop/mobile; JS de `/leads` < 150 KB; “Em breve” removido de Chat/Equipe/Playbook |

## Regras preservadas

- Mesmas permissões/RLS, 404 para invisível, MFA obrigatório para HEAD.
- Conteúdo do chat não vai para logs, URL, analytics ou localStorage; auditoria
  registra apenas IDs (canal/mensagem), nunca o texto.
- Sem PII no SSE; consumidores refazem consultas autorizadas.
- Teste que falha → implementação → validação focada → commit; execução direta.

## Fora deste plano

Admin/LGPD (05) e migração/deploy (06). Anexos, reações e edição de mensagem
ficam fora da v1.

## Evidências de conclusão

Migration `0015_collaboration.sql` (chat, DMs via `chat_open_dm`, leituras, playbook) com
RLS provada como npac_app: DM invisível a HEAD não membro, mensagens append-only,
menção a lead invisível recusada. API `chat`, `leads/:id/handoff`, `team`, `playbook`
com testes de integração; SSE inclui revisão do chat. Telas Chat (mobile/desktop),
Equipe, Playbook e ações de handoff/Agenda na ficha, com e2e e screenshots.

Decisões: busca do playbook é local (conteúdo não pessoal, lista pequena); mensagens
não têm edição/exclusão na v1; menções não geram auditoria por mensagem; o link do
Google Agenda leva só perfil e link da ficha (sem nome/contato).
