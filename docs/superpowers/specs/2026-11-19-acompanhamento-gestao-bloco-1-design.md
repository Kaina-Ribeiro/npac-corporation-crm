# Spec: gestão do Acompanhamento, bloco 1 — venda vira mentorado e Envios físicos

NPAC-56 (número meu, o próximo livre). Status: **rascunho, 19/11/2026, aguardando aprovação do Gabriel**.
Código lido na `origin/release/v0.19` (última migration do acesso por área, NPAC-54).
Perguntas e respostas da Eduarda: `docs/acompanhamento/perguntas-gestao-bloco-1-2026-11-19.md`.

## Contexto e por quê

- A Eduarda quer focar na **gestão** antes da área do mentorado (Gabriel, 19/11: "tudo sem ser a área de mentorado").
  A gestão tem 4 blocos, nesta ordem (minha, o Gabriel não corrigiu): **1 Envios físicos + venda vira mentorado** →
  2 Renovações e painel de gestão → 3 Eventos e agenda → 4 Linha do tempo e conquistas + painel do Leo.
- Este bloco vem primeiro porque é o único pedido com urgência (áudio da Eduarda de 17/11): a venda fechada no comercial
  deve virar mentorado sozinha, avisar o Acompanhamento, e a **Maria** (envios) recebe as caixas a enviar. A Maria só
  ganha conta quando existir o cargo Envios, que nasce com esta tela (Eduarda 1B, spec do acesso por área, D6).
- Hoje a inscrição nasce por cadastro manual ou importação (D5 da Fase 1 era TODO). A Caixa é tratada só no Onboarding,
  por quem tem perfil Operação. Presente da família, kit e certificado existem como tipo na tabela, sem tela.

## Decisões

| # | Decisão | Origem |
|---|---|---|
| G1 | A regra "CRM intocado" (D2 da Fase 1) **acabou**: mexe no comercial quando o Acompanhamento precisar | Gabriel, 19/11 |
| G2 | A venda vira mentorado **quando o closer registra a venda com valor** (`insertSale`), não na marcação do SDR nem no pagamento | Eduarda 1A |
| G3 | Só **RDV, 2M e 6M** viram mentorado | Eduarda 2A |
| G4 | O mentorado novo entra **sem responsável**, como item "Nova inscrição" na Fila de quem é Admin do Acompanhamento, que escolhe a responsável | Eduarda 3A |
| G5 | **Estorno** no comercial cancela a inscrição sozinho e avisa a equipe | Eduarda 4A |
| G6 | **Situação do pagamento** (em dia, em atraso, quitado) vem sozinha das parcelas do comercial | Eduarda 5A |
| G7 | **Cargo Envios** (a Maria): vê só o que tem para enviar (nome e endereço) e marca enviado, com rastreio, e entregue | Eduarda 6A |
| G8 | A Caixa entra em "a enviar" **assim que o formulário com o endereço é marcado como preenchido** | Eduarda 7A |
| G9 | Ligação **junto da venda**: a inscrição é criada na mesma transação da venda; uma falha no lado do Acompanhamento faz a venda falhar com mensagem clara | Gabriel, 19/11 ("A: junto da venda") |
| G10 | Kit e certificado: **lançados à mão**, sem data automática, até a Eduarda explicar o que são (pergunta 8 sem resposta) | Eduarda, sem resposta |

### Decisões minhas (o Gabriel pode trocar)

