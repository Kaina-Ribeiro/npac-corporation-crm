# Venda Fechada no cadastro + dropdown do CRM — design (NPAC-39)

Status: **aprovada** (Gabriel, 05/11/2026). Nada implementado.

Fonte: print do seletor de Etapa no "Novo lead" + "Coloca a opção de venda fechada também, tem casos
que vamos subir um lead que já comprou" + "coloca a data que foi feita a venda, closer e produto,
normal" + "arruma esse dropdown horroroso". Respostas às dúvidas: data informada · pago + o que
falta · closer e liderança · CSS no select nativo.

## 1. Venda Fechada no cadastro

- **Onde:** só no cadastro (`lead-form.tsx`), pelo componente de campos por etapa
  (`stage-fields.tsx`, NPAC-38). Na ficha continua "Registrar venda" (`sale-flow.tsx`), como hoje.
- **Quem:** quem tem `sale:register` (closer e liderança). Para o SDR a opção segue desabilitada
  ("registre na ficha"), e ele continua sem ver valores de venda.
- **Campos** (os do registro de venda, "normal", mais a data):
  - **Data da venda** (Brasília, até hoje, nunca futura). Vai para `deals.closed_at`: a venda conta
    nos relatórios no dia em que aconteceu, não no dia do cadastro.
  - **Closer** (`canClose`, ativo) e **Produto** (valor começa com o preço do produto, editável).
  - **Forma de pagamento**, **valor total**, **quanto já foi pago** e as **parcelas que faltam**
    (futuras, se houver). Regra de sempre: já pago + parcelas = total.
- **O que já foi pago** entra como pagamento recebido na data da venda (não fica pendente nem vira
  cobrança no Hoje).
- **Uma transação só:** cria o lead, a venda (`deals`), as parcelas e os pagamentos e põe o lead em
  `VENDA`. Se algo falhar, nada fica gravado. Mesma idempotência do registro (`requestKey` + hash) e a
  mesma timeline (`lead.created` + o evento da venda, só com nomes de campos).
- **Servidor recusa:** `VENDA` no cadastro sem os dados da venda (409 `SALE_REQUIRED`, como hoje), data
  futura (400), soma diferente do total (400), SDR (404/403 como no registro de venda).
- A regra "Etapa VENDA = venda ativa" continua valendo: o lead só está em Venda com venda registrada.

## 2. Dropdown com o visual do CRM

- Todos os `<select>` do app usam o visual do CRM pelo CSS do select nativo personalizável
  (`appearance: base-select` + `::picker(select)`) em `web/app/globals.css`: lista arredondada, mesma
  fonte, cores e tokens do tema claro/escuro, opção marcada com check, opção desabilitada esmaecida.
- Zero JS a mais (`/leads` está perto do limite de 150 KB gzip). Navegador sem suporte (Safari,
  iPhone) mantém o seletor do sistema, que lá já é bom.
- Nada muda no comportamento: teclado, leitor de tela e formulário continuam os do select nativo.

## Testes

- API (RED antes): cadastro em Venda cria lead + venda + parcelas + pagamento numa transação; data
  futura e soma errada → 400; SDR recusado; venda com data passada aparece no relatório daquele dia
  e não no de hoje; idempotência pelo `requestKey`.
- Playwright: closer cadastra lead já em Venda Fechada e a ficha mostra a venda; SDR vê a opção
  desabilitada.
- Prints 375/768/1024/1440 do dropdown aberto (Chrome) nos temas claro e escuro.
