# NPAC-60 — Cronograma do PME dentro do sistema (desenho)

Status: **rascunho para o Gabriel aprovar** (24/11/2026). Pedido da Eduarda (vídeo de 20/11 + duas rodadas de
respostas). Caixa: `docs/pedidos/caixa.md`, NPAC-60.

## 1. Por quê

A equipe controla numa planilha do Google ("CRONOGRAMA") o que cada mentorado recebe em cada PME: uma linha por item
(experiência, desafio, filme, livro, vídeo de EAP), uma coluna por mentorado e, na célula, o mês ("3º mês"). Serve para
montar o PME do mês seguinte sem repetir o que a pessoa já recebeu. A Eduarda quer isso dentro do sistema, e a planilha
aposenta.

Respostas dela (palavras dela resumidas):

| Nº | Resposta | Significa |
|---|---|---|
| R1 | "1A" (1ª rodada) | importa a planilha uma vez; depois tudo é marcado no sistema |
| R2 | "3B" (1ª rodada) | não é a "atividade extra" do catálogo de PMEs: cada mentorado recebe os seus itens, em meses diferentes |
| R3 | "4A" (1ª rodada) | só Admin e Acompanhamento marcam que a pessoa **fez** |
| R4 | "1A" (2ª rodada) | o "Nº mês" é posto **quando o item vai no PME daquele mês** (corrige a leitura do "2A" da 1ª rodada) |
| R5 | "2B" (2ª rodada) | cada item vira **tarefa do PME**, com fez / não fez e comprovante, contando na % do PME |
| R6 | "3A" (2ª rodada) | **a Operação marca** os itens quando monta o PME |
| R7 | "4A" (2ª rodada) | do RDV para a 2M o cronograma **continua**: não repete o que a pessoa já recebeu |
| R8 | Gabriel, 24/11 | importar os **5 blocos** da planilha |

R3 e R6 não brigam: a Operação **escolhe e envia** os itens (põe o mês); Admin e Acompanhamento marcam **o resultado**
(feita, parcial, não feita), como já é hoje com as tarefas do PME ("Operação envia mas não marca").

## 2. O que a planilha é (arquivo de 24/11, lido sem copiar nomes)

- Aba CRONOGRAMA exportada em CSV (UTF-8 com BOM, células com quebra de linha entre aspas), 318 linhas × 251 colunas.
- Coluna A: número da linha (ou vazio, ou "Column N"); coluna B: o texto do item; colunas C em diante: um mentorado
  por coluna (249; 144 casais escritos "A e B" ou "A/B"; 30 só com o primeiro nome; 12 sem nome e vazias).
- 5 blocos, cada um aberto por uma linha de cabeçalho com o título na coluna B: EXPERIÊNCIAS (linha 1 do arquivo, que
  também é o cabeçalho de nomes), DESAFIOS, FILMES, LIVROS, EAP. Os cabeçalhos dos blocos 2–5 vieram quase todos como
  "Column N": **a pessoa de cada coluna é a do cabeçalho de cima**.
- Itens: 48 experiências, 103 desafios, 35 filmes, 29 livros, 78 EAP (título + link do YouTube). 3 EAP repetidos.
  ~26 desafios usados por uma família só ("vender terreno e um caminhão"). 19 desafios nunca usados (lista nova).
- Células: ~8.300 marcadas; quase todas "Nº mês" com variações ("6 mes", "8 MÊS", "4° Mês", só "12"). Livros: ~113
  "já leu / já leram / já leu antes da 2M" (leitura de antes). Fora do padrão: "não fez" (4), "não concluiu" (1),
  "Não fizeram no 1º mês" (1), nomes soltos (2).
- Por pessoa-mês aparece quase sempre 1 experiência, 1 desafio, 2 filmes, 1 livro e 3–4 EAP: igual ao modelo escrito
  no fim do arquivo ("PME 01: eap, eap2, eap3, experiencia, desafio, filme, filme, livro"). Depois do EAP vêm só as
  linhas desse modelo (coluna A com texto: "Nome do arquivo", "eap", "filme"…), que **não são itens**.
