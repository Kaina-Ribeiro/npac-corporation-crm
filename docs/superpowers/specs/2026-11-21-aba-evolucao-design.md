# NPAC-57: aba "Evolução" na ficha do mentorado

Status: rascunho para o Gabriel aprovar (21/11/2026). Pedido: Eduarda (Duda), áudio de 19/11 + print do gerenciador
antigo. Respostas da Duda: "1A, 2A, 3A, 4B" (19/11). Gabriel: opção A do protótipo (21/11) e "1A, 2A, 3A" nas escolhas de
construção (21/11). Caixa: `docs/pedidos/caixa.md`, NPAC-57. Protótipo aprovado: canvas "Aba Evolução",
https://claude.ai/artifact/FMGeFidYfYqefqVuV4FwfC (telas Opção A, Linha do tempo, PDF e Celular; a Opção B ficou de fora).

## 1. Por que

A Duda usava, no gerenciador antigo (fora do CRM), uma tela por mentorado com a evolução: cartões "antes → hoje",
"Momento inicial" e "Momento atual" lado a lado, galeria de conquistas e "Exportar PDF". Ela mostra essa tela ao
mentorado como **prova do resultado da mentoria**. O v2 do Acompanhamento apagou o gerenciador (decisão D1 do design v2)
e a tela não voltou: hoje a ficha tem só o "Momento inicial" (números, dor, sonho, meta e notas dos 4 pilares) e o
"Histórico" (lista de alterações). Os textos antigos vieram na importação para `mentoria_legado`, cifrados e sem tela.

Pedido nas palavras dela: "a evolução dos quatro pilares… de um lado o momento inicial e o momento agora… que eu
conseguisse baixar em PDF".

## 2. Objetivos

1. Uma aba **"Evolução"** na ficha do mentorado (1A), entre "Momento inicial" e "Histórico".
2. **Cartões de evolução** editáveis na própria caixa, salvando ao sair do campo: Reserva financeira (antes → hoje),
   Evolução de renda, Evolução na saúde, Investimentos feitos na mentoria, Área de atuação.
3. **Momento inicial × Momento atual**, cada um com uma foto e tópicos, em duas vistas: "Lado a lado" e "Linha do tempo".
   - Momento inicial (opção A do Gabriel): **montado da aba Momento inicial** (dor, sonho e meta viram tópicos com
     rótulo, só leitura) + "outras anotações" livres que a equipe edita (vêm preenchidas com o texto do sistema antigo).
   - Momento atual (2A): a equipe escreve os tópicos e põe a foto.
4. **Pontos de partida** (parte da opção A): faixa abaixo dos dois momentos com os quatro valores do Momento inicial
   (recebe, custo, dívidas, guardado) e as notas de 0 a 10 dos 4 pilares de cada pessoa, só leitura.
5. **Conquistas** (3A do Gabriel): galeria com foto ou vídeo, data e descrição; adicionar e remover.
6. **Baixar PDF** (1A): folha A4 montada para impressão, pela janela de imprimir do navegador ("Salvar como PDF").
7. **Textos antigos já aparecem** (3A da Duda): uma cópia única de `mentoria_legado` para a aba nova (2A do Gabriel).
8. **Quem vê** (4B): Admin, perfil Acompanhamento (com o recorte de carteira) e Operação veem e baixam o PDF. A
   Especialista não vê a aba nem os dados.

## 3. Fora do escopo (não fazer)

- Área do mentorado (Fase 3): nada fica visível ao mentorado; sem campo "visível ao mentorado" nesta entrega.
- Notas dos pilares "de hoje" (avaliações `MES_4`, `MES_8`, `FINAL` já existem no banco, sem tela): fora; os Pontos de
  partida mostram só a avaliação `INICIAL`.
- A aba 8 "Linha do tempo e conquistas" do menu (Fase 4, imagem do mês 4, cálculo do mês 8, PDF do mês 10) continua "Em
  breve"; esta entrega não a substitui.
- Fotos antigas: a importação guardou só a lista de que havia foto, sem o arquivo. Não há o que trazer; a equipe põe de
  novo.
