# Redesign do Chat (24/11/2026)

**Implementado no NPAC-73** (`apps/web/components/chat.tsx`, CSS em `apps/web/app/(app)/(comercial)/chat/chat.css`).
Nesta pasta ficaram só a A1 escolhida (`prototipo-a1.html`, `fotografar-a1.mjs`, `A1-*.png`, `comparativo-A1-375.png`);
as imagens e o protótipo da rodada 1 e da A2/A3 citados abaixo ficaram fora do PR (pedido do Gabriel); estão na branch
local `docs/chat-redesign-prototipos` da sessão do desenho.

**Decisões do Gabriel (24/11/2026): A1, com vidro; "1A, 2A, 3A, 4A".**

1. Mensagens antigas carregam sozinhas ao rolar até o topo (API já pagina com `before`/`hasMore`).
2. Prévia da última mensagem na lista de conversas: a API passa a mandar o começo da última mensagem, só de
   conversas que a pessoa já pode ler (mesma RLS do chat).
3. "Buscar pessoa" em Nova conversa: filtro na tela, sem mudar a API.
4. Tablet em pé (768 a 1023 px): a sidebar recolhe sozinha em ícones; um clique abre.

Vidro: cai para sólido com `prefers-reduced-transparency`. Antes de produção, testar no iPhone antigo do Igor.

## Rodada 2: A refinada, com cara de iOS 26 (Gabriel: "mais cara apple premium")

Comparação rápida: `comparativo-A1-375.png` (A de antes × A1 × A2 × A3).

| Variação | O que é | Trade-off |
| --- | --- | --- |
| **A1, recomendada** | Vidro só nos controles que flutuam (voltar, nome, `#`, caixa de escrever) | Mais "iOS 26"; o desfoque custa no iPhone antigo, mas só em áreas pequenas |
| A2 | Igual à A1, com controles sólidos, sem desfoque | Mais leve no iPhone antigo; um pouco menos de efeito |
| A3 | A1 com as suas bolhas em dourado | Mais "NPAC"; quebra a regra de cor (dourado = marca, progresso e seleção): precisa de aprovação |

O que muda da A para a A1 (nenhuma função nova além das 3 já marcadas abaixo):
- Topo como no iMessage: voltar num círculo de vidro à esquerda; foto do canal ou da pessoa e o nome no meio.
- As mensagens passam por baixo do topo e da caixa de escrever, que somem num degradê com desfoque leve.
- Bolhas de 17 px (texto padrão do iOS), cinza para os outros e degradê escuro para as suas, com o "rabinho" na última
  bolha do bloco; a hora sai da bolha e fica embaixo do bloco.
- Separador de dia só com texto ("Hoje"), sem pílula.
- Menção vira cartão de prévia, como link colado no iMessage: ícone `#` dourado, nome do lead e "Abrir ficha".
- Caixa de escrever em cápsula; a menção escolhida aparece dentro dela; o botão de enviar só aparece com texto.
- Busca de menção num cartão de vidro acima da cápsula, com o trecho digitado em negrito.
- Lista no estilo do app Mensagens: título grande, prévia em até 2 linhas, hora e `›`; "Nova conversa" é o ícone
  de escrever no canto (folha com cantos grandes e a lista de pessoas agrupada).
- Tablet em pé (768): a sidebar aparece recolhida em ícones (o trilho de 56 px que já existe). **Proposta:**
  recolher sozinha no tablet; hoje ela só recolhe quando a pessoa clica.

Cores derivadas só para o protótipo (não estão no `globals.css`): fundo da conversa `#fbfbfd`/`#0b0b0d`, bolha dos
outros `#ececef`/`#26262a`, degradês das suas bolhas e o vidro dos controles. Se aprovado, entram como tokens.

Imagens da A1 (claro e escuro):
- Celular 375: `A1-{lista,conversa,teclado,mencao,nova}-375[-escuro].png`
- Tablet em pé 768×1024: `A1-conversa-768[-escuro].png`; tablet deitado 1024×768: `A1-conversa-1024[-escuro].png`
- Computador 1440: `A1-conversa-1440[-escuro].png`
- A2 e A3 (claro): `A2-conversa-{375,1440}.png`, `A3-conversa-{375,1440}.png`
- Para refazer: `PLAYWRIGHT=<pasta do pacote playwright> node docs/prototipos/chat-redesign/fotografar-a1.mjs`