- Mês máximo por pessoa: 12. 3 nomes aparecem em duas colunas (em duas delas a segunda recomeça no 1º mês).

**O arquivo real nunca entra no repositório nem em ferramenta externa.** Os testes usam um CSV fictício com a mesma
forma (`packages/shared/test/fixtures/cronograma-ficticio.csv`).

## 3. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
1. Banco de itens do cronograma (os 5 blocos) em Configurações, mantido pela Admin.
2. Ao enviar um PME, a Operação (ou Admin/Acompanhamento) escolhe os itens do cronograma daquele PME; o sistema sugere
   o modelo (3 EAP, 1 experiência, 1 desafio, 2 filmes, 1 livro) entre os itens que a pessoa **ainda não recebeu**.
3. Cada item escolhido vira tarefa do ciclo (origem `PME`), com resultado e comprovante, e entra na % do PME.
4. Na ficha, uma aba "Cronograma" com tudo o que a pessoa recebeu, PME a PME (a coluna da planilha), incluindo o que
   recebeu em outra inscrição (RDV → 2M).
5. Importar a planilha uma vez, com prévia e confirmação da Admin, sem estragar nada se rodar de novo.

**Não-objetivos (agora)**
- Área do mentorado ("Materiais… desafio do mês", Fase 3 do PDF): vai ler daqui depois.
- Visão em grade (todos os mentorados × itens, como a planilha). Não foi pedida.
- Obrigar o modelo do PME (bloquear envio sem 3 EAP etc.): o modelo é sugestão; os dados mostram meses com 1 a 7 EAP.
- "Desafio da Nação Milionária" (grupo, da Duda) e a "experiência personalizada" do 3º mês (momento mágico, ação do
  plano): são outras coisas e não mudam.

**Anti-objetivos (falharia mesmo funcionando)**
- A Fila do dia afogada: 8 cobranças a mais por mentorado no dia do prazo do PME.
- A importação mexer em quem já está certo no sistema (só acrescenta) ou criar ciclos antigos.
- Nome de mentorado, contato ou o arquivo real em log, URL, repositório ou ferramenta externa.
- A Especialista passar a ver PME de quem não é dela.

## 4. Abordagens consideradas

| | Como | Troca | Escolha |
|---|---|---|---|
| A | Lista própria: banco + "recebeu no Nº mês", fora das tarefas | simples, não mexe em % nem Fila; mas não tem fez/não fez | descartada pela R5 ("2B") |
| **B** | **Itens viram tarefas do PME (origem `PME`, que já existe no banco e nunca é criada)** | usa o que já existe (resultado, comprovante, %, ficha, aba 7); mexe no envio do PME | **escolhida (R5, R6)** |
| C | Importar tudo como tarefas, criando os ciclos antigos | histórico "perfeito" | descartada: criaria ~1.300 ciclos falsos e mudaria % e Fila de 230 pessoas |

Dentro de B, o histórico da planilha entra como **registro do que já foi recebido** (não como tarefa), exceto o mês do
ciclo aberto, que vira tarefa (C8).

## 5. Decisões

Dela: R1–R8 (seção 1). **Minhas** (marcadas para o Gabriel conferir):

