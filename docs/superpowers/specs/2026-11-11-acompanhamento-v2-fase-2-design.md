# Acompanhamento v2 — Fase 2, cobrança (design)

> Status: **v1, 11/11/2026** · ticket NPAC-43 · plano: `docs/superpowers/plans/2026-11-11-acompanhamento-v2-fase-2.md`
> Fonte: PDF da Eduarda (`docs/acompanhamento/especificacao-eduarda-2026-11-07.txt`, páginas 5, 6, 10, 15–19),
> respostas da Eduarda de 11/11 e o design da Fase 1 (`docs/superpowers/plans/2026-11-10-acompanhamento-v2-design.md`),
> que continua valendo em tudo o que este documento não muda. Spec > este documento > gosto.
> Gabriel, 11/11: "implementa o que dá sem a Eduarda". Os 3 pontos em aberto ficam isolados (§9).

## 0. Decisões (não revisitar)

| # | Decisão | Quem / quando |
|---|---|---|
| E1 | **A Eduarda cadastra os PMEs** no sistema: Configurações > PMEs, só Admin. A migration traz só o que o PDF tem (atividades extras do 1º e do 2º PME e o ritual de encerramento do 1º) (1B) | Eduarda, 11/11 |
| E2 | **Cada PME dura 30 dias a partir do envio** (2A) | Eduarda, 11/11 |
| E3 | **O próximo PME só sai depois que o mentorado fecha o anterior** (3A). As ações do plano com gatilho FIM_PME esperam o fechamento real e deixam de usar o "dia 25" da Fase 1 | Eduarda, 11/11 |
| E4 | **A jornada termina nos 12 meses** (4B): o término não estica por atraso de PME; o que não coube fica como não concluído | Eduarda, 11/11 |
| E5 | **% do PME = duas medidas lado a lado** (5 "A e B"): tarefas feitas ÷ total do ciclo e progresso das metas. Não se juntam numa fórmula | Eduarda, 11/11 |
| E6 | **Check-in é mensagem manual e pessoal**, enviada pela equipe no WhatsApp (6, 6.3B). Sem BotConversa na Fase 2; sem perguntas fixas. A equipe lança no sistema o envio e a resposta | Eduarda, 11/11 |
| E7 | **2M e 6M têm PME, check-in e semáforo** como o RDV (6A) | Eduarda, 11/11 |
| E8 | **"Fiz" e comprovante são lançados pela equipe** até a área do mentorado (Fase 3). O campo de quem marcou já nasce pensando nela | Decorre de E6 |

## 1. Objetivo e sucesso

Fechar o ciclo semanal de cobrança do PDF (página 10) sem planilha: o que foi combinado vira tarefa
com prazo, a cobrança aparece na Fila do dia no prazo e o semáforo mostra quem está escapando.

Pronto quando:
- A Operação registra o envio de cada PME; o ciclo nasce com as atividades extras e a tarefa de
  encerramento; a tarefa de encerramento feita fecha o ciclo e libera o próximo PME.
- No registro da reunião, o responsável cobra as tarefas da reunião anterior, define metas e combina
  até 3 tarefas, cada uma com prazo.
- Cada tarefa vira uma cobrança na Fila do dia na data do prazo, e sai quando alguém marca o resultado.
- A equipe lança o check-in da semana (enviado, respondeu, resumo).
- Cada mentorado ativo tem semáforo (verde, amarelo, vermelho) com o motivo e o histórico semana a semana.
- A aba 7 "PMEs e ciclos" sai do "em breve"; Mentorados ganha PME atual, semáforo e % do PME.

## 2. Perfis (extensão da matriz da Fase 1, §3)

