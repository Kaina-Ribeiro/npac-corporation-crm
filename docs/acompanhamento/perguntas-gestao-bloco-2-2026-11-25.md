# Gestão, bloco 2 (Renovações e gestão, NPAC-79): perguntas à Eduarda, 25/11/2026

Ordem da gestão (spec do bloco 1): 1 Envios físicos + venda vira mentorado ✅ (NPAC-56, em produção) → **2 Renovações e
painel de gestão** → 3 Eventos e agenda → 4 Linha do tempo e conquistas + painel do Leo. A área do mentorado fica por
último.

⭐ = sugestão nossa.

**Respostas da Eduarda:** ⏳ aguardando.

## Já respondido (não perguntar)

Pelo PDF de 07/11 (aba 11, tabela das 12 ações, reuniões e banco):
- A aba 11 é a "visão da liderança": mentorados que chegam ao 12º mês nos próximos 60 dias, status da conversa de
  renovação e indicadores gerais.
- A conversa é a reunião "Linha do tempo e renovação", no 12º mês depois do último PME, conduzida pela Duda; termina com
  "reunião registrada, resultado da renovação". O campo "Interesse em renovar" só existe nessa reunião e é interno.
- Status da inscrição: em onboarding, ativo, pausado, cancelado, concluído, renovado.
- O Acompanhamento edita as renovações.

Pelo que o sistema já tem:
- A reunião do tipo "Renovação" com o campo "Quer renovar?" (sim/não) já existe no registro da reunião.
- O término previsto é o início da jornada + 12 meses para toda mentoria (`inscricoes.service.ts`).
- Os status "Concluído" e "Renovado" já existem e a Duda já pode trocá-los à mão na ficha.
- Indicadores que já estão prontos: Dashboard (engajamento e funil do onboarding, NPAC-75), Reuniões > Controle mensal
  (quem fez a reunião do mês, quem falta, comparecimento), Reuniões > Agenda da semana e "Sem reunião há mais de 30 dias",
  PMEs e ciclos (status e % de tarefas).
- Uma venda nova no comercial de quem já é mentorado cria outra inscrição (bloco 1, M3), e a Fila já mostra "Já tem
  inscrição: RDV, Ativo".

## Mensagem (pronta para o WhatsApp)

```
Oi Duda! Tudo bem? 😊

Os Envios físicos e a venda virando mentorado já estão no ar. Agora vem o *bloco 2 da gestão: Renovações*.

Já temos no sistema: a reunião de Renovação com "Quer renovar?", os status Concluído e Renovado, e os números do Dashboard e do Controle mensal. Faltam só as decisões abaixo.

É só responder com número e letra, tipo "1A, 2B…". Onde tem ⭐ é a nossa sugestão.

*1. A lista "chegando na renovação" mostra quem:*
A) Entra no 12º mês nos próximos 60 dias, em qualquer mentoria (hoje o sistema conta 12 meses para todas) ⭐
B) Só o RDV
C) A 2M e a 6M duram outro tempo (me fala quantos meses cada uma)

*2. Em que pé está a conversa de renovação de cada um (o sistema mostra sozinho pelo que a equipe já registra):*
A) Sem reunião → Reunião marcada → Quer renovar / Não quer → Renovou ⭐
B) Prefiro escolher à mão numa lista na ficha (me fala as opções)

*3. Quando a pessoa renova, a venda da renovação passa pelo comercial (closer registra)?*
A) Sim. Quando a venda entra, a mentoria antiga vira "Renovado" sozinha e a nova já nasce no Acompanhamento ⭐
B) Não, a renovação é combinada direto com você. Você marca "Renovado" e o sistema abre os próximos 12 meses
C) Depende (me explica)

*4. Quem chegou ao fim e não renovou:*
A) Você marca "Concluído" na ficha quando encerrar ⭐
B) Vira "Concluído" sozinho no dia do término, se não renovou

*5. Aviso na Fila do dia:*
A) "Conversa de renovação" entra na Fila da responsável quando faltam 60 dias, e sai quando a reunião de renovação é marcada ⭐
B) Sem aviso, só a lista na aba
C) Outro prazo (me fala)

*6. Quem vê a aba Renovações:*
A) Você (Admin) e quem é do Acompanhamento; quem tem "só a carteira" vê só os dela ⭐
B) Só você (Admin)
C) Também a Operação

*7. Números no topo da aba:*
A) Só da renovação: quantos chegam nos 60 dias, quantos já conversaram, quantos renovaram e a % de renovação dos últimos 12 meses ⭐ (os outros números já estão no Dashboard e no Controle mensal)
B) Esses e também cancelamentos e pausas do mês
C) Outros (me fala quais)
```