| Nº | Decisão minha | Por quê |
|---|---|---|
| C1 | Nome na tela: **"Cronograma"** (aba da ficha, aba de Configurações, card da importação); blocos com os títulos dela: Experiências, Desafios, Filmes, Livros, EAP | é o nome da planilha dela; evita confundir com a "experiência personalizada" do 3º mês |
| C2 | Banco editado **só pela Admin** (Configurações > Cronograma): incluir, corrigir texto, esconder (nunca apagar item já usado) | o PDF dá à Admin "modelos de PME"; esconder preserva o histórico |
| C3 | Item **"só desta pessoa"** no envio (texto livre, com o bloco): vira tarefa sem entrar no banco | ~26 desafios da planilha são de uma família só; no banco virariam ruído |
| C4 | Sugestão do envio: para cada bloco, os primeiros itens **ativos** do banco (na ordem do banco) que a pessoa ainda não recebeu, na quantidade do modelo; tudo editável; pode enviar com zero itens | a ordem das linhas da planilha acompanha o mês (itens de cima saem antes); modelo é sugestão |
| C5 | Modelo do PME fixo no código (`MODELO_PME`): EAP 3, Experiência 1, Desafio 1, Filme 2, Livro 1 | está escrito na planilha; vira configurável se ela pedir |
| C6 | Inscrição com variante "sem cronograma" (texto da `mentoria_variante`): o envio abre sem sugestões e com o aviso "Inscrição sem cronograma"; dá para escolher à mão | o dado já existe nas inscrições antigas |
| C7 | **Continuidade (R7)** pela mesma pessoa = pessoas com o mesmo WhatsApp ou e-mail (índice cego), como o "Já tem inscrição" da venda (NPAC-56). Sem contato igual, não liga | não há identidade de pessoa entre inscrições; o índice cego já é a regra usada |
| C8 | Importação, por coluna já ligada à inscrição certa: **com ciclo aberto Nº N**, mês = N vira tarefa desse ciclo (pendente), mês < N vira "recebido antes do sistema" e mês > N vira **"planejado na planilha"** (aparece já marcado no envio daquele PME); **sem ciclo aberto**, tudo vira "recebido" | o PME do mês corrente precisa de fez/não fez (R5) e a planilha aposenta (R1); nada de ciclo falso; sem ciclo aberto não dá para saber a que PME do sistema o mês corresponde |
| C9 | "já leu / já leram / já viram / já leu antes da 2M" = **"já tinha antes"** (sem mês); "não fez / não concluiu / não fizeram" = histórico com resultado "não fez"; nome solto ou texto que não é mês = ignorado e listado | os textos dizem isso; nas duas leituras de "já leu" o efeito é o mesmo (não indicar de novo) |
| C10 | **Fila e push não cobram item a item** (tarefas de origem `PME` ficam fora do `COBRANCA`); o atraso do PME continua no `PME_ATRASADO` (degraus) | anti-objetivo da Fila; o PDF cobra o PME pelo atraso do ciclo |
| C11 | Remover um item do ciclo aberto (engano na montagem): quem envia PME, só com a tarefa **pendente e sem comprovante** | não existe exclusão de tarefa hoje; o resto da regra continua ("sem exclusão") |
| C12 | A Especialista não vê o cronograma (aba 404, tarefas `PME` já são invisíveis para ela); a Operação vê tudo e escolhe; o Acompanhamento "só a carteira" vê só a carteira | regra atual de `mentoria_ve_tarefa`; a Operação monta os PMEs (PDF) |
| C13 | Importação só pela Admin, em Configurações > Importação, arquivo **CSV** da aba CRONOGRAMA (o que ela mandou); `.xlsx` recusado com "Baixe a aba CRONOGRAMA em CSV" | é uma vez só (R1); um formato a menos para errar |
| C14 | Casar coluna com inscrição: automático **só** quando há uma única candidata; várias (inclusive RDV e 2M da mesma pessoa) ou nenhuma = dúvida, e a Admin escolhe na prévia (com mentoria, status, PME atual e o maior mês da coluna lado a lado) ou deixa "Ignorar" (padrão) | 30 colunas só com o primeiro nome; o mês da planilha vale para uma inscrição só: ligar a coluna do RDV à 2M faria o 2º mês do RDV virar tarefa do 2º PME da 2M |
| C15 | Duas colunas na mesma inscrição (nome repetido) ou item repetido (3 EAP): junta; fica o **menor** mês | o que a pessoa recebeu primeiro é o que vale para não repetir |

## 6. Modelo de dados (migration 0084, SQL manual onde o Drizzle não cobre)

**`mentoria_cronograma_itens`** (catálogo; sem dado pessoal; não cifrado)
- `id uuid`, `bloco text` CHECK in (`EXPERIENCIA`, `DESAFIO`, `FILME`, `LIVRO`, `EAP`), `texto text` (1–2000),
  `texto_norm text` (minúsculas, sem acento, espaços e pontuação colapsados; calculada pela API com a mesma função do
  shared, porque `unaccent` não serve em coluna gerada), `ordem int`, `ativo bool`, `version int`, `criado_em`,
  `criado_por`, `atualizado_em`.
