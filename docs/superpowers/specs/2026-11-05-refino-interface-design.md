# Refino da interface: base de interação, módulos na sidebar e Dashboard do Acompanhamento

Status: rascunho para revisão do Gabriel (05/11/2026). Opção escolhida: **A** (partes 1 → 2 → 3).

## Objetivo

Deixar o CRM com cara de produto premium (régua: Linear, Attio, Apple): todo controle responde a
hover, clique e foco com transição suave; o Acompanhamento ganha navegação na sidebar e um Dashboard
com hierarquia clara. **Nenhuma regra de negócio ou função do PDF da Eduarda muda**: só apresentação.

## Problemas medidos (branch `origin/hotfix/v0.6`)

- `button` e `quietButton` (`web/components/crm-ui.tsx`) sem `transition` e sem hover; 26 arquivos usam.
- 176 `<button>` em 45 arquivos; muitos com classes Tailwind soltas. 38 usam `active:scale-*`, que
  salta porque falta transição (no Tailwind v4 isso é a propriedade `scale`, não `transform`).
- `:focus-visible` global (`globals.css`) = `outline` dourado de 2 px que aparece de uma vez.
- Acompanhamento: sobretítulo + aba + H1 repetem "Dashboard"; sidebar com 1 item; 3 botões com o
  mesmo peso; cards de status altos dizendo "zero" três vezes; vazio = uma linha de texto.

## Parte 1 — Base de interação (CRM inteiro)

**Tokens** (`globals.css`, ao lado de `--ease-out` e `--ease-spring`, que já existem):

| Token | Valor | Uso |
|---|---|---|
| `--dur-press` | 80 ms | entrar no estado pressionado |
| `--dur-fast` | 140 ms | hover (cor, fundo, borda) |
| `--dur` | 200 ms | foco, seleção |
| `--dur-slow` | 320 ms | soltar o clique (com mola), abrir grupo da sidebar |

**Regra base** (`@layer base`, vale para todo `button`, `a`, `[role=button]`, `summary`, `input`,
`select`, `textarea`): `transition-property` cobre `color, background-color, border-color,
box-shadow, opacity, scale, translate, outline-color, outline-offset`, com `--dur-fast` e
`--ease-out`. Assim os 176 botões ficam suaves sem editar arquivo por arquivo. Classes com
`transition` próprio continuam valendo (mais específicas).

**Foco**: o anel segue em `outline` (não `box-shadow`, para não apagar as sombras do vidro). Em
repouso `outline: 2px solid transparent; outline-offset: 0`; no `:focus-visible` vira dourado com
`outline-offset: 2px`, animado em `--dur`. Resultado: o anel "cresce" em vez de piscar.

**Botões compartilhados** (`crm-ui.tsx` passa a apontar para classes em `globals.css`):

| Constante | Classe | Aparência |
|---|---|---|
| `button` | `.btn .btn-primary` | fundo `ink`, texto claro; hover clareia 8% |
| `quietButton` | `.btn .btn-secondary` | fundo claro do vidro + borda fina; hover fundo mais forte |
| `ghostButton` (novo) | `.btn .btn-ghost` | sem fundo; hover ganha fundo leve |
| `dangerButton` (novo) | `.btn .btn-danger` | texto/borda vermelhos; hover fundo vermelho leve |

Estados de todas: repouso → hover (só em `(hover: hover)`, para não "grudar" no toque) →
pressionado (`scale: .97` em `--dur-press`, volta em `--dur-slow` com `--ease-spring`) → foco (anel
acima) → desabilitado (`opacity .5`, sem hover, sem escala). `.btn-dark` (login, conta) ganha o
mesmo pressionar e foco.

**Correções pontuais**: elementos com `transition-colors` **e** `active:scale-*` perdem a escala
animada (o `transition-colors` sobrescreve a base). Achar com
`git grep -n "transition-colors.*active:scale\|active:scale.*transition-colors"` e trocar por
`transition-[color,background-color,scale]` ou tirar o `transition-colors`.

**Cards clicáveis** (`.lift`, já usado no dashboard comercial): hover sobe 2 px e reforça a borda,
em `--dur-slow`. Selecionado (ex.: filtro ativo) = barra dourada de 3 px na lateral que cresce de
cima para baixo (ideia do protótipo da Eduarda) no lugar do `ring-2` seco.

**Movimento reduzido**: a regra global de `prefers-reduced-motion` já zera durações; nada muda nela.

## Parte 2 — Módulos do Acompanhamento na sidebar