- Editar uma conquista depois de criada (o original também não tinha): remove e adiciona de novo.
- Geração de PDF no servidor.

**Anti-objetivos** (falha mesmo que funcione): a Especialista enxergar a evolução de alguém; um texto da evolução
aparecer em URL, log, CSV, histórico ou push; a equipe ter de digitar duas vezes o que já está na aba Momento inicial; o
PDF sair com o endereço do site impresso, com letra pequena demais para ler no papel ou cortando um cartão no meio.

## 4. Jeitos considerados

| Escolha | Opções | Decisão (Gabriel, 21/11) |
|---|---|---|
| Momento inicial | A) montado da aba Momento inicial · B) texto livre dos dois lados | **A** |
| PDF | A) impressão do navegador com folha própria · B) arquivo gerado no servidor (navegador headless) | **A**: sem peça nova no servidor; a pessoa clica "Salvar" na janela |
| Textos antigos | A) cópia única para a tabela nova · B) ler o legado toda vez até alguém salvar | **A**: um só lugar para o dado |
| Conquistas | A) entram agora · B) ficam para a Fase 4 | **A**: estão no original e no protótipo aprovado (a Duda não pediu no áudio) |

## 5. Desenho (o protótipo é a referência visual)

Telas do protótipo (versão de 21/11, depois da crítica de design): "Opção A aprovada" (quem edita), "Mentorado novo,
tudo vazio", "Operação, só leitura", "PDF baixado (A4, 2 folhas)", "Vista Linha do tempo" e "Celular (375 px)".

### 5.1 Onde e para quem

- Ficha (`web/app/(app)/acompanhamento/ficha/[id]`, `components/acompanhamento/ficha.tsx`): aba nova `evolucao`,
  rótulo "Evolução", entre `momento` e `historico`. `?aba=evolucao` abre direto e vira a lembrada (regra atual das abas).
- A aba não aparece para quem não vê a evolução (Especialista); `?aba=evolucao` para ela abre a aba padrão.
- No celular, a fileira de abas rola até a aba aberta (hoje a "Evolução" ficaria escondida à direita).

### 5.2 Cabeçalho da aba

Sobretítulo "Evolução na mentoria", título "Como chegaram e como estão agora" (17–18 px, **menor que o nome do mentorado**
no topo da ficha), linha "Clique num texto para editar. Salva ao sair do campo." (só para quem edita). À direita: seletor "Lado a lado | Linha do tempo" (some abaixo de 768 px, onde
as duas vistas ficam iguais) e o botão "Baixar PDF".

### 5.3 Evolução (cartões)

Rótulos literais do original: "Reserva financeira", "Evolução de renda", "Evolução na saúde", "Investimentos feitos na
mentoria", "Área de atuação". Reserva mostra "Antes" → "Hoje" (seta dourada; no celular, um embaixo do outro). Campo vazio
mostra "não informado" (texto do original). Grade: 4 colunas a partir de 1024 px (Reserva, Investimentos e Área ocupam 2),
2 colunas de 768 a 1023 px, 1 coluna no celular. Quem edita clica no cartão e o texto vira campo (salva ao sair, fila de
salvamento do módulo, aviso "Salvo"). **Teclado e leitor de tela**: o cartão inteiro é um botão de verdade ("Editar
reserva financeira", etc.), alcançável pelo Tab, com anel de foco; um lápis aparece ao passar o mouse ou focar (no toque,
fica sempre visível, mais claro). Quem só vê lê o texto, e o cartão **vazio some** para ele (e no PDF); para quem edita,
o vazio continua com "não informado" para poder ser preenchido. Limite de 2.000 caracteres por campo.

### 5.4 Os dois momentos