- Corrigir o texto de um item não muda as tarefas já enviadas (cada tarefa guarda a própria cópia cifrada).
- Único `(bloco, texto_norm)`. Sem DELETE para `npac_app` (esconder = `ativo = false`).
- RLS: leitura para quem vê tarefas de PME (Admin, Acompanhamento, Operação); escrita só Admin (`mentoria_admin()`),
  política de leitura no formato `(select f())` (regra da 0060).

**`mentoria_tarefas`** ganha
- `cronograma_bloco text` (nulo fora da origem `PME`; CHECK: origem `PME` ⇔ bloco preenchido) e
  `cronograma_item_id uuid` (FK para o item; nulo = item "só desta pessoa", C3).
- Único parcial `(ciclo_id, cronograma_item_id)` quando o item não é nulo.
- Texto continua na `descricao` cifrada (cópia do texto do item no envio, como as extras).
- `prazo` = prazo do ciclo, como extras e encerramento (a % e o status usam o que já existe).

**`mentoria_cronograma_anteriores`** (o que veio da planilha e não virou tarefa)
- `id`, `inscricao_id` (FK), `item_id` (FK), `pme_numero smallint` (1–12; nulo = "já tinha antes"),
  `resultado text` CHECK in (`RECEBIDO`, `NAO_FEZ`, `JA_TINHA`, `PLANEJADO`), `tarefa_id uuid` (preenchida quando a
  linha `PLANEJADO` sai num envio do sistema, C8), `importado_em`, `importado_por`.
- **Já recebido** (para não repetir, R7) = tarefa `PME` com item em qualquer ciclo das inscrições da pessoa + linhas
  `RECEBIDO`, `NAO_FEZ` e `JA_TINHA` delas + `PLANEJADO` de **outra** inscrição. `PLANEJADO` da própria inscrição fica
  reservado para o PME dele: sai das sugestões dos outros PMEs e entra já marcado no dele.
- Único `(inscricao_id, item_id)`. Leitura pela RLS da inscrição (`mentoria_ids_visiveis`, mesmo formato); escrita só
  pelas funções da importação e do envio. Excluir a inscrição leva as linhas (a função de exclusão ganha a tabela).

**Funções**
- `mentoria_cronograma_recebidos(inscricao uuid)` (SECURITY INVOKER, `STABLE`, `SET jit = off`): os itens que a pessoa
  já recebeu, desta inscrição e das outras com WhatsApp ou e-mail igual (C7) que quem consulta enxerga: `item_id`,
  `bloco`, `pme_numero`, `resultado` (da tarefa ou da linha anterior), `inscricao_id`, `mentoria`. Usada pela sugestão,
  pela aba da ficha e pela recusa de repetir.
- `mentoria_cronograma_remover(tarefa uuid, version int)` (SECURITY DEFINER): C11, com histórico.
- Área nova em `mentoria_edita`: nenhuma. Escolher itens = área `PME` (quem envia); marcar resultado = regra atual das
  tarefas (`mentoria_edita_tarefa`); banco = Admin.

## 7. Regras

**Envio do PME** (`POST inscricoes/:id/ciclos`, os três caminhos de hoje: card da ficha, Fila `ENVIAR_PME`, 1º PME)
- Dados da janela: `GET inscricoes/:id/cronograma` → o que a pessoa já recebeu (desta e das outras inscrições, C7), os
  `PLANEJADO`, o banco ativo por bloco (com "já recebeu" marcado), a sugestão para o próximo número (C4: primeiro os
  `PLANEJADO` daquele número, depois os primeiros não recebidos até completar o modelo) e `semCronograma` (C6). O
  mesmo dado alimenta a aba da ficha. ~300 itens: vai inteiro, sem paginação.
- Corpo do envio ganha `cronograma?: { itemId?: uuid; bloco; texto? }[]` (até 20 por ciclo). Item do banco: ativo e
  não "já recebido" (seção 6), senão 409 "Esse item já foi do <Nº> PME" (com o número). Item "só desta pessoa":
  `texto` 1–2000.
- Na mesma transação do ciclo: uma tarefa `PME` por item, com a ordem extras → cronograma → encerramento, e as linhas
  `PLANEJADO` escolhidas ganham `tarefa_id`.