- `navItems` (`web/components/shell/nav-items.tsx`) ganha os sub-itens do módulo:
  Dashboard, Linha do tempo, Linha do tempo RDV e, no grupo "Dados", Importação e backup.
  Mesmos nomes, mesma ordem e mesmas rotas das abas de hoje (é o modelo mental da Eduarda).
- **Cargo Acompanhamento** (`commercial = false`): os 4 itens aparecem direto na sidebar, com os
  títulos de grupo "Acompanhamento" e "Dados" (mesmo estilo do título "Filtros salvos").
- **Diretoria** (`mentoria = true`): o item "Acompanhamento" continua; quando a rota começa com
  `/acompanhamento`, ele abre os 4 sub-itens indentados, com altura animada (`grid-template-rows`
  0fr → 1fr em `--dur-slow`). Fora do módulo, fechado.
- Sidebar recolhida (trilho de ícones): cargo Acompanhamento vê os 4 ícones; Diretoria vê só o do
  módulo, como hoje.
- Ctrl+K lista os 4 sub-itens para quem tem o módulo.
- Celular: `abas-mobile.tsx` continua no rodapé, sem mudança.
- **Sai**: `abas-modulo.tsx` (barra de abas do topo, desktop) e o sobretítulo "ACOMPANHAMENTO DE
  MENTORADOS" em `app/(app)/acompanhamento/layout.tsx`. O `IndicadorSalvo` desce para o cabeçalho
  de cada página.
- Rodapé da sidebar: "Sair" e "Alternar tema" viram `ghostButton` (mesmo lugar, mesmas ações).

## Parte 3 — Dashboard do Acompanhamento (`dashboard-view.tsx`, `dashboard-cards.tsx`)

- **Cabeçalho em 1 linha**: H1 "Dashboard" + "N mentorados" + `IndicadorSalvo`; à direita,
  "Colar planilha" como `button` (principal) e "Importar .json" / "Exportar .json" como
  `ghostButton`. Mesmas ações, mesmos nomes.
- **Status**: os 3 cards viram uma faixa compacta (ponto colorido, rótulo, número na mesma linha).
  O card **inteiro** é o botão de filtro (hoje só o topo é). Selecionado = barra dourada lateral
  (Parte 1). Com gente no status, os chips de nomes continuam abaixo; com zero, some o texto
  "Ninguém neste status." (o número já diz).
- **Vazio** (0 mentorados no total): bloco central com ícone, "Comece trazendo seus mentorados",
  "Cole a planilha ou importe um backup .json." e os dois botões. Os cards de status e a busca não
  aparecem enquanto está vazio.
- Busca, filtro por tipo de mentoria e tabela editável ficam como estão (ganham só a Parte 1).
- As outras páginas do módulo (Linha do tempo, RDV, Backup) recebem a Parte 1 e o cabeçalho sem
  sobretítulo; redesenho delas (ex.: linha do tempo vertical dourado → verde) fica para outro spec.

## Fora do escopo

Serifa nos números/nomes; botões em caixa alta; "+ Novo mentorado" e "Importar do formulário" do
protótipo da Eduarda (não estão no PDF); estado de carregamento com spinner; menu de usuário no
rodapé; mudança de cores ou tema.

## Entrega

- 3 histórias novas no Linear (uma por parte), 3 PRs, nessa ordem; a Parte 1 vai primeiro porque
  as outras usam os botões novos.
- Branches e PRs pelo `RELEASING.md` (release-kit). Antes da primeira branch: atualizar a `main`
  local (está atrás da `origin/main`) e confirmar se a `hotfix/v0.6` já entrou.

## Verificação (cada parte)

- `pnpm lint && pnpm typecheck`; e2e afetados (`acompanhamento-*.spec.ts`, navegação, admin).
- e2e novo da Parte 1: um botão compartilhado tem `transition-duration` > 0 e o foco por Tab
  mostra `outline-color` dourado; com `reducedMotion: 'reduce'`, duração ~0.
- e2e da Parte 2: logado como Eduarda, clicar nos 4 itens da sidebar e chegar em cada tela; logado
  como diretor, o grupo abre dentro do módulo e fecha fora; no celular, o rodapé continua.
- Capturas 375 / 768 / 1024 / 1440, claro e escuro, Dashboard vazio e com dados; conferir overflow,
  texto cortado, hover e pressionado. Comparar com o rascunho aprovado no chat.
- Orçamento de JS de `/leads` (< 150 KB gzip) segue passando: a Parte 1 é CSS.