## Rodada 1: 3 opções

Pedido do Gabriel: "O Chat precisa ser feito um redesign". Só protótipo: nada mudou no app.
Comparação rápida: `comparativo-conversa-375.png` (hoje × A × B × C, conversa aberta no celular).

## Opções

| Opção | Ideia | Mensagens no celular (375×812) | Trade-off |
| --- | --- | --- | --- |
| **A, recomendada** | Bolhas agrupadas, estilo WhatsApp | 603 px (74%); com teclado e menção marcada, 361 px | Mais familiar para quem usa WhatsApp; mexe em mais coisas que a C |
| B | Fio da equipe, sem bolhas, estilo Slack/Linear | 553 px (68%); com teclado, 302 px | Mais denso e melhor para texto longo no computador; menos familiar no celular, caixa de escrever mais alta |
| C | Ajuste mínimo do desenho de hoje | 586 px (72%); com teclado, 383 px | Menor mudança e mais rápida de fazer; continua com hora em toda bolha e o `<select>` de "Nova conversa" |

Hoje: 348 px (43%) sem teclado; ~50 px com o teclado aberto.

## O que cada uma muda em relação a hoje

Comum às três:
- Some o título "Chat" de 34 px na conversa (no celular, a conversa vira a tela inteira com uma barra de 56 px).
- Lista de mensagens em fundo sólido (`--gl-solid`), sem `backdrop-filter` atrás do que rola.
- Separador de dia ("Hoje", "Segunda, 23 de nov.") e hora curta ("09:20") no lugar de "24 de nov., 09:20".
- Campo "#lead — buscar para mencionar" deixa de ficar sempre aberto: vira o botão `#` (A e C) ou "Mencionar lead" (B); a busca abre só ao tocar.
- Caixa de texto de 1 linha (cresce ao digitar); toque de 44 px e campo de 16 px; barra de baixo do celular continua.
- Lista de conversas com a hora da última mensagem (já vem da API em `lastMessageAt`).

Só na A: mensagens seguidas do mesmo autor ficam juntas (nome uma vez, hora só na última bolha); menção vira um
botão dentro da bolha que abre a ficha; "Nova conversa" vira botão que abre uma lista de pessoas com o cargo.
Só na B: sem bolhas; nome e hora no topo de cada bloco; a sua foto com anel dourado (como no Hoje); conversas
separadas em "Canal" e "Mensagens diretas"; menção como cartão "Abrir ficha".
Só na C: mantém cartões e bolhas de hoje, nome e hora em toda bolha, e o `<select>` de "Nova conversa".

Mantido em todas: canal Geral, DMs, menção `#lead` (e "#lead restrito"), selo dourado de não lidas, selo vermelho
do Chat no menu, convite "Ativar avisos", "Não enviada", Enter envia e Shift+Enter pula linha.

## Funções novas (marcadas "novo" nas imagens, para aprovar à parte)

1. **Ver mensagens anteriores**: hoje só aparecem as 50 últimas. A API já pagina (`before`/`hasMore`); falta a tela.
2. **Prévia da última mensagem** na lista de conversas: a API precisa mandar o texto (ou o começo dele).
3. **Buscar pessoa** em "Nova conversa" (A): filtro da lista de pessoas.

## Imagens

- A (claro e escuro): `opcao-A-{lista,conversa,teclado,mencao,nova}-375[-escuro].png`, `opcao-A-desktop-1440[-escuro].png`
- B e C (claro): `opcao-{B,C}-{lista,conversa,teclado}-375.png`, `opcao-{B,C}-desktop-1440.png`
- Hoje: `hoje-conversa-375.png` (captura do NPAC-72)

O teclado é simulado (291 px, tamanho do iPhone). Fonte das fotos: Geist (no iPhone o app usa SF Pro).
Para refazer: `PLAYWRIGHT=<pasta do pacote playwright> node docs/prototipos/chat-redesign/fotografar.mjs`.