| Perfil | Fase 2 |
|---|---|
| Admin | Tudo, inclusive o catálogo de PMEs (PDF: "modelos de PME") |
| `ACOMPANHAMENTO` (Duda) | Ciclos, metas, tarefas, check-ins, cobranças, contatos dos degraus de atraso (PDF: "ficha, metas, reuniões") |
| `OPERACAO` | Vê tudo; registra o envio dos PMEs e corrige a data de envio (PDF: "envios de PME"); lança contatos |
| `ESPECIALISTA` (Manu) | Nas inscrições que já vê: só as tarefas e a cobrança das próprias reuniões (PDF: "registro das próprias reuniões") |
| `MENTOR` (Leo) | Nada, como na Fase 1. O "painel do Leo" com os casos em vermelho é da Fase 4 |

RLS como na Fase 1: SELECT por `mentoria_ve`, escrita com `WITH CHECK` pela matriz, sem DELETE para
`npac_app` (exclusão só por função `SECURITY DEFINER`).

## 3. Dados

Prefixo `mentoria_`, `version` para PATCH, `criado_por`, `criado_em`, `atualizado_em`,
`visivel_ao_mentorado` onde o PDF pede. Texto livre cifrado com AAD (`MentoriaCrypto`). Datas de
calendário em `date`, fuso de Brasília.

| Tabela | Campos |
|---|---|
| `pmes` | `numero` (0 = aquecimento, 1 a 12, **único**), `titulo` (opcional; a tela mostra "Nº PME" quando vazio), `foco`, `link_material` (pasta no Drive), `atividades_extras` (lista de textos), `encerramento` (texto da tarefa de encerramento; opcional), `ativo`. Não é cifrado: é catálogo, sem dado pessoal |
| `ciclos` | `inscricao_id`, `pme_id`, `numero` (cópia do número do PME, **único por inscrição**), `enviado_em` (date), `prazo` (= envio + 30 dias, E2; guardado), `concluido_em` (date, nulo até o encerramento), `nao_concluido_em` (date: quando um ciclo seguinte foi enviado sem este fechar), `anterior_ao_sistema` (bool, para a carteira importada). **Um ciclo aberto por inscrição** (índice parcial) |
| `tarefas` | `inscricao_id`, `origem` (REUNIAO, PME, EXTRA, ENCERRAMENTO), `reuniao_id`, `ciclo_id`, `meta_id`, `descricao` (cifrada), `prazo` (date; obrigatório em REUNIAO), `status` (PENDENTE, FEITA, PARCIAL, NAO_FEITA), `motivo` (cifrado, quando NAO_FEITA ou PARCIAL), `comprovante_midia_id` (mídia do módulo; FOTO, VIDEO ou PDF), `data_cobranca` (= prazo), `cobrada_em`/`cobrada_por` (quando a equipe registrou o resultado), `marcada_por_mentorado_em` (Fase 3; nulo na Fase 2), `visivel_ao_mentorado` (padrão sim) |
| `metas` | `inscricao_id`, `ciclo_id` (opcional), `reuniao_id` (onde nasceu, opcional), `pessoa_id` (nulo = do casal ou do individual; preenchido = de uma pessoa do casal), `pilar` (FE, SAUDE, DINHEIRO, RELACIONAMENTOS; opcional), `descricao` (cifrada), `valor_alvo`, `valor_atual` (numéricos, opcionais), `unidade` (texto curto), `prazo`, `status` (EM_ANDAMENTO, ATINGIDA, NAO_ATINGIDA), `visivel_ao_mentorado` (padrão sim) |
| `checkins` | `inscricao_id`, `semana` (segunda-feira da semana, Brasília; **único por inscrição**), `enviado_em`, `respondido_em` (timestamptz), `respondeu` (bool), `avanco`, `travou`, `proximo_passo` (cifrados, opcionais: o resumo da resposta nos campos do PDF) |
| `semaforo_historico` | `inscricao_id`, `semana` (segunda-feira), `cor` (VERDE, AMARELO, VERMELHO), `motivos` (lista de códigos, §5), **único por inscrição e semana** |

