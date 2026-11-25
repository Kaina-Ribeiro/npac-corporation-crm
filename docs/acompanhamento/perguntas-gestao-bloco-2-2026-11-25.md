# Gestão, bloco 2 (Renovações e gestão, NPAC-79): perguntas à Eduarda, 25/11/2026

Ordem da gestão (spec do bloco 1): 1 Envios físicos + venda vira mentorado ✅ (NPAC-56, em produção) → **2 Renovações e
painel de gestão** → 3 Eventos e agenda → 4 Linha do tempo e conquistas + painel do Leo. A área do mentorado fica por
último.

⭐ = sugestão nossa. Pergunta sem ⭐ = não temos como saber; só ela responde.

**Respostas da Eduarda:** ⏳ aguardando.

## Já respondido (não perguntar)

Pelo PDF de 07/11:
- Aba 11 = "visão da liderança": mentorados que chegam ao 12º mês nos próximos 60 dias, status da conversa de renovação
  e indicadores gerais.
- A conversa é a reunião "Linha do tempo e renovação", no 12º mês depois do último PME, com a Duda; termina com "reunião
  registrada, resultado da renovação". "Interesse em renovar" só existe nessa reunião e é interno.
- Status da inscrição: em onboarding, ativo, pausado, cancelado, concluído, renovado. O Acompanhamento edita renovações.

Pelo que o sistema já tem (`release/v0.26`, conferido no código em 25/11):
- **A ação do 12º mês já existe** no plano do RDV (0050): "Celebração e renovação", reunião do tipo RENOVACAO,
  checklist "Reunião registrada" e "Resultado da renovação", gatilho fim do PME. Na Fila ela aparece em "Plano" como
  "Ação do plano: Celebração e renovação. Prevista para…" quando o 12º PME fecha, ou no 25º dia do 12º mês se o 12º PME
  não foi registrado (`mentoria_acao_data`, 0070); a reunião de Renovação realizada a conclui sozinha.