- Fila `ENVIAR_PME` deixa de ser um clique: "Montar e enviar" abre a mesma janela da ficha. O 1º PME que nasce pelo
  "Enviado" do onboarding (`cicloDoPme1`) continua sem itens; o card do PME mostra "Monte o cronograma deste PME".
- Itens também entram depois, no ciclo aberto (`POST ciclos/:id/cronograma`), com as mesmas regras (engano ou PME
  aberto antes desta entrega).

**Resultado**: igual a qualquer tarefa do ciclo (feita, parcial, não feita, motivo, comprovante; Admin e
Acompanhamento). Entra na `mentoria_pct_tarefas` sem mudança de código.

**Fila e push** (C10): `mentoria_fila` e `mentoria_avisos_candidatos` ignoram tarefas de origem `PME` no `COBRANCA`.
Semáforo não muda (só olha tarefas da reunião). `fila-equivalencia` ganha o caso.

**Histórico da inscrição**: envio grava o campo `cronograma` (sem textos); incluir/remover item grava
`pme.cronograma_incluido`/`_removido` com o bloco. Importação não grava histórico por inscrição; grava uma auditoria
`mentoria.cronograma_importado` com as contagens.

## 8. Importação (Configurações > Importação, card "Cronograma")

1. A Admin escolhe o CSV. A tela lê o arquivo como texto e manda em `POST mentoria/cronograma/importar/previa`
   (rota com o limite de 25 MB do `app.setup.ts`, como a da carteira).
2. **Leitura** (função pura `lerCronograma` em `sh/mentoria/cronograma.ts`, sem zod, testável): parser CSV próprio
   (RFC 4180: aspas, vírgula e quebra de linha dentro da célula, BOM). Bloco atual muda na linha cujo texto da coluna B
   é um dos 5 títulos (sem acento/maiúsculas) **e** cuja coluna C repete um nome do cabeçalho ou é "Column N". Linha
   de item: coluna B com texto e coluna A vazia, número ou "Column N"; outras linhas (o modelo do fim) são ignoradas.
   Célula: `^(\d{1,2})\s*[º°o]?\s*(m[eê]s)?$` com 1–12 → mês; C9 para os textos; o resto → ignorado (contado por motivo,
   sem o texto da célula na resposta, para não ecoar nomes).
3. **Casamento** (C14) contra as inscrições não anonimizadas: tokens do nome (reuso de `nomeNormalizado` e da lógica de
   `importacao.ts`); casal ("A e B", "A/B", "A / B") casa com inscrição CASAL pelas duas pessoas; individual pelo
   primeiro nome + sobrenomes que vierem.
4. **Prévia** mostra: itens por bloco (novos × já no banco × repetidos juntados); colunas casadas, em dúvida (com as
   candidatas: nome, mentoria, status, mês), sem candidata e sem marcação; quantas células viram tarefa (ciclo aberto),
   histórico, pré-marcadas, "já tinha", "não fez" e ignoradas por motivo. A Admin decide as dúvidas (escolher ou
   "Ignorar") e clica "Importar".
5. **Gravação** (`POST …/importar`, mesma leitura + decisões, uma transação): itens novos no banco (ordem = ordem do
   arquivo); por coluna decidida, as linhas em `mentoria_cronograma_anteriores` e as tarefas do ciclo aberto (C8).
   Duas colunas ligadas à mesma inscrição, ou à mesma pessoa em inscrições diferentes, são avisadas na prévia.
   **Só acrescenta**: item já no banco, linha já existente e tarefa do mesmo item no ciclo são pulados. Rodar de novo
   não muda nada.
6. **Resultado**: os números do que entrou e do que ficou de fora; nada de nome em log.

## 9. Telas (protótipo para aprovar antes do código)

1. **Configurações > Cronograma** (Admin): 5 seções com contador; cada item com o texto (link clicável no EAP), "usado
   N vezes", "Esconder/Mostrar" e editar texto; "Novo item" por bloco.
2. **Configurações > Importação**: card "Cronograma" abaixo do da carteira: arquivo → prévia → decisões → Importar →
   resultado.
