# Avisos do chat e lembretes de reunião — design

Fonte: pedido do cliente (Igor) de 04/11/2026, decisões do Gabriel no mesmo dia. Regras de
segurança do `CLAUDE.md` continuam valendo (nada de conteúdo pessoal em URL, log, push ou SSE).

## Pedido original (resumo fiel)

1. Chat: um sinal de que chegou mensagem.
2. Lembretes do dia: antes da reunião, avisar que precisa mandar mensagem de confirmação ao lead.
3. As duas coisas com **os três níveis juntos**: na tela, na aba do navegador e alerta fora do CRM.
4. Recebe **só o SDR dono do lead**.
5. Três lembretes por reunião: **1 h, 15 min e 1 min antes**.
6. Botão **"Confirmação enviada"** em cada etapa (o cliente decidiu depois: só 1 h e 15 min).

## Decisões (04/11/2026)

| Tema | Decisão |
|---|---|
| Canal fora do CRM | **Push do navegador agora** (fase 1); **WhatsApp depois** (fase 2, spec própria) |
| Quem recebe os lembretes | **Dono do lead** (`leads.sdr_id`); lead transferido → lembretes seguem o novo dono |
| Etapa não confirmada | Fica registrada; **a liderança vê** na reunião quais etapas faltaram. Sem alerta extra |
| Reunião remarcada | Os 3 lembretes **recomeçam** para o novo horário; confirmações antigas ficam só no histórico |
| Push do canal Geral | **Todos** recebem (Igor, 04/11: "1B"); DM sempre avisa |
| Lembrete de 1 min | **Só aviso** "a reunião vai começar", sem botão (Igor, 04/11: "2B") |

## 1. Sinal de mensagem no chat

- **Selo no menu**: número de não lidas no item "Chat" da barra lateral e da barra inferior do
  celular (soma de `unread` dos canais do usuário; DM privada continua por RLS). Atualiza pelo SSE
  que já existe (`{ type: 'invalidate' }`), sem polling.
- **Título da aba**: `(N) NPAC CRM` quando há não lidas do chat + lembretes pendentes.
- **Push**: "Nova mensagem no Chat" ou "Nova mensagem de <nome do remetente>". **Nunca o texto
  da mensagem** (pode ter dado de lead). Abre `/chat`. Não manda push para o próprio autor nem
  para quem está com a conversa aberta.
- **Canal Geral**: toda mensagem manda push para a equipe inteira (menos o autor). DM: só o
  destinatário.

## 2. Lembretes de confirmação da reunião

- Para cada reunião não cancelada e sem resultado, três etapas: `H1` (60 min) e `M15` (15 min)
  pedem confirmação; `M1` (1 min) é **só aviso** ("Reunião com <lead> começa em 1 min"), sem
  botão e sem registro de confirmação.
- **Na tela**: no Hoje (card "Reuniões de hoje") e nos Avisos, a etapa vigente aparece como
  "Mande a confirmação para <lead> (16:23) · 1 h antes", com botão **Confirmação enviada**.
  Calculado na leitura, como os atrasados (sem agendador para a tela).
- **Push** no horário de cada etapa: "Reunião às 16:23: mande a confirmação para <nome do lead>"
  (1 h e 15 min) ou "Reunião com <nome do lead> começa em 1 min" (1 min).
  Só nome do lead e horário; nunca telefone nem Instagram (mesma regra do Google Agenda).
- **Botão Confirmação enviada**: grava a etapa (`meeting_confirmations`: meeting_id, step,
  scheduled_at da reunião naquele momento, user_id, created_at) + `recordActivity` na mesma
  transação (tipo `MEETING_CONFIRMED`, campo `step`, sem valores pessoais). Só o dono do lead
  confirma; idempotente por (meeting, step, scheduled_at).
- **Etapa vencida sem confirmação**: some do SDR quando a próxima começa; continua visível para
  a liderança na ficha/reunião como "1 h: não confirmada".
- **Remarcada**: confirmações valem para o `scheduled_at` em que foram feitas; novo horário =
  etapas novas. Cancelada ou com resultado = nenhum lembrete.

## 3. Push do navegador (técnico)

- Web Push padrão (VAPID) com service worker próprio (`/sw.js`) e lib leve só na API
  (`web-push`). Chaves `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` no env Zod e no Cubeship.
- Tabela `push_subscriptions` (user_id, endpoint, chaves p256dh/auth cifradas, user agent
  resumido, created_at), com RLS: cada um vê e apaga só as suas. Sair do CRM ou desativar usuário
  remove as inscrições.
- Ativação em `/conta`: botão "Ativar avisos neste aparelho" (pede a permissão do navegador).
  iPhone: só com o CRM adicionado à tela inicial (iOS 16.4+); a tela explica isso.
- **Push do chat**: por evento, na mesma requisição que grava a mensagem (depois do commit). Sem
  verificação periódica.
- **Disparo dos lembretes (decisão 04/11: "despertador", sem polling)**: a API mantém **um único
  timer** armado para o **próximo** lembrete pendente (menor `scheduled_at - etapa` ainda não
  enviado, de reuniões não canceladas e sem resultado). Ao disparar: envia as etapas vencidas,
  grava em `meeting_reminders_sent` (meeting_id, step, scheduled_at) e rearma para o seguinte.
  - **Rearma por evento**: criar, remarcar, cancelar ou registrar resultado de reunião, e
    transferir lead, rearmam o timer depois do commit.
  - **Ao iniciar a API** (deploy/reinício): lê do banco, envia o que venceu durante a parada
    (uma vez, marcado como enviado) e arma o próximo.
  - **Mais de uma instância**: o envio de cada etapa passa por `pg_try_advisory_xact_lock` +
    `insert … on conflict do nothing` em `meeting_reminders_sent`; só quem inseriu manda o push.
  - `setTimeout` tem limite de ~24,8 dias: lembrete mais distante arma um timer intermediário
    que só recalcula.
  - Horário exato; o único atraso é o do serviço de push (Google/Apple) até o aparelho.
- Endpoint que expirou (410) é apagado. Falha de push não quebra nada: a tela continua mostrando.

## 4. Fora desta fase

- WhatsApp (fase 2): API oficial da Meta, modelos aprovados, custo por mensagem, número de cada SDR.
- Configurar os horários (1 h / 15 min / 1 min são fixos).
- Lembretes para closer ou liderança.

## Pronto quando

- e2e: SDR recebe mensagem → selo no Chat e `(N)` no título sem recarregar; abrir a conversa zera.
- API: mensagem no Geral gera push para todos menos o autor; DM só para o destinatário.
- e2e (`page.clock`): reunião daqui a 61 min → aos 60 aparece a etapa 1 h; confirmar some com ela
  e grava timeline; aos 15 min a próxima; aos 1 min só o aviso, sem botão; remarcar recomeça.
- API: só o dono do lead vê/confirma (outro SDR → 404); liderança vê etapas não confirmadas;
  duas instâncias não duplicam push; payload do push sem telefone/Instagram/texto.
- API (relógio falso): timer armado para o próximo lembrete dispara no horário exato; remarcar
  rearma para o novo horário; cancelar desarma; reiniciar a API envia o que venceu parado, uma vez.
- Capturas 375/768/1440 do Hoje, Avisos e menu com selo.