Regras de dados:
- **Ciclo derivado, não editado à mão:**
  `CONCLUIDO` se `concluido_em`; senão `NAO_CONCLUIDO` se `nao_concluido_em`; senão pelo atraso
  (hoje − `prazo`): até 9 dias `EM_ANDAMENTO`, de 10 a 16 `SEGUNDA_CHANCE` (7 dias), 17 ou mais `NAO_CONCLUIDO`.
  Uma implementação só, em SQL (`mentoria_ciclo_status`).
- **Encerramento:** a tarefa ENCERRAMENTO marcada FEITA grava `concluido_em` na mesma transação;
  desfazer (voltar para PENDENTE) limpa. Ciclo sem tarefa de encerramento (anterior ao sistema) fecha à mão.
- **Envio do PME** (Admin, ACOMPANHAMENTO, OPERACAO): cria o ciclo do número seguinte, com uma tarefa
  EXTRA por atividade extra do catálogo e uma ENCERRAMENTO, todas com prazo = prazo do ciclo. Se houver
  ciclo aberto não concluído, ele ganha `nao_concluido_em` (o envio é decisão da equipe, §9 P3).
  O envio do 1º PME preenche também `pme1_enviado_em` (o item ENVIAR_PME1 da Fase 1 continua igual).
  Sem PME ativo no catálogo com aquele número: 400 "Cadastre o Nº PME em Configurações".
  Inscrição fora de ATIVO ou depois do término (E4): 400.
- **Carteira importada:** o ciclo atual pode ser registrado com número e data de envio escolhidos
  (`anterior_ao_sistema` = sim, sem tarefas automáticas). Números só crescem.
- **Até 3 tarefas por reunião** (origem REUNIAO, mesmo `reuniao_id`): 400 na API e gatilho no banco.
- **% do PME (E5)**, calculado em SQL para a lista e a ficha:
  - tarefas = FEITA ÷ total das tarefas do ciclo (PARCIAL não conta como feita; o PDF diz "feitas");
  - metas = média, nas metas do ciclo, de `min(valor_atual ÷ valor_alvo, 1)` quando há alvo numérico, e
    de ATINGIDA = 100 % / demais = 0 % quando não há. Sem metas no ciclo: "sem metas".
- Histórico (nomes de campos, nunca valores) em toda escrita, na mesma transação. LGPD: anonimizar apaga
  os textos cifrados das tabelas novas e enfileira os comprovantes; excluir a inscrição apaga tudo.

## 4. Ciclo semanal de cobrança (PDF, página 10)

1. **Na reunião**, o registro ganha três blocos: "Cobrança da reunião anterior" (as tarefas pendentes
   da última reunião realizada, cada uma FEITA, PARCIAL ou NAO_FEITA, com motivo opcional), "Metas
   definidas ou ajustadas" (criar e editar metas) e "Tarefas da semana" (até 3, cada uma com prazo e,
   opcionalmente, a meta). As tarefas da reunião entram no ciclo aberto, se houver. Os campos de texto da
   Fase 1 ("combinado", "o que cobrar") continuam para o que não virou tarefa.
2. **Cobrança**: cada tarefa PENDENTE com `data_cobranca` hoje ou antes vira item COBRANCA na Fila (§6).
3. **"Fiz" e comprovante**: a equipe marca (E8) e anexa o comprovante (mídia do módulo).
4. **Na data**, o item da Fila mostra o status atual da tarefa.
5. **A reunião seguinte** começa pelo bloco do passo 1.
6. **Duas tarefas seguidas não feitas** mudam o semáforo (§5) e geram alerta.

## 5. Semáforo

Só inscrições ATIVO. Calculado em SQL (`mentoria_semaforo(inscricao_id, dia)`), devolvendo cor e motivos:

