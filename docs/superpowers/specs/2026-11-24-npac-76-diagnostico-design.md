# NPAC-76 — Diagnóstico da Duda na aba Pessoas (design curto)

Pedido: `docs/pedidos/caixa.md` (NPAC-76). Desenho aprovado pelo Gabriel no canvas
https://claude.ai/artifact/MZge9s6ThvSAQMdioG5U2R (24/11/2026). Gabriel: "uma das partes mais importantes, com muita cautela".

## Por quê

A equipe do Acompanhamento preenche, para cada mentorado novo, a planilha "Diagnóstico" (aba MENTORADO, 20 perguntas). A Duda
quer preencher isso na ficha e aposentar a planilha. Os campos de hoje das abas Pessoa e Momento inicial que não estão na
planilha não são usados por ela.

## O que muda na tela

- A aba **Momento inicial some**. A aba **Pessoa/Pessoas** passa a ser, de cima para baixo:
  1. Rostos e nome (trocar foto como hoje). No casal, **uma aba só** (sem o seletor de pessoa).
  2. **Diagnóstico**: as 20 perguntas numeradas, na ordem da planilha (Nome, Cidade, Idade, Nome do parceiro(a), Filho 1,
     Filho 2, Trabalho, Renda atual, Dinheiro guardado, Bem 1, Bem 2, Investimento 1, Investimento 2, Custo médio mensal,
     Dívida 1, Dívida 2, Dívida 3, Sonhos e objetivos, Já buscou ajuda, Anotações e percepções), com "Concluir" e "Destravar"
     como o Momento inicial de hoje.
  3. **Contato e entrega**: WhatsApp, e-mail e pulseira de cada pessoa; endereço, CEP e foto da família.
- Somem da tela (o dado fica no banco, nada é apagado): Como prefere, Instagram, Nascimento, UF, Profissão, Ocupação, Filhos,
  Idades dos filhos, Tecnologia, Melhor horário, Canal preferido, Veio de; Data, Tem dívidas?, Principal dor, Meta de 12
  meses, Prova das 10 Habilidades e notas dos 4 pilares.
- Link antigo `?aba=momento` e filtro lembrado com a aba `momento` abrem a aba Pessoas.

## Onde cada resposta mora

| Pergunta | Onde | Trava ao concluir |
|---|---|---|
| Nome | `mentoria_pessoas.nome` (pessoa 1) | não (identidade, usado em todo o módulo) |
| Cidade | `mentoria_pessoas.cidade` (pessoa 1) | não |
| Nome do parceiro(a) | casal: `mentoria_pessoas.nome` (pessoa 2); individual: `momento.parceiro_nome` | casal não; individual sim |
| Idade, Filho 1/2, Trabalho, Bem 1/2, Investimento 1/2, Dívida 1/2/3 (texto), Já buscou ajuda, Anotações | colunas novas em `mentoria_momento_inicial`, texto cifrado com AAD | sim |
| Renda atual / Dinheiro guardado / Custo médio mensal | `recebe_centavos` / `guardado_centavos` / `custo_centavos` (já existem) | sim |
| Valor de cada dívida | `divida_1..3_centavos` (novas) | sim |
| Sonhos e objetivos | `sonho` (já existe) | sim |

- **Total das dívidas** (`dividas_centavos`, que a Evolução e o PDF já leem): gatilho no banco. Mudou o valor de alguma dívida
  → total = soma das preenchidas e `tem_dividas` = total > 0; as três vazias de novo → total e `tem_dividas` nulos. Sem mexer
  nos valores das dívidas, nada muda (a importação continua gravando o total direto).
- **Dados de hoje**: a migration copia `dividas_centavos` > 0 para `divida_1_centavos` onde as dívidas estão vazias, para o
  total antigo aparecer como Dívida 1 e a soma continuar certa. Nada é apagado.
- Quem edita: igual a hoje. Diagnóstico = área `MOMENTO` (Admin e Acompanhamento; "só a carteira" só a dela). Nome, cidade,
  parceiro do casal, contato e entrega = área `INSCRICAO` (Admin, Acompanhamento, Operação). Especialista e Operação leem.
- Exclusão e anonimização (LGPD) já apagam a linha inteira de `mentoria_momento_inicial`: as colunas novas vão junto.

## Evolução e PDF

Continuam lendo os mesmos números. Rótulos passam a ser os da planilha ("Renda atual", "Custo médio mensal", "Dívidas",
"Dinheiro guardado"); "Da aba Momento inicial" vira "Do diagnóstico" e o link leva à aba Pessoas. Tópicos antigos (dor, meta)
e notas dos pilares já gravados continuam aparecendo onde já apareciam.

## Abordagens consideradas

- **A (escolhida)**: colunas novas na tabela do Momento inicial, que já tem trava, versão, RLS, LGPD e é lida pela Evolução.
- B: tabela nova `mentoria_diagnostico`: duplicaria trava, RLS, LGPD e Evolução; mais risco sem ganho.
- C: um JSON com as 20 respostas: some a checagem por coluna e a Evolução teria de interpretar texto.

## Fora deste pedido

- Pré-preencher com o diagnóstico do gerenciador antigo (`mentoria_legado`): fica para depois (precisa decifrar o legado).
- Aba ACM da planilha (acompanhamento mês a mês): outro pedido.
- Cadastro de inscrição nova (`nova-inscricao.tsx`) continua igual.