- O registro da reunião de Renovação já tem "Quer renovar?" (sim/não, `interesse_renovar`).
- "Concluído" e "Renovado" já existem e são trocados à mão na ficha (design v2, §6: "mudar o status para
  CONCLUIDO/RENOVADO é manual"). A ficha mostra "jornada concluída" depois do 12º mês.
- RDV, 2M e 6M duram 12 meses no sistema: término = início + 12 meses, editável, empurrado pelas pausas
  (`inscricoes.service.ts`, 0051). 6M tem reunião mensal do 1º ao 12º mês; 2M, trimestral nos meses 1, 4, 7, 10 e 13;
  pulseiras da 2M e da 6M nos meses 1, 7 e 13, e as de 19, 25, 37 e 61 "nascem com a renovação" (0050, D17).
- **Não há produto de renovação no comercial**: os produtos que viram mentorado são só Mentoria RDV, 2M e 6M (0077).
- **Hoje, uma venda de RDV, 2M ou 6M de quem já é mentorado abre outra ficha, com o onboarding inteiro** (Caixa, IDR;
  bloco 1, M3), e a Fila "Nova inscrição" mostra "Já tem inscrição: RDV, Ativo".
- Indicadores prontos: Dashboard (engajamento e funil do onboarding, NPAC-75), Reuniões > Controle mensal (quem fez a
  reunião do mês, quem falta, comparecimento), Agenda da semana, "Sem reunião há mais de 30 dias" e PMEs e ciclos.

## Assumido sem perguntar (vai na spec; ela corrige se quiser)

- Lista: quem **começa o 12º mês nos próximos 60 dias** (texto do PDF) **e** quem já passou do começo do 12º mês e ainda
  não está "Renovado", "Concluído" ou "Cancelado". O mês conta como no resto do sistema (descontando pausas).
- Quem terminou e não renovou: a Duda marca "Concluído" na ficha, como já é hoje; enquanto não marca, a pessoa continua
  na lista.

## Notas para a spec (não vão para a Duda)

- O design v2 (§11, Fase 4) previa `renovacoes` mudando o `termino_previsto` da mesma inscrição; o bloco 1 (M3) cria
  inscrição nova a cada venda. As perguntas 2 a 4 decidem qual dos dois vale.
- Se a renovação abrir ficha nova e a antiga ficar RENOVADO, o Total do Dashboard (NPAC-75, `FORA_DO_TOTAL` =
  CANCELADO e CONCLUIDO) conta a pessoa duas vezes: RENOVADO precisa sair do Total, ou a regra muda.
- Ciclos de PME vão de 1 a 12 por inscrição; renovação na mesma ficha exigiria PME 13 em diante.
- A % de renovação só tem base a partir do que for registrado no sistema (a importação não trouxe renovações:
  `STATUS_IMPORTACAO` = ATIVO, CANCELADO, CONCLUIDO).

## Mensagem (pronta para o WhatsApp)

```
Oi Duda! Tudo bem? 😊

Agora vamos fazer a aba *Renovações*: a lista de quem chega ao 12º mês nos próximos 60 dias e em que pé está a conversa de renovação de cada um, como está no seu PDF.

Vou aproveitar o que já funciona: a ação "Celebração e renovação" que aparece na Fila do dia no fim do 12º mês, o campo "Quer renovar?" da reunião de Renovação e os status "Concluído" e "Renovado" da ficha.

Para montar o resto, preciso de 8 respostas. É só responder com número e letra, tipo "1A, 2B…". Onde tem ⭐ é a nossa sugestão.

*1. Quem entra na lista de renovação?*
A) RDV, 2M e 6M (no sistema hoje as três duram 12 meses) ⭐
B) Só o RDV
C) A 2M ou a 6M dura outro tempo (me fala quanto)

*2. Quando alguém renova, ele renova para:*
A) A mesma mentoria (RDV renova para RDV)
B) Outra mentoria (por exemplo, do RDV para a 2M ou a 6M)
C) As duas coisas acontecem

*3. A renovação passa pelo comercial, com o closer registrando a venda no CRM?*
A) Sim, sempre
B) Não, é combinada direto com você
C) Às vezes sim, às vezes não

*4. Depois que a pessoa renova, como fica no sistema?*
(Hoje, se o closer registrar uma venda para quem já é mentorado, abre uma ficha nova com o onboarding inteiro, com Caixa e IDR de novo.)
A) Abre uma ficha nova para os próximos 12 meses, já como "Ativo", sem Caixa e sem IDR. A ficha antiga fica "Renovado", com todo o histórico, e as duas ficam ligadas ⭐
B) Continua na mesma ficha, com mais 12 meses (do 13º ao 24º mês)
C) Ficha nova com o onboarding inteiro, como acontece hoje

*5. Em que pé está a conversa de renovação? O sistema mostra sozinho, pelo que a equipe já registra:*
A) Sem reunião → Reunião marcada → Quer renovar / Não quer renovar → Renovou ⭐
B) Prefiro escolher à mão numa lista na ficha (me fala as opções)

*6. Aviso na Fila do dia:*
A) Só a ação "Celebração e renovação" que já existe. A lista dos 60 dias fica na aba ⭐
B) Também um aviso na Fila da responsável quando faltarem 60 dias
C) Outro prazo (me fala)

*7. Quem vê a aba Renovações?*
A) Você (Admin) e o Acompanhamento; quem vê só a carteira vê só os mentorados dela ⭐
B) Só você (Admin)
C) Também a Operação

*8. Números no topo da aba:*
A) Quantos chegam nos próximos 60 dias, quantos já tiveram a reunião, quantos renovaram, quantos não renovaram e a % de renovação ⭐ (os outros números já estão no Dashboard e em Reuniões > Controle mensal)
B) Esses e também cancelamentos e pausas do mês
C) Outros (me fala quais)
```
