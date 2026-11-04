# Pedidos do cliente de 04/11/2026 — design

Fonte: mensagem do cliente (lista + print do Dashboard). Regra desta spec: **fazer exatamente o que
foi pedido**, sem extras. As dúvidas (perfil do ponto, sigla, ação rápida e quem vê R$ no
Dashboard) foram respondidas pelo cliente em 04/11/2026. Regras de segurança do `CLAUDE.md`
continuam valendo.

## Pedido original (resumo fiel)

1. Editar o pipeline: Heads editam as colunas, nomes etc.
2. Botão de novo lead no pipeline.
3. Leads: exportar por período, filtro ou total.
4. Relatórios: exportar por período, filtro ou total.
5. Dashboard dos Heads: filtrar por SDR.
6. Dashboard: tirar vendido, recebido e faturamento. Mostrar só comparecimento na reunião.
   - Vendido → **Reuniões realizadas**
   - Recebido → **No-show / Remarcados**
   - Faturamento → **Valor a receber por reunião realizada** = soma por lead: P0 R$ 9, P1 R$ 7,
     P2 R$ 5, só se o lead participou. No-show ou remarcado não soma.
7. Hoje: contato de hoje que passou do horário vai sozinho para Atrasados.
8. Hoje: botão de ação rápida com as opções Chamado, Remarcado, Próxima ação.
9. Google Agenda: título `Reunião <nome do lead> (<P>) <sigla do SDR>`, ex.
   `Reunião Lead (P0) IG`; descrição = handoff do lead.

## 1. Pipeline editável (Heads)

- Quem: liderança (`isLeader`: Head e Diretoria).
- Onde: na própria tela do Pipeline, modo "Editar colunas".
- Pode: **criar** coluna, **renomear**, **reordenar** e **excluir**.
- Limites técnicos (não são extras, evitam quebrar o sistema):
  - Coluna com lead não é excluída: pede para mover os leads antes (409 com mensagem).
  - Colunas que têm regra no sistema (Venda, No-Show, Sem Perfil e as de agendamento) podem ser
    renomeadas e reordenadas, mas não excluídas.
- Banco: `pipeline_stages.key` passa a aceitar nulo (coluna criada pelo Head não tem chave de
  sistema). Migration nova `0025_*`. Leitura por `key` continua igual para as colunas de sistema.
- Criar lead e mover lead passam a aceitar o `stageId` de qualquer coluna (hoje só `stageKey`).
- Auditoria: `admin.stage.create/update/move/delete` (já existe `admin.stage.update`).

## 2. Novo lead no pipeline

- Botão "+ Novo lead" no topo do Pipeline, mesmo formulário de `lead-form.tsx`.
- Mesma permissão de criar lead que já existe em Leads.

## 3. Exportar leads

- Botão "Exportar" em Leads com 3 opções: **Período** (data de criação do lead), **Filtro atual**
  (os filtros aplicados na tela) e **Total**.
- CSV por POST, auditado, fórmulas neutralizadas, recusa > 10 mil linhas.
- Quem: liderança (o arquivo leva contato, e a regra do projeto é "CSV com contato só liderança").

## 4. Exportar relatórios

- O CSV de Relatórios já exporta por período. Passa a ter as mesmas 3 opções: **Período**,
  **Filtro atual** (SDR, closer, produto etc. aplicados) e **Total** (sem limite de data).
- Mesmas regras de hoje (liderança, auditoria, 10 mil linhas).

## 5. Dashboard: filtro por SDR (Heads)

- Seletor de SDR no topo do Dashboard da liderança; usa o `sdrId` que a busca de relatórios já
  aceita. "Todos" é o padrão.

## 6. Dashboard de comparecimento

- Quem vê o quê (cliente escolheu a "opção B" em 04/11/2026):
  | Papel | Dashboard |
  |---|---|
  | SDR | **Só** os 3 cards de comparecimento abaixo; nenhum valor de venda |
  | Closer | Igual a hoje (vendido, recebido, faturamento) |
  | Head / Diretoria | Igual a hoje **+** os 3 cards de comparecimento da equipe, com filtro por SDR |
