# Pedidos do Igor (16/11/2026): avisos, barra do celular e venda do SDR (NPAC-48)

Origem: mensagens do Igor no WhatsApp em 16/11/2026 e respostas dele em 17/11 ("2A e 2B, 4A, 5B").
Decisões do Gabriel em 17/11: "se ele tá pedindo pra notificar, temos que notificar" e "deixa o forms para depois".

## Respostas do Igor (17/11/2026)

- **2A + 2B:** "cada um recebe os avisos que são do acesso dele, exemplo cada SDR recebe os avisos do lead que está
  em seu controle, apenas Igor e head SDR recebem avisos do formulário e garantir que chegue o aviso nos celulares
  de cada um". Leitura: quem recebe já é por acesso (sino de hoje); falta chegar no celular. Liderança não passa a
  receber os avisos dos leads da equipe (lacuna 2 descartada).
- **4A:** um produto por venda.
- **5B:** o CRM mostra a renda extra do SDR por produto. Valores: Nação 2500 → R$ 5,00 · Nação 3000 → R$ 10,00 ·
  Nação 3500 → R$ 20,00 · Mentoria RDV → R$ 70,00 · Mentoria 2M → R$ 90,00 · Mentoria 6M → R$ 120,00.
- Pergunta dele sobre o Forms ("com o e-mail? ou só abrir o link para público?"): ver Fase A.

## Respostas do Igor para o PR 3 (17/11/2026, "1A, 2A")

- **1A:** a renda extra do SDR conta **quando o SDR marca a venda** (C1), não quando o closer registra.
- **2A:** Nação Promocional, Nação Normal e Nação Cheio são **3 produtos** no catálogo, escolhidos pelo
  nome (sem campo de preço à parte).
- **Valores da renda extra** (por produto vendido): Nação 2500 → R$ 5 · Nação 3000 → R$ 10 ·
  Nação 3500 → R$ 20 · RDV → R$ 70 · 2M → R$ 90 · 6M → R$ 120.

## Diagnóstico do push no iPhone (17/11/2026)

- Produção (SQL só de leitura): 7 aparelhos com push, todos iPhone (`web.push.apple.com`), de 3 pessoas,
  num universo de pelo menos 9 contas ativas. Chaves VAPID formam par e não mudaram depois das inscrições.
- A Apple aceitou a credencial num teste com chaves novas e endereço falso (`BadWebPushToken`, não
  `BadJwtToken`). As 7 DMs do Igor desde 16/11 foram para quem tem push e nada chegou.
- Sobram duas hipóteses, que o log do B7 separa: (1) a saída de rede do servidor até a Apple
  (`push sem resposta: ETIMEDOUT…`) ou (2) o iPhone com a notificação desligada (`push enviado: 201
  web.push.apple.com` e nada no aparelho). Depois do deploy, ler o log do app `api` no Cubeship.

## O que já se sabe (17/11/2026)

- ✅ Produção (`npac/production/api`): chaves do push (VAPID) presentes.
- ❌ Produção e ITODEV: `FORMS_WEBHOOK_TOKEN`/`FORMS_OWNER_USERNAME` ausentes; o script do Forms aponta para a produção.
- ITODEV (SQL só de leitura): 1 aparelho com push, 0 mensagens de chat desde 15/11, 0 formulários. O teste de chat do
  Igor foi na produção.
- Causa provável do "não está notificando": ninguém ativou o push no aparelho, e nada na tela convidava (B6).

## Fase A: formulário (adiada pelo Gabriel em 17/11)

| # | Tarefa | Status |
|---|---|---|
| A1 | Produção: `FORMS_WEBHOOK_TOKEN` e `FORMS_OWNER_USERNAME` (usuário do Igor) no app `api`, redeploy | ⏸ |
| A2 | Igor adiciona o Gabriel como **editor** do Forms pelo e-mail (link público não serve: só deixa responder); instalar o Apps Script (`docs/integracao-forms/README.md`) | ⏸ |
| A3 | Teste com resposta acima de 5 mil → sino + push + "Formulários novos" | ⏸ |

## Fase B: avisos

| # | Tarefa | Status |
|---|---|---|
| B1 | Barra do celular: Dashboard, Hoje, Pipeline, **Chat** (selo de não lidas), Mais; Leads no Mais | ✅ PR 1 |
| B6 | Convite "Ative os avisos neste aparelho" no Dashboard, Hoje, Chat e Fila; "Agora não" = 7 dias | ✅ PR 1 |
| B2 | Todo aviso do sino também como push, para as mesmas pessoas (por acesso, como hoje): NOTIFY no INSERT + LISTEN na API (`push/sino-push.ts`), texto = a linha do sino | ✅ PR 2 |
| B3 | Lembrete de 15 min e 1 min também para o closer da reunião (é do acesso dele): "Reunião com X às HH:MM", sem o pedido de confirmação | ✅ PR 2 |
| B7 | Cada envio de push no log: código HTTP, host do serviço (ex.: `web.push.apple.com`) e `reason`, sem endpoint nem dados | ✅ PR 2 |
| B4 | Liderança recebe avisos da equipe | ❌ descartado (resposta 2 do Igor) |
| B5 | Formulário que não vira lead também avisa | ⏸ junto com a Fase A |

## Fase C: SDR marca a venda (4A, 5B)

| # | Tarefa | Status |
|---|---|---|
| C1 | Depois da reunião realizada, o SDR tem "Marcar venda": escolhe o produto, sem valor. O lead vai para Venda como "venda a registrar" (caminho do cadastro, NPAC-39/41) e o closer recebe o aviso (com push, via B2) | ✅ PR 3 |
| C2 | Renda extra do SDR por produto: valor por produto no catálogo (Admin), somado no painel do SDR. Conta quando o SDR marca a venda (1A) | ✅ PR 3 |

### Como ficou (PR 3, 17/11/2026)

- **Marcar venda** na ficha, na última reunião realizada: o SDR do lead (ou a liderança) escolhe só o produto
  do closer da reunião. `POST /leads/:id/sale-mark`; o lead vai para Venda a registrar, o closer da reunião vira
  o do lead e recebe `sale.pending` (sino e push). O closer registra a venda com o valor, como no cadastro.
- **Renda extra**: tabela `sdr_sale_marks` (migration 0066), valor do catálogo no dia da marcação
  (`products.sdr_bonus_cents`, Admin > Produtos > "Renda extra do SDR"). Sai no estorno, se o lead deixar a
  Venda ou for excluído. Dashboard: cada SDR vê a dele ("Renda extra por produto vendido"); a liderança vê a
  de todos ("Renda extra dos SDRs", uma linha por SDR, com o filtro de SDR). O closer não vê.
- O cadastro em Venda Fechada (o caminho que o SDR já tinha para marcar a venda) também conta a renda.
- Catálogo: a 0066 preenche pelo código do seed ou pelo nome (Promocional, Padrão/Normal, Completo/Cheio,
  RDV, 2M, 6M). Produto que não bater fica com R$ 0 e aparece no Admin.

### Perguntas do PR 3, respondidas em 17/11/2026

1. Closer registra produto diferente do que o SDR marcou → **a renda segue a marcação do SDR** (Igor, "1A").
2. Venda registrada direto pelo closer, sem o SDR marcar → **não gera renda extra** (Igor, "2B").
3. Quem vê → **cada SDR vê a sua; o Head vê a de todos** (Gabriel). Feito no Dashboard.