| Cor | Motivo (código) | Regra |
|---|---|---|
| Amarelo | `CHECKIN_1` | O check-in da última semana encerrada foi enviado e não teve resposta |
| Amarelo | `TAREFA_1` | A última tarefa cobrada (por `data_cobranca`) está NAO_FEITA |
| Amarelo | `PME_7` | O ciclo aberto tem 7 ou mais dias de atraso (PDF, página 19) |
| Vermelho | `CHECKIN_2` | As 2 últimas semanas encerradas tiveram check-in enviado e sem resposta |
| Vermelho | `TAREFA_2` | As 2 últimas tarefas cobradas estão NAO_FEITA |
| Vermelho | `PME_15` | O ciclo aberto tem 15 ou mais dias de atraso |

- A cor é a pior entre os motivos; sem motivo, verde.
- **Semana sem check-in enviado não conta** (S2): a falta é da equipe, não do mentorado, e a carteira
  importada não nasce toda em vermelho.
- **Histórico semana a semana** (`semaforo_historico`): na virada da semana (segunda 00:00 de Brasília)
  grava a cor da semana que acabou. Usa o timer único do push (`avisos.scheduler.ts`) e, ao subir a API,
  completa as semanas que faltarem desde a última gravada (idempotente). A ficha mostra o histórico e a
  semana atual calculada na hora.
- **Sequência de semanas com check-in** (ficha, PDF página 8): semanas seguidas, até a última encerrada,
  com check-in respondido.

## 6. Fila do dia e avisos

Novos tipos, calculados na leitura em `mentoria_fila` como os da Fase 1 (só ONBOARDING e ATIVO):

| Tipo | Item | Fila de quem | Sai quando | Push |
|---|---|---|---|---|
| `COBRANCA` | Tarefa PENDENTE com `data_cobranca` ≤ hoje, mostrando o status | Responsável da inscrição (ou quem conduziu a reunião, se for Especialista) | Tarefa com resultado | Sim, 1x no dia |
| `SEMAFORO` | Mentorado em amarelo ou vermelho, com o motivo | Responsável da inscrição | Volta a verde, ou `fila_feitos` da semana | Só ao virar vermelho, 1x por semana |
| `ENVIAR_PME` | "Enviar o Nº PME": ciclo anterior CONCLUIDO, sem ciclo seguinte, número ≤ 12, antes do término (E3, E4) | Operação | Ciclo seguinte registrado | — |
| `PME_ATRASADO` | Degraus do PDF (página 19) no ciclo aberto: 3 dias "mensagem leve no grupo", 7 dias "áudio ou vídeo da Duda", 10 dias "segunda chance de 7 dias", 15 dias "ligação e reunião de destravamento" | Responsável da inscrição | Contato registrado para o degrau (o sistema grava como contato, PDF) ou ciclo fechado | Sim, 1x por degrau |

- **ACAO com gatilho FIM_PME (E3):** se existe o ciclo do número do mês e ele não está CONCLUIDO, a ação
  espera; a data passa a ser o `concluido_em` desse ciclo. Sem ciclo daquele número (ex.: carteira
  importada), continua a data da Fase 1. Mês 2: com 15 dias de atraso do 2º PME, a ação aparece mesmo sem
  fechar (PDF: "prazo máximo de 15 dias de atraso; depois disso, vira reunião de destravamento").
- Push sem dado pessoal, com o texto da Fase 1 ("Acompanhamento: novos itens na Fila do dia").
- O alerta "para o painel do Leo" e o padrinho acionado em "2 PMEs seguidos em atraso" ficam para a Fase 4.

## 7. Telas

- **Ficha > Jornada** ganha, depois do mês e antes das ações: card "PME atual" (número, título, envio,
  prazo, status, as duas barras de E5, botão do encerramento), semáforo atual com motivos e histórico,
  sequência de check-ins, e as seções Tarefas (por ciclo, com status, prazo, comprovante), Metas e
  Check-ins (lançar o da semana).
