# Venda Fechada no cadastro + dropdown do CRM — design (NPAC-39)

Status: **aprovada** (Gabriel, 05/11/2026). Nada implementado.

Fonte: print do seletor de Etapa no "Novo lead" + "Coloca a opção de venda fechada também, tem casos
que vamos subir um lead que já comprou" + "coloca a data que foi feita a venda, closer e produto,
normal" + "arruma esse dropdown horroroso". Respostas do Gabriel: data informada · pago + o que
falta · CSS no select nativo · "o SDR pode cadastrar o lead, pois quem vai cadastrar vai ser o SDR
que estava em contato e vai receber normalmente pela reunião" · "perguntar a data da reunião
normalmente, e ao final ter a opção de registrar a venda" · sem a venda, o lead fica como **venda a
registrar**.

## 1. Venda Fechada no cadastro

- **Onde:** só no cadastro (`lead-form.tsx`), pelo componente de campos por etapa
  (`stage-fields.tsx`, NPAC-38). Na ficha continua "Registrar venda" (`sale-flow.tsx`).
- **Quem cadastra:** todos que cadastram lead (SDR, closer, liderança). A opção "Venda Fechada" deixa
  de ficar desabilitada no cadastro (no PATCH e na ficha segue a regra de hoje).
- **Reunião (sempre):** "Data e hora da reunião" (Brasília, já aconteceu: até agora) + "Closer da
  reunião", como nos Agendados. A reunião é criada **já realizada** (`outcome = DONE`,
  `outcome_at` = horário da reunião), origem `DIRETO`. Assim o SDR dono do lead recebe o valor por
  reunião realizada (P0/P1/P2 pela faixa) no dia da reunião.
- **Ao final, "Registrar a venda agora"** (só para quem tem `sale:register`: closer e liderança; o SDR
  não vê, e continua sem ver valores de venda). Campos do registro normal:
  - **Data da venda** (até hoje, nunca futura) → `deals.closed_at`: conta nos relatórios no dia em que
    aconteceu, não no dia do cadastro.
  - **Produto** (valor começa com o preço do produto, editável), **forma de pagamento**, **valor
    total**, **quanto já foi pago** (entra como pagamento recebido na data da venda) e as **parcelas
    que faltam** (futuras). Já pago + parcelas = total. Closer da venda = closer da reunião.
- **Sem registrar a venda** (SDR, ou closer que deixou para depois): o lead entra em `VENDA` como
  **venda a registrar** (lead em Venda sem venda ativa). Na ficha e no card do Pipeline aparece o selo
  "Venda a registrar" com o botão "Registrar venda" (closer/liderança). O closer da reunião recebe um
  aviso (`notifications`, só IDs) para registrar.
- **Registrar depois** pelo fluxo normal da ficha: o lead continua em `VENDA`. Estorno dessa venda
  devolve o lead para `EM_FOLLOW` (não há etapa anterior real); registre no relatório se escolher outra.
- **Regra nova:** "Etapa VENDA = venda ativa **ou venda a registrar**". Só o cadastro cria venda a
  registrar; PATCH continua recusando entrar em Venda (409 `SALE_REQUIRED`). Lead a registrar pode sair
  de Venda pelo PATCH (não tem venda ativa). Métricas de venda contam por `deals`: nada muda nelas.
- **Uma transação só:** lead + reunião realizada + (se marcada) venda, parcelas e pagamento. Falhou,
  nada fica gravado. Idempotência do registro (`requestKey` + hash) e timeline com nomes de campos
  (`lead.created`, `meeting.scheduled` + resultado, evento da venda). `rearm()` depois do commit.
- **Servidor recusa:** Venda no cadastro sem a reunião (409 `MEETING_REQUIRED`), reunião no futuro
  (400 "A reunião ainda não aconteceu"), data da venda futura (400), soma diferente do total (400),
  dados de venda enviados por SDR (403).

## 2. Dropdown com o visual do CRM

- Todos os `<select>` do app usam o visual do CRM pelo CSS do select nativo personalizável
  (`appearance: base-select` + `::picker(select)`) em `web/app/globals.css`: lista arredondada, mesma
  fonte, cores e tokens do tema claro/escuro, opção marcada com check, opção desabilitada esmaecida.
- Zero JS a mais (`/leads` está perto do limite de 150 KB gzip). Navegador sem suporte (Safari,
  iPhone) mantém o seletor do sistema, que lá já é bom.
- Nada muda no comportamento: teclado, leitor de tela e formulário continuam os do select nativo.

## Testes

- API (RED antes): SDR cadastra em Venda → lead + reunião realizada (valor por reunião do SDR no
  dia da reunião) + venda a registrar + aviso ao closer; closer cadastra com venda → lead + reunião +
  venda + parcelas + pagamento numa transação; reunião ou venda no futuro e soma errada → 400; SDR
  mandando dados de venda → 403; venda com data passada entra no relatório daquele dia, não no de
  hoje; registrar depois mantém em Venda; estorno volta para `EM_FOLLOW`; idempotência.
- Playwright: SDR cadastra lead em Venda Fechada (sem campos de venda) e a ficha mostra "Venda a
  registrar"; closer cadastra com a venda e a ficha mostra a venda.
- Prints 375/768/1024/1440 do dropdown aberto (Chrome) nos temas claro e escuro.