3. **Janela "Enviar o Nº PME"** (ficha e Fila): data (como hoje) + "Cronograma deste PME" com os 5 blocos, cada um com
   as sugestões (C4) e "Trocar"/"Tirar"/"Adicionar" (busca no banco entre o que a pessoa ainda não recebeu) e "Item só
   desta pessoa"; o modelo aparece como "EAP 2 de 3". Celular: blocos empilhados, toques de 44 px.
4. **Card "PME atual"** (Jornada): as tarefas do cronograma agrupadas por bloco, com o mesmo marcar de hoje; "Montar o
   cronograma" quando não há nenhuma.
5. **Aba "Cronograma" da ficha** (depois de Evolução): PME a PME (mais recente em cima), cada item com o bloco e o
   resultado; "Já tinha antes" e "Recebido no RDV (outra inscrição)" em seções próprias; por bloco, "Ainda não recebeu:
   N" que abre a lista.

## 10. Quem faz o quê

| Perfil | Ver cronograma | Escolher itens no envio | Marcar resultado | Banco | Importar |
|---|---|---|---|---|---|
| Admin (e Diretoria) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Acompanhamento | ✅ (só a carteira, se for o alcance) | ✅ | ✅ | ❌ | ❌ |
| Operação | ✅ | ✅ (R6) | ❌ (R3) | ❌ | ❌ |
| Especialista, Mentor, Envios | ❌ (404) | ❌ | ❌ | ❌ | ❌ |

## 11. Privacidade

- Item do banco é material do programa (sem dado pessoal): texto claro. Tarefa e item "só desta pessoa": cifrados como
  as outras tarefas.
- A prévia leva nomes das colunas só na resposta da API para a Admin; nada em log, URL ou auditoria.
- O CSV real fica fora do repositório; ITODEV e testes usam o fictício. A importação de verdade roda só em produção, pela
  Admin (dado real não sai de prod).

## 12. Pronto quando

- `pnpm --filter @npac/shared test` (parser + casamento com o CSV fictício: blocos, "Column N", variações de mês, "já
  leu", "não fez", modelo do fim ignorado, item repetido, casal com "/" e "e").
- `pnpm --filter @npac/db test`: RLS por perfil (Especialista não lê; carteira só a carteira), único por ciclo/item,
  `mentoria_cronograma_recebidos` atravessando inscrições pelo índice cego e respeitando a RLS, Fila sem `COBRANCA` de
  origem `PME` (equivalência), remoção só pendente sem comprovante.
- `pnpm --filter @npac/api test`: envio com itens (repetido 409, item escondido 400, Operação escolhe, Operação não
  marca resultado 403/404), prévia e importação (idempotente, C8 nos três casos, decisões da Admin), 404 da Especialista.
- e2e: Admin importa o fictício e vê a ficha; Operação monta e envia pelo card e pela Fila; Acompanhamento marca feita e
  a % muda; Especialista 404; celular 375/768 sem sair da tela. Capturas 375/768/1024/1440.
- JS de `/leads` continua < 150 KB (nada disso entra no comercial).

## 13. Implantação

1. Fases sugeridas (cada uma um PR na `release/v0.22` ou na seguinte): (1) banco + regras + API do envio; (2) telas do
   envio, card e aba da ficha + banco em Configurações; (3) importação.
2. ITODEV com o CSV fictício e um roteiro por perfil (Admin, Acompanhamento, Operação, Especialista).
3. **Antes de importar em produção:** conferir que a carteira foi importada lá (em 22/11 havia 1 inscrição). Sem a
   carteira, nenhuma coluna casa.
4. A Eduarda (Admin) importa em produção; a planilha aposenta depois que ela conferir algumas fichas.

## 14. Fica para depois / riscos

- Pausa e segunda chance não mudam o prazo das tarefas do cronograma (seguem o ciclo).
- Sem contato igual entre RDV e 2M, a continuidade (R7) não liga; se aparecer caso, um "Continua de" manual na ficha.
- Modelo do PME configurável e visão em grade, se ela pedir.
- `CLAUDE.md` ganha a seção do cronograma no mesmo PR da fase 1.