Cada um num cartão com o número (1, 2), o título, o botão "Editar" no mesmo lugar nos dois (só para quem edita; vira
"Pronto" com a caixa aberta), a foto redonda (96 px; sem foto, círculo com câmera e "Sem foto"; com foto, aro dourado no
atual), uma linha de data e os tópicos. Foto com texto alternativo ("Foto do casal no momento atual", "Foto de quando
chegaram"). Botão "Anexar foto" / "Trocar foto" ao lado, só para quem edita.

- **Momento inicial** (subtítulo "Quando chegaram"), dividido em **dois blocos** para não misturar o que se edita aqui com
  o que vem de outra aba:
  - Data: "Iniciou em DD/MM/AAAA" = início da jornada (`inicioJornada` da ficha; sem ela, a data do Momento inicial;
    sem nenhuma, sem a linha).
  - Bloco **"Da aba Momento inicial"** (com o link "Ver a aba" na mesma linha, área de toque de 44 px): "Dor: …",
    "Sonho: …", "Meta de 12 meses: …", só leitura; os vazios não aparecem; os três vazios: "Nada escrito ainda na aba
    Momento inicial."
  - Bloco **"Outras anotações"**: o campo livre da aba nova (nasce com o texto antigo). O "Editar" do cartão abre só ele
    (caixa de texto; cada linha vira um tópico; "Rótulo: texto" deixa o rótulo em negrito, rótulo até 24 caracteres).
    Vazio: "Nada escrito ainda."
- **Momento atual** (subtítulo "Mês N de 12", do mês da jornada; antes do início, o rótulo atual da ficha):
  - Foto + "Foto de DD/MM/AAAA" (data do envio).
  - Tópicos editáveis (mesma caixa e regra). Vazio: "Ainda não escrito."
  - Rodapé "Atualizado em DD/MM/AAAA por <nome>" (última alteração dos tópicos ou da foto do momento atual), só quando
    alguém já escreveu.
- **Lado a lado**: duas colunas a partir de 768 px. **Linha do tempo**: os mesmos cartões empilhados, com um fio vertical
  do cinza ao dourado ligando os números. A vista escolhida fica lembrada no aparelho (cookie da ficha em `AC_PREFS`).

### 5.5 Pontos de partida

Título "Pontos de partida", nota "Da aba Momento inicial" (+ ", concluída em DD/MM/AAAA" quando travada). Quatro valores
(Recebe por mês, Custo mensal, Dívidas, Guardado; em R$, de centavos) e, por pessoa, as notas de Fé, Saúde, Dinheiro e
Relacionamentos (avaliação `PILARES` `INICIAL`) com uma barrinha dourada proporcional. Valor sem dado: "—". Sem nenhum
valor nem nota: a faixa não aparece.

### 5.6 Conquistas

Título "Conquistas", nota "N · da mais antiga à mais recente" (sem conquista: "Nenhuma conquista ainda." e, para quem
edita, o cartão de adicionar; a Operação não vê esse cartão). Cartões com a mídia (foto 4:3 recortada; vídeo com o
player), a data e a descrição; ordem por data (sem data por último, como a conquista "arquivada" que veio do sistema
antigo). Último cartão: "+ Adicionar conquista" (janelinha `dlg`: foto ou vídeo, data com hoje sugerido, descrição até 500
caracteres; mídia obrigatória para conquista nova). Remover: confirmação "Remover essa conquista?". Conquista antiga sem
mídia aparece com a área da imagem vazia e "Sem foto". Clicar na foto abre em tamanho maior (pode ser só abrir o arquivo).

### 5.7 PDF

"Baixar PDF" abre `/acompanhamento/ficha/[id]/evolucao/pdf` (rota nova, só servidor) numa aba nova; a página monta a
folha A4 do protótipo e chama `window.print()` ao carregar; o título do documento é "Evolução - <nome>" (vira o nome do
arquivo sugerido). Conteúdo: marca NPAC + mentoria, nome, "Mês N de 12 · início em DD/MM/AAAA", os cartões, os dois
momentos, os Pontos de partida, **todas** as conquistas e o rodapé "Gerado pelo CRM NPAC em DD/MM/AAAA" em cada folha
(decisão do Claude, 21/11: nenhuma conquista some; o que não cabe vai para a folha seguinte). Caso comum do protótipo:
folha 1 com cartões, momentos e Pontos de partida; folha 2 com um cabeçalho curto (marca e nome) e as conquistas.
Regras de impressão (da crítica de design):
- **`@page { size: A4; margin: 0 }`** e o respiro (~12 mm) feito dentro da folha: com margem zero o navegador não imprime
  título nem endereço do site no topo e no rodapé.
- Letra para papel: texto com ~10 pt, rótulos com 8 pt no mínimo; cinzas com 4,5:1 sobre o branco.
- Sem foto, o círculo some (não imprime "Sem foto"). Cartão vazio não sai. Sem botões, links ou dicas de edição.
- Cores com `print-color-adjust: exact`; nenhum cartão cortado no meio (`break-inside: avoid`).
- Número da folha ("Página N de M") só se o navegador permitir sem truque; senão, só a data.
Mesmo acesso da aba (404 para quem não vê). A rota não leva texto da evolução na URL. Não grava auditoria a cada abertura
(é leitura).

## 6. Dados

### 6.1 Tabelas (migration nova, `00NN_acompanhamento_evolucao.sql`)

- **`mentoria_evolucao`** (uma linha por inscrição, PK `inscricao_id` → `mentoria_inscricoes` com cascade):
  `reserva_antes`, `reserva_hoje`, `renda`, `saude`, `investimentos`, `area_atuacao`, `inicial_notas`, `atual_notas`
  (todos texto **cifrado** com AAD, `cifradoCabe`), `atual_atualizado_em`, `atual_atualizado_por`, `legado_copiado_em`
  (marca que a cópia do sistema antigo já rodou para essa inscrição), `version`, autoria (`criado_*`/`atualizado_*` como as
  outras tabelas do módulo). Linha criada no primeiro salvamento (upsert) ou pela cópia.
- **`mentoria_conquistas`**: `id`, `inscricao_id`, `data` (date, nula), `descricao` (cifrada, nula), `criado_por`,
  `criado_em`. Sem UPDATE; exclusão só pela função `mentoria_conquista_excluir(id)` (SECURITY DEFINER), que apaga e
  enfileira a mídia em `mentoria_midia_exclusao`, como as outras exclusões do módulo.
- **Mídia**: `mentoria_midia.dono_tipo` aceita `EVOLUCAO_INICIAL`, `EVOLUCAO_ATUAL` (dono = inscrição; uma foto por
  momento: trocar apaga a anterior pela mesma fila) e `CONQUISTA` (dono = conquista; foto ou vídeo). `mentoria_midia_ve` e
  `mentoria_midia_edita` ganham esses donos com a mesma regra de acesso da evolução.

### 6.2 Acesso (RLS, regra do módulo)

- **Ler** evolução e conquistas: Admin, Acompanhamento e Operação; Acompanhamento "só a carteira" só nas inscrições da
  carteira; **Especialista e demais, nada**. Política de leitura no formato por consulta (sem função por linha):
  `(select mentoria_ve_todas()) or inscricao_id = any ((select mentoria_ids_carteira())::uuid[])` (nunca
  `mentoria_ids_visiveis()`, que inclui a Especialista) + caso no teste-guarda `db/test/rls-por-consulta.test.ts` e no de
  equivalência.
- **Escrever** (cartões, anotações, momento atual, fotos, conquistas): Admin e Acompanhamento, área nova `EVOLUCAO` em
  `mentoria_edita` (com `mentoria_carteira_ok`). **Operação só lê** (4B fala em ver e baixar; escrita da Operação não foi
  pedida).
- Dor, sonho, meta, valores e notas continuam lidos das tabelas de sempre, com as regras de sempre.
- API: rotas sob `MentoriaController` (guarda 404 + MFA do módulo) com `@Perfis` de Admin, Acompanhamento e Operação na
  leitura e Admin/Acompanhamento na escrita; a RLS decide a linha. Invisível = 404.

### 6.3 API (nomes são sugestão; o construtor ajusta ao padrão do módulo)

- `GET mentoria/inscricoes/:id/evolucao` → cartões, `inicialNotas`, `atualNotas`, quem/quando atualizou o atual, fotos
  (id + data), dor/sonho/meta, valores, notas dos pilares por pessoa, conquistas com mídia, `pode.editar`, `version`.
  Pode vir junto da ficha se o padrão da ficha preferir.
- `PATCH mentoria/inscricoes/:id/evolucao` `{ version, campo: valor }` com lista fechada de campos; 409
  `VERSION_CONFLICT` reaproveita `resolverConflito` da fila de salvamento; mexer em `atual_notas` atualiza
  `atual_atualizado_*`.
- Fotos: o controlador de mídia existente, com os donos novos.
- `POST mentoria/inscricoes/:id/conquistas` (data, descrição; a mídia sobe depois pelo controlador de mídia, como o
  comprovante de tarefa) e `DELETE mentoria/conquistas/:id` (chama a função).
- Histórico (`historico.ts`): `evolucao.editada` com os **nomes** dos campos, `evolucao.foto`, `conquista.adicionada`,
  `conquista.removida`; nunca valores. Textos novos na `historico-lista.tsx`.

### 6.4 Cópia do sistema antigo (2A)

- Fonte: `mentoria_legado.dados` (JSON cifrado, AAD `mentoria_legado/dados/<id>`), chaves gravadas pela importação
  (`sh/mentoria/importacao.ts`): `antesDepois` (`RESERVA_FINANCEIRA.antes/depois`, `EVOLUCAO_RENDA.depois`,
  `EVOLUCAO_SAUDE.depois`, `INVESTIMENTOS_MENTORIA.depois`, `AREA_ATUACAO.depois`, e `FE`/`SAUDE`/`DINHEIRO`/
  `RELACIONAMENTOS.antes`), `notasMomentoInicial`, `notasMomentoAtual`, `conquistas` (`data`, `descricao`).
- Mapeamento: Reserva antes/depois → `reserva_antes`/`reserva_hoje`; renda, saúde, investimentos, área → os campos de
  mesmo nome; `notasMomentoInicial` + as linhas "Fé: …", "Saúde: …", "Dinheiro: …", "Relacionamentos: …" dos pilares
  antigos → `inicial_notas`; `notasMomentoAtual` → `atual_notas`; cada conquista → uma linha em `mentoria_conquistas`.
- Regra: por inscrição, só se `legado_copiado_em` está vazio; **nunca sobrescreve** campo que já tem texto; grava
  `legado_copiado_em`. Idempotente: rodar de novo não duplica conquistas nem mexe em nada.
- Como roda (Gabriel, 21/11, "A, ao subir"): tarefa da API **ao subir**, com advisory lock para uma só instância, que
  percorre as inscrições com legado ainda não copiado (precisa da chave de cifra, que só a API tem). ITODEV e produção
  copiam no deploy, sem comando à mão; o sim do Gabriel no deploy de produção vale também para a cópia.
- Acesso: `mentoria_legado` só tem leitura para Admin (`mentoria_legado_admin`) e a tarefa roda sem usuário logado. A
  migration cria duas funções `SECURITY DEFINER` só para essa cópia, com `EXECUTE` apenas para `npac_app`:
  `mentoria_evolucao_legado_pendentes(limite int)` → (`inscricao_id`, `dados` cifrado) das inscrições com legado e sem
  `legado_copiado_em`; e `mentoria_evolucao_legado_gravar(inscricao uuid, campos cifrados…, conquistas jsonb)`, que
  confere de novo `legado_copiado_em`, grava só campo vazio, insere as conquistas e marca a cópia, numa transação. A API
  só decifra e cifra (AAD da tabela nova); nenhuma política nova abre o legado.
- Autoria: a cópia grava `criado_por`/`atualizado_por` nulos (sistema) e **não** grava histórico
  (`mentoria_historico.ator_id` é obrigatório e a cópia não tem pessoa; ajuste do plano, 21/11); o rodapé
  "Atualizado em … por …" só aparece depois da primeira edição de uma pessoa.
- Log só com a contagem ("evolução: N inscrições copiadas do legado"), nunca nomes ou textos. Falha numa inscrição (texto
  ilegível) registra só o id no log, pula e segue; ela fica pendente para a próxima subida.

### 6.5 LGPD, CSV e backup

- Excluir inscrição (`mentoria_excluir…`) apaga evolução, conquistas e enfileira as mídias. Anonimizar zera todos os
  textos da evolução e das conquistas e apaga as fotos (mantém a linha para contagens, como o resto).
- CSV do módulo: nada da evolução entra.
- O backup cifrado do banco já leva as tabelas novas.

## 7. Rótulos

Do original (literais): Evolução, Reserva financeira, Evolução de renda, Evolução na saúde, Investimentos feitos na
mentoria, Área de atuação, não informado, Momento inicial, Momento atual, Conquistas, Adicionar conquista, Remover essa
conquista?, Lado a lado, Exportar PDF (aqui "Baixar PDF", como a Duda falou: "baixar em PDF"). "Timeline" do original vira
"Linha do tempo". Criados no protótipo aprovado pelo Gabriel: "Evolução na mentoria", "Como chegaram e como estão agora",
"Pontos de partida", "Quando chegaram", "Da aba Momento inicial", "Ver a aba", "Outras anotações", "Iniciou em", "Foto
de", "Atualizado em … por …", "Nada escrito ainda.", "Nada escrito ainda na aba Momento inicial.", "Ainda não escrito.",
"Sem foto", "Nenhuma conquista ainda.", "Antes e hoje".

## 8. Visual

Tokens e componentes do CRM (`modulo.css` sob `.ac`, **claro e escuro**: conferir os dois). Dourado **só** onde é
progresso: cartão e número do momento atual, seta da reserva, barras dos pilares, fio da linha do tempo e aro da foto
atual. Títulos de seção, sobretítulo e datas das conquistas em cinza/tinta neutra (crítica de 21/11: dourado em tudo
perdia o sentido). Cinza = momento inicial. O "hoje" da reserva fica em negrito, não verde (o original usava verde; no CRM
o dourado é a cor de progresso). Todo texto pequeno (rótulos "Antes"/"Hoje", rodapés, "não informado", dicas) usa o cinza
que passa 4,5:1 nos dois temas, nunca o mais claro. "Relacionamentos" por extenso (o título pode quebrar em duas linhas).
Celular: toques de 44 px (inclusive "Ver a aba"), campos de 16 px, nada sai da tela em 375/390/768/1024.

## 9. Como saber que ficou pronto

- Duda (Admin) e um perfil Acompanhamento abrem a ficha de um casal importado e veem a aba já preenchida com os textos
  antigos; editam um cartão e o momento atual, o aviso "Salvo" aparece e o histórico mostra a alteração sem o texto.
- Anexam a foto do momento atual e uma conquista com foto; removem a conquista com confirmação.
- "Baixar PDF" abre a janela de imprimir com a folha A4 (até 2 folhas no caso comum), sem o endereço do site impresso,
  sem foto vazia e sem cartão vazio.
- Pelo teclado (só Tab e Enter) dá para editar um cartão e o momento atual.
- Operação vê e baixa, sem campos editáveis; Especialista não vê a aba e recebe 404 nas rotas; Acompanhamento "só a
  carteira" não vê inscrição fora da carteira.
- Testes: `db` (RLS por perfil e carteira, função de exclusão, cópia idempotente), `api` (rotas, 404/403, 409,
  histórico sem valores, anonimizar/excluir), `shared` (tópicos com rótulo, mapeamento do legado), e2e (fluxo da Duda,
  Operação só leitura, Especialista sem aba, PDF renderiza, celular 375 sem rolagem lateral) + capturas 375/768/1024/1440.
- Roteiro completo no ITODEV com um login por perfil antes de pedir o deploy em produção.

## 10. Para o construtor decidir

Nomes de rotas, DTO e componentes; se a evolução vem na resposta da ficha ou em rota própria; a forma da janelinha de
conquista; o detalhe do rodapé do momento inicial (§5.4); como mostrar vídeo de
conquista no PDF (miniatura parada ou só o ícone e a data). Tudo que mudar regra de acesso, rótulo ou escopo volta para o
Gabriel.

## 11. Entrega

Uma história (NPAC-57), branch `feat/NPAC-57-aba-evolucao` a partir da `release/vX.Y` aberta. **Hoje não há release
aberta** (`v0.19` já entrou na `main`): abrir a próxima pelo `cut-release` precisa do sim do Gabriel. PR
`feat(NPAC-57): aba evolução na ficha do mentorado`, squash; `CLAUDE.md` atualizado no mesmo PR (mapa do módulo,
regras de acesso da evolução, cópia do legado).