| # | Decisão | Motivo | Se trocar |
|---|---|---|---|
| M1 | **Qual produto vira qual mentoria** fica numa coluna nova `products.mentoria` (`RDV`, `2M`, `6M` ou vazio), preenchida pela migration pelo código ou nome como a 0066 fez (`RDV`/"Mentoria RDV", `MENTORIA_2M`/"Mentoria 2M", `MENTORIA_6M`/"Mentoria 6M") e editável em Admin > Produtos ("Vira mentorado") | Cada closer tem o seu catálogo (`products.closer_id`); comparar nome a cada venda quebraria com produto novo ou renomeado | Fixo por código no código: produto novo de mentoria não vira mentorado até mexerem no código |
| M2 | **Só vendas registradas depois do deploy** viram mentorado. Nenhuma venda antiga é convertida | Os mentorados de antes já foram importados (Fase 1); converter o passado duplicaria | Uma conversão das vendas antigas sem inscrição, com a lista conferida pela Eduarda |
| M3 | **Pessoa que já é mentorada** (mesmo WhatsApp ou e-mail, pelo índice cego) **ganha outra inscrição** mesmo assim, e o item "Nova inscrição" mostra "Já tem inscrição: RDV, Ativo" com link | Comprar 2M depois do RDV é uma compra nova; quem decide se junta é a Duda | Juntar sozinho seria regra nova da Eduarda |
| M4 | O item "Caixa a enviar" da Fila (`ENVIAR_CAIXA`, hoje da Operação) **vai para o perfil Envios quando houver alguém ativo nele**; sem ninguém, continua na Operação. Operação, Acompanhamento e Admin continuam podendo marcar o envio | A Maria assume os envios sem deixar a Caixa sem dono antes de ela ter conta | Ficar sempre na Operação e a Maria só na aba |
| M5 | O **presente da família** entra em "a enviar" quando a foto da família foi recebida (`foto_familia_midia_id`); a Maria **vê a foto** desse presente (precisa dela para produzir), e só dele | O PDF pede foto até o mês 10 e envio no mês 11 | Entrar pela data da ação do mês 11 |
| M6 | A **entrada da Maria** é a aba Envios físicos, com "A enviar" no topo. Push às 8h de Brasília, 1x por dia, só se houver algo a enviar, sem nome ("Tem envio para hoje") | Ela não usa a Fila do dia; o padrão de push do módulo é sem dado pessoal | Ela ganhar uma Fila só com envios |
| M7 | O **aviso do estorno** é um item novo na Fila ("Venda estornada: inscrição cancelada"), da responsável ou, sem ela, de quem é Admin; sai com "Visto". Push 1x, sem nome | Usa o que o módulo já tem (Fila + push) em vez de um canal novo | Só o histórico da ficha |
| M8 | Inscrição **com venda** tem a situação do pagamento só para leitura; inscrição **sem venda** (importada ou cadastrada) continua editável à mão | A parcela do comercial é a fonte quando existe; as antigas não têm parcela | — |
| M9 | Número NPAC-56 para o bloco (o Acompanhamento usou NPAC-43 até a Fase 2) | Bloco novo, PRs próprios | Seguir em NPAC-43 |

## Objetivo e sucesso

Pronto quando:
1. O closer registra uma venda de RDV, 2M ou 6M e, no mesmo clique, a inscrição aparece no Acompanhamento em Onboarding,
   com nome, WhatsApp, e-mail, Instagram, mentoria, valor, forma de pagamento e data da compra; as 6 etapas do onboarding
   nascem como no cadastro manual.
2. A Duda vê "Nova inscrição" na Fila, escolhe a responsável e o item sai.
3. Estornar a venda deixa a inscrição Cancelada e põe "Venda estornada" na Fila; o envio pendente dela some do "A enviar".
4. A situação do pagamento da ficha muda sozinha quando o closer dá baixa numa parcela ou uma parcela vence sem baixa.
5. A Maria (cargo Envios) entra, cai na aba Envios físicos, vê as caixas e presentes a enviar com nome e endereço, marca
   enviado com rastreio e depois entregue; não abre ficha, Fila, Mentorados nem nada do comercial (404).
6. A Caixa marcada como entregue pela aba conclui a etapa Caixa do Onboarding, igual a hoje.

## Não-objetivos

- Área do mentorado (fica por último), Renovações, Eventos, Linha do tempo (blocos 2 a 4).
- Converter vendas antigas (M2). Juntar inscrições da mesma pessoa (M3).
- Regras de data para kit e certificado (G10). Etiqueta, frete ou integração com os Correios.
- Mudar o que o SDR, o closer ou a liderança veem no comercial: só a venda passa a criar a inscrição.

## Anti-objetivos (falha mesmo funcionando)

- Venda registrada sem inscrição, ou inscrição sem venda, por um erro no meio (G9 existe para isso).
- O closer ou o SDR passarem a ver qualquer dado do Acompanhamento, ou a Maria ver mais que nome, endereço e a foto do
  presente que vai enviar.
- Contato do lead aparecer em log, URL ou auditoria no caminho comercial → Acompanhamento.
- Um estorno apagar histórico do mentorado (ele só cancela; reuniões, ações e contatos ficam).

## Abordagens consideradas

| | Caminho | Ganha | Perde |
|---|---|---|---|
| **A (escolhida, G9)** | Junto da venda: `insertSale` cria a inscrição na mesma transação | Nunca fica venda sem mentorado; estorno no mesmo lugar | Erro do lado do Acompanhamento trava a venda até corrigir |
| B | Logo depois, em segundo plano (aviso do banco, como o push do sino) | A venda nunca trava | Recuperar o que falhou se a API cair, atraso de segundos, um "não criou" para alguém resolver |
| C (descartada) | Botão "virar mentorado" que a Duda confirma | Controle total | Contraria a 1A ("sozinha") |

Por que A pede a API e não um gatilho do banco: o telefone e o e-mail são cifrados com a chave do comercial no lead e com a
do Acompanhamento (`MENTORADO_ENCRYPTION_KEY`, com AAD) na pessoa. Só a API tem as duas.