- Cards do SDR (substituem os de venda):
  | Antes | Depois | Conta |
  |---|---|---|
  | Vendido | Reuniões realizadas | reuniões com resultado **Realizada** no período |
  | Recebido | No-show / Remarcados | reuniões com resultado **No-show** ou **Remarcado** no período |
  | Faturamento (card + gráfico acumulado) | Valor a receber por reunião realizada | soma, por reunião realizada, do valor do perfil do lead |
- Valor: P0 = R$ 9,00 · P1 = R$ 7,00 · P2 = R$ 5,00 (centavos inteiros, constante em `sh/`).
  - O perfil usado é o atual do lead (confirmado pelo cliente).
- "Remarcado" passa a ser um resultado de reunião, ao lado de Realizada e No-show
  (`MEETING_OUTCOMES` ganha `RESCHEDULED`; migration nova). Não soma valor.
- Mudar o resultado de Realizada para No-show ou Remarcado tira o valor (a conta é sempre em
  cima do resultado atual).
- SDR vê os próprios números (RLS já restringe); liderança vê todos ou o SDR filtrado.
- O bloqueio é no servidor: a busca de relatórios (`/reports/search`, que alimenta Dashboard e
  Relatórios) e o resumo de WhatsApp não devolvem valores de venda para SDR. Consequência: o SDR
  também deixa de ver R$ na aba Relatórios, que hoje ele acessa.
- Closer, Head e Diretoria continuam com os valores de venda em Relatórios como hoje.

## 7. Hoje: atrasados automáticos

- Atrasado passa a ser `próximo contato < agora` (hoje é `< início do dia`).
- A lista atualiza sozinha: a tela recalcula a cada minuto, sem precisar recarregar.

## 8. Hoje: ação rápida

- Botão de ação rápida em cada contato do Hoje (Contatos de hoje e Atrasados), com 3 opções:
  - **Chamado**: registra na timeline que o lead foi chamado e tira o próximo contato (sai da
    lista).
  - **Remarcado**: escolhe nova data e hora do próximo contato.
  - **Próxima ação**: escreve a próxima ação e a data (vira tarefa do lead).
  - (As 3 confirmadas pelo cliente em 04/11/2026.)
- Tudo com `version` e `recordActivity` na mesma transação.

## 9. Google Agenda

- Título: `Reunião <nome do lead> (<P0|P1|P2>) <sigla>`.
- Sigla (confirmada pelo cliente): as 2 primeiras letras do nome do SDR que criou a reunião
  (`meetings.created_by`), em maiúsculas (Igor → IG).
- Descrição: o texto do handoff (o mesmo do botão de handoff) + link da ficha.
- ⚠️ Privacidade: nome do lead e resumo vão na URL do Google Agenda. Telefone e Instagram
  continuam fora (o handoff já não os inclui). Aceito por ser o pedido do cliente.

## Ordem de entrega (um PR por bloco, base `release/v0.2`)

1. Rápidos: 2 (novo lead), 5 (filtro SDR), 7 (atrasados), 9 (Google Agenda)
2. 6 (Dashboard de comparecimento)
3. 3 e 4 (exportações)
4. 8 (ação rápida)
5. 1 (pipeline editável)

## Testes

- API (vitest e2e): valor por perfil e por resultado; remarcado não soma; filtro SDR; atrasado
  por horário; ação rápida (as 3); CSV de leads (3 modos, só liderança, 10 mil); CRUD de coluna
  (exclusão recusada com lead e em coluna de sistema); título e descrição da agenda.
- Web (Playwright): Dashboard do SDR sem R$, do Closer igual, do Head com os dois; botão Novo lead no pipeline; editar colunas como Head.
- Capturas 375/768/1024/1440 de Dashboard, Hoje e Pipeline.