- **Registro da reunião**: os três blocos da §4.
- **Mentorados**: colunas PME atual, semáforo e % do PME (tarefas), filtro por semáforo (PDF, aba 2).
- **Aba 7 "PMEs e ciclos"** (sai do "em breve"): quem está em qual PME, data de envio, prazo, status,
  % concluído, atividades extras feitas, encerramento feito, próximo PME a enviar; filtros por PME e status.
- **Configurações > PMEs** (Admin): lista dos 13 números, editar título, foco, link, atividades extras e
  encerramento; ativar e desativar.
- Exportação CSV ganha PME atual, status do ciclo e semáforo (sem textos cifrados).

## 8. Testes e critério de pronto

- `@npac/db`: RLS por perfil nas tabelas novas (Manu só tarefas das próprias reuniões, Leo 404, Operação
  sem escrever metas, sem DELETE), unicidades (número do PME, ciclo por inscrição, check-in por semana),
  gatilho das 3 tarefas, um ciclo aberto, migrations.
- `@npac/api` (relógio `MENTORIA_CLOCK`, `PUSH_SENDER` falso): envio cria ciclo e tarefas; encerramento
  fecha e desfazer reabre; status do ciclo nos dias 9, 10, 16 e 17 de atraso; envio com ciclo aberto
  marca NAO_CONCLUIDO; 4ª tarefa da reunião dá 400; % de tarefas e de metas; semáforo em cada motivo e
  semana sem envio não contando; histórico idempotente ao subir duas vezes; Fila COBRANCA, SEMAFORO,
  ENVIAR_PME, PME_ATRASADO e a ação FIM_PME esperando o ciclo; pausado fora de tudo; Especialista só nas
  próprias reuniões; importação continua sem criar itens.
- `@npac/web`: Playwright por perfil no registro da reunião, na ficha, na aba 7 e em Configurações > PMEs;
  capturas 375/768/1024/1440; `acompanhamento-sem-comercial` verde.
- Suítes do CRM verdes. `CLAUDE.md` (mapa e regras) atualizado em cada parte.

## 9. Em aberto (Eduarda), isolado para não travar

| # | Pergunta | Hoje o sistema faz | Quando ela responder |
|---|---|---|---|
| P1 | Situação do pagamento: qual opção falta? | Mantém EM_DIA, EM_ATRASO, QUITADO e "Não informado" (Fase 1) | Migration acrescenta o valor ao CHECK + rótulo. Fora das partes da Fase 2 |
| P2 | Check-in sai sempre no mesmo dia? | A semana é de segunda a domingo; a equipe lança quando enviar. **Sem item "enviar check-in" na Fila** | Mesmo dia: item na Fila nesse dia para quem ainda não recebeu. Varia: campo "dia do check-in" na inscrição |
| P3 | PME não fechado nem na segunda chance: o próximo sai? | Segue E3: o item ENVIAR_PME só aparece depois do encerramento; a equipe pode registrar o envio a qualquer momento (o aberto vira NAO_CONCLUIDO) | Se "sai mesmo assim": ENVIAR_PME também aparece com o ciclo NAO_CONCLUIDO (uma condição em `mentoria_fila`) |

## 10. Suposições (validar com a Eduarda quando der)

- **S1** A segunda chance começa com **10 dias de atraso** e dura 7 (escada da página 19). A tabela de
  regras da página 17 diz "PME não fechado no prazo abre a segunda chance"; a escada é mais específica.
- **S2** Semana sem check-in enviado não conta para o semáforo.
- **S3** Status da meta: Em andamento, Atingida, Não atingida (o PDF só diz "status").
- **S4** Meta sem alvo numérico conta pelo status no % de metas.
- **S5** "Tarefa não feita" no semáforo é só NAO_FEITA registrada; PENDENTE vencida ainda não conta (vira
  cobrança na Fila).
- **S6** Os "10 maiores erros" do 1º PME continuam no campo da Fase 1 (`erros_pme1_concluidos_em`); a
  atividade extra do ciclo 1 é independente. Juntar os dois fica para a Fase 3, quando o mentorado vir as tarefas.
