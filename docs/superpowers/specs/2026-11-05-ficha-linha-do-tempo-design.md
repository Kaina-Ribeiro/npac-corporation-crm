# Fase 4 do refino: ficha da Linha do tempo como linha vertical

Status: rascunho para revisão do Gabriel (05/11/2026). Opção escolhida: **A, linha vertical**.
Base: refino v0.7.5 (botões `.btn-*`, tokens `--dur-*`, `CabecalhoModulo`) já em produção.

## Objetivo

A ficha da Linha do tempo é, pelo PDF da Eduarda, "prova concreta do resultado da mentoria"
(como chegou → como está agora). Hoje ela parece um formulário: caixas grandes vazias em grade.
A visão "Linha do tempo" da ficha passa a contar essa história numa linha vertical, do Momento
inicial (dourado) ao Depois da mentoria (verde). **Só apresentação**: dados, API, regras de
salvamento e a visão "Lado a lado" não mudam.

## Regras do PDF que continuam valendo

- Cards de evolução editados direto na caixa; salvam ao sair do campo (fila, regra 2).
- Notas: cada Enter vira tópico; "Rótulo: texto" destaca o rótulo (prévia "Como fica" fica).
- Ficha vista em linha do tempo **ou** lado a lado, e impressa (Exportar PDF).
- Seções: Momento inicial, Os 4 pilares, Evolução, Depois da mentoria, Galeria de conquistas.
- Exclusão pede confirmação; o "×" de foto/vídeo remove na hora. Mídia fora do registro.

## Desenho

**Linha (rail)**
- Coluna fixa à esquerda (28 px no desktop, 20 px abaixo de 768 px) com um fio de 2 px que liga
  as seções. O fio vai do dourado (topo) ao verde (fim), em degradê. Dourado = `--gold-deep` no
  tema claro e `--gold` no escuro (contraste, como a barra da Fase 3). Verde = token novo
  `--ok` em `:root`/`.dark`, no mesmo tom do ponto "Engajado" do Dashboard.
- Um nó (círculo de 24 px, 20 px no celular) por seção, alinhado ao título:
  1 Momento inicial (borda dourada) · 2 Os 4 pilares · 3 Evolução (borda neutra) ·
  4 Depois da mentoria (borda verde) · Galeria (verde, ícone de estrela).
- Título da seção + subtítulo curto na mesma linha (ex.: "Momento inicial · 12/03/2025";
  "Depois da mentoria · momento atual"). Os textos de subtítulo atuais continuam.

**Campos discretos (`.campo-quieto`)**
- Continuam `<textarea>` com o mesmo `aria-label` e o mesmo `useCampo` (salva no blur).
- Em repouso: sem borda nem fundo; vazio mostra o placeholder "Adicionar…" (ou o rótulo do campo:
  "Adicionar antes", "Adicionar hoje", "Adicionar notas do momento atual") em `text-ink3`, com
  altura de 1 linha. Preenchido: o texto aparece como parágrafo.
- Hover (só mouse): fundo leve. Foco: fundo do `.field` + anel dourado (o mesmo do `.field:focus`),
  animado em `--dur`.
- Altura acompanha o texto: `field-sizing: content` com `min-height` de 1 linha; onde o navegador
  não suporta, fica `min-height` de 3 linhas e `resize: vertical` (sem JS novo).

**Seções**
- Momento inicial: foto de antes (miniatura 96 px com o envio atual) ao lado das notas livres;
  data de início continua no campo atual, abaixo da foto.
- Os 4 pilares: grade 2×2 a partir de 768 px (1 coluna abaixo); cada pilar é um card com o nome e
  dois campos "Antes" → "Hoje" separados por uma seta.
- Evolução: cada linha "rótulo: antes → depois" (os campos atuais em linha, seta no meio).
- Depois da mentoria: foto de depois ao lado das notas do momento atual + tempo de mentoria.
- Galeria: grade de miniaturas atual, com o "+" de adicionar como última miniatura.

**Cabeçalho da ficha**
- Igual, com os botões da Fase 1: "Exportar PDF" `quietButton`, "Remover ficha" `dangerButton`;
  o seletor "Linha do tempo / Lado a lado" fica como está.

**Impressão**
- A linha e os nós imprimem (`print-color-adjust: exact`). Placeholders não imprimem
  (`::placeholder` transparente em `@media print`); campos vazios somem da impressão; navegação e
  botões continuam escondidos (teste atual).

## Arquivos

- `web/components/acompanhamento/ficha-view.tsx` (579 linhas): a visão Linha do tempo sai para
  `ficha-linha.tsx` (seções + `NoLinha`), e `ficha-view.tsx` fica com cabeçalho, alternância de
  visão e estado. `Pilar`, `Evolucao` e `Conquista` vão junto para `ficha-linha.tsx`.
- `web/app/globals.css`: `.linha-rail`, `.linha-no`, `.campo-quieto` e o bloco de impressão.
- Sem mudança em API, banco, `ficha-lado-a-lado.tsx`, lista de fichas, RDV ou Backup.

## Fora do escopo

Lista de fichas, ficha do RDV, tela de Importação e backup (fases próprias); modo "só leitura";
qualquer campo novo; mudança na visão Lado a lado.

## Entrega

Uma história (**NPAC-36**), um PR na próxima release (`release/v0.8`, aberta pelo `cut-release`
com o "sim" do Gabriel), squash.

## Verificação

- e2e atuais de `acompanhamento-linha.spec.ts` e `acompanhamento-impressao.spec.ts` passam sem
  mudar os seletores (labels dos campos iguais).
- e2e novos: as 5 seções aparecem nessa ordem dentro da linha; campo vazio tem placeholder
  "Adicionar…" e altura ≤ 44 px; campo com 5 linhas fica mais alto que vazio; impressão não mostra
  placeholder; 375 px sem rolagem horizontal.
- `pnpm lint && pnpm typecheck`; suíte e2e inteira.
- Capturas 375/768/1024/1440, claro e escuro, `carla` e `diretor` pelo menu: ficha vazia, ficha
  preenchida, foco num campo, impressão; comparar com o rascunho aprovado no chat.
