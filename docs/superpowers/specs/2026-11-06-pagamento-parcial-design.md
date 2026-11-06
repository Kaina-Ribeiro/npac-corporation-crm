# NPAC-41 — Pagamento parcial, produto vendido e botão do Instagram

Pedido do Igor (06/11/2026, WhatsApp), respostas "1A, 2A+2C, 3B".

## 1. Agendou Pagamento parcial (1A)

- Caixa "Já pagou uma entrada" nos campos do Agendou Pagamento (cadastro, ficha, janelinhas).
  Marcada: "Entrada já paga (R$)", e a data vira "Data combinada para o restante".
- `leads.payment_entry_cents` (0039): só com o valor combinado, `0 < entrada < valor` (CHECK +
  API 400 + formulário). Estado da etapa como os demais: sair da etapa ou registrar a venda apaga;
  na mesma etapa, `null` tira. Timeline: campo `payment`, nunca o valor.
- O lead **não vira venda**: nada em `deals`/`payments` e nada nos relatórios até o closer
  registrar. O registro da venda abre em Parcial com a entrada e uma parcela do restante na data
  combinada (se ainda futura).
- Ficha: "Restante combinado para: … · produto · valor · entrada de R$ X paga, faltam R$ Y".
- Closer grava a entrada junto da troca de etapa (gatilho `leads_guard_closer_fields`, 0039).

## 2. Produto vendido na Venda Fechada (2A + 2C)

- Cadastro em Venda Fechada: "Produto vendido" obrigatório, só os produtos do closer da reunião.
  Para o SDR, **só o nome** (sem R$); quem registra venda vê o preço. Com "Registrar a venda
  agora" o mesmo campo é o produto da venda.
- Sem a venda: `leads.sold_product_id` (0039). 409 `PRODUCT_REQUIRED` sem ele; 400 se não for
  ativo do closer da reunião. A ficha mostra "Produto: X" ao lado de "Venda a registrar", e o
  registro da venda abre com ele (o closer põe os valores). Apagado ao registrar a venda
  (o gatilho deixa o closer zerar o campo sem trocar a etapa) e ao sair da Venda pelo PATCH.
- 2C: no Agendou Pagamento o SDR continua vendo os preços (nada muda ali).

## 3. Botão do Instagram (3B)

- Ficha: botão "Instagram" ao lado do WhatsApp, abre `https://www.instagram.com/<usuario>/` em
  nova aba (perfil). O `@usuario` continua visível ao lado.