## Desenho

### 1. Banco (uma migration)

- `products.mentoria text null`, `CHECK in ('RDV','2M','6M')`, preenchida como em M1. Admin > Produtos edita.
- `mentoria_inscricoes.deal_id uuid null references deals(id)`, **único** quando não nulo (uma inscrição por venda;
  a idempotência da venda pelo `requestKey` continua valendo).
- Função `SECURITY DEFINER` **`mentoria_inscricao_da_venda(deal_id, pessoa cifrada…)`**: confere que a venda existe, não
  está estornada, ainda não tem inscrição e é de produto com `mentoria` (M2 é garantida por só o `insertSale` chamar a
  função; quem usa o sistema não executa SQL); cria inscrição (`status ONBOARDING`, `tipo INDIVIDUAL`, sem responsável, `data_compra` = dia de
  Brasília do `closed_at`, `valor_centavos` = `total_cents`, `forma_pagamento` = rótulo do método), pessoa 1 e as etapas do
  onboarding pelo mesmo caminho do cadastro manual; grava histórico. O `npac_app` do closer não ganha INSERT nas tabelas do
  módulo: só EXECUTE nessa função.
- Gatilho no estorno (`deals.reversed_at` passa a ter valor): a inscrição ligada vai para `CANCELADO` (mesmo caminho do
  cancelamento de hoje, com histórico "venda estornada") e entra o item de aviso (M7).
- Situação do pagamento derivada (G6, M8): função `mentoria_status_financeiro(inscricao)` `SECURITY DEFINER`, lida na
  leitura (como `mentoria_fila`): sem `deal_id` → a coluna gravada; com `deal_id` → `QUITADO` se todas as parcelas pagas,
  `EM_ATRASO` se alguma sem baixa com vencimento antes de agora, senão `EM_DIA`. Devolve só o rótulo, nunca valor de parcela.
  PATCH da coluna recusado (400) para inscrição com venda.
- Perfil novo **`ENVIOS`** em `mentoria_perfis` e cargo `ENVIOS` ("Envios") no grupo Acompanhamento (`sh/cargos.ts`,
  `area_membros`), seguindo o acesso por área: Head do Acompanhamento convida e aprova; entra nos testes de cargo.
- RLS do perfil Envios: **nenhuma** leitura direta de inscrições, pessoas, ficha ou mídia. Duas funções
  `SECURITY DEFINER`: `mentoria_envios_a_enviar()` (envio, tipo, nome da pessoa 1 e 2, endereço e CEP decifrados na API,
  id da foto da família só para presente) e a escrita do envio (enviado com data e rastreio; entregue com data). Lista e
  escrita só de inscrição `ONBOARDING`/`ATIVO`/`PAUSADO`.
- Fila: tipos novos `NOVA_INSCRICAO` (G4; de quem é Admin; sai quando a inscrição ganha responsável) e
  `VENDA_ESTORNADA` (M7; sai com "Visto", em `mentoria_fila_feitos`). `ENVIAR_CAIXA` segue M4. A lógica de quem vê
  continua em `sh/mentoria/fila.ts` (`itemVisivel`); repetir na função SQL da Fila e no teste de equivalência
  (`db/test/fila-equivalencia.test.ts`), como pede o `CLAUDE.md`.
- Tabelas novas ou colunas vigiadas pelo canal ao vivo: nenhuma tabela nova; conferir se `mentoria_*` já avisa a tela.

### 2. API

- `insertSale` (`api/finance/finance.service.ts`): depois de gravar a venda e as parcelas, se o produto tem `mentoria`, lê
  nome, telefone, e-mail e Instagram do lead (decifra com a chave do comercial), cifra com `MentoriaCrypto` e chama a função
  do banco. Vale para os dois caminhos que já usam `insertSale`: `POST /finance/deals` e o cadastro em Venda Fechada.
  Erro vira `ConflictException('Não foi possível criar o mentorado no Acompanhamento. Tente de novo; se continuar, avise a liderança.')`
  e a transação inteira volta.
- Depois do commit: rearmar os avisos do módulo (`AvisosRearme`/scheduler) e mandar o push do item novo, como as escritas
  do `MentoriaController`.
- Estorno: o gatilho do banco faz a mudança; a API só rearma os avisos depois do commit.
- Controller novo `envios.controller.ts` no módulo (guarda do `MentoriaController`): `GET mentoria/envios` (Admin,
  Acompanhamento, Operação: todos; Envios: só a enviar), `POST mentoria/envios` (kit e certificado à mão, G10; não Envios),
  `PATCH mentoria/envios/:id` (enviado/entregue, com `version`). O envio da Caixa por aqui e pelo Onboarding usam **a mesma
  função de serviço** (hoje em `onboarding.service.ts`), para a Caixa entregue concluir a etapa (sucesso 6).
- Situação do pagamento: a ficha e Mentorados passam a ler pela função; `PATCH` recusa com venda (M8).
- Admin > Produtos: campo "Vira mentorado" (RDV, 2M, 6M ou "Não").
- Push diário da Maria (M6) no `avisos.scheduler.ts`, 8h de Brasília, sem nome.

### 3. Web

- **Aba Envios físicos** (`/acompanhamento/envios`, sai do "Em breve"; protótipo antes do código, regra do Gabriel):
  - Topo "A enviar": cards por envio com tipo, nome (ou os dois nomes no casal), endereço e CEP, foto (só presente), botão
    "Marcar enviado" (data, hoje por padrão, e rastreio) e depois "Marcar entregue".
  - Abaixo, "Em trânsito" e "Entregues" (últimos 30 dias), filtro por tipo; para Admin/Acompanhamento/Operação também
    "Novo envio" (kit ou certificado, escolhendo o mentorado) e link para a ficha.
  - Ação de um clique com `useOptimistic` + `showToast()`, como o resto do módulo.
- Menu do cargo Envios: só "Envios físicos" (e Mais com o cartão da conta). `/` manda o cargo para lá.
- Fila: textos dos itens novos ("Nova inscrição: <nome> · RDV" com o seletor de responsável no painel do item; "Venda
  estornada: inscrição de <nome> cancelada").
- Ficha: selo "Veio da venda de DD/MM" na inscrição; situação do pagamento sem edição quando vem da venda (M8).
- Admin > Produtos: coluna "Vira mentorado".

### 4. Partes (PRs)

1. **Venda vira mentorado**: migration (produto, `deal_id`, função, estorno, situação derivada), `insertSale`, Fila
   `NOVA_INSCRICAO` e `VENDA_ESTORNADA`, Admin > Produtos, ficha. Testes da API e do banco.
2. **Cargo Envios e aba Envios físicos**: perfil e cargo, RLS e funções, controller, tela, push da Maria, M4. Protótipo
   aprovado antes. e2e pelo caminho real (login da Maria → aba).

## Segurança e privacidade

- O closer executa só a função de criação; não lê nem escreve o módulo. Teste: closer não abre a inscrição que criou (404).
- Envios: teste por rota de que tudo fora de `mentoria/envios` e `mentoria/eu` é 404, e de que a lista não traz contato,
  dor, sonho, metas, reuniões nem valor.
- Contato decifrado só em memória na API; nada em log, auditoria ou histórico (histórico grava "criada pela venda", sem valor).
- Auditoria: criação pela venda e cancelamento pelo estorno, sem nome nem e-mail.
- LGPD: anonimizar a inscrição não mexe na venda; anonimizar o lead não é possível com venda ativa (regra de hoje).

## Testes (mínimo)

- API: venda de RDV cria inscrição completa; venda de produto sem `mentoria` não cria; venda repetida pelo mesmo
  `requestKey` não duplica; erro na criação faz a venda voltar (nada gravado); estorno cancela e cria o aviso; situação
  do pagamento muda com baixa e com parcela vencida; SDR e closer sem acesso ao módulo; Envios só vê a enviar.
- Banco: a função recusa venda estornada, venda inexistente e produto sem mentoria; RLS do Envios; equivalência da Fila.
- e2e: closer registra venda → login da duda → Fila mostra "Nova inscrição" → escolhe responsável; login da maria (seed
  novo, cargo Envios) → aba → marca enviado e entregue → etapa Caixa concluída na ficha.
- Seed: conta `maria` (Envios) em dev e itodev.

## Casos de borda (resolvidos)

- Venda a registrar (SDR marcou, closer registra depois): a inscrição nasce no registro do closer, que passa por `insertSale`.
- Lead só com Instagram: a pessoa nasce sem WhatsApp (a coluna aceita vazio).
- Estornou e registrou outra venda para o mesmo lead: a inscrição antiga fica Cancelada e nasce outra, ligada à venda nova.
- Casal: a venda é de uma pessoa; a segunda a equipe adiciona na ficha, como hoje. Na aba Envios aparecem os dois nomes.
- Quem tem o alcance "Só a carteira" não vê a inscrição nova até ela ganhar responsável (é o comportamento atual da carteira).

## Fica para quem construir

- O nome exato das funções.
- O layout dos cards (depois do protótipo aprovado) e os textos de botão que não estão aqui.
- Atualizar o `CLAUDE.md` (fim da regra do CRM intocado, venda → inscrição, cargo Envios) no PR da parte 1 e da parte 2.
