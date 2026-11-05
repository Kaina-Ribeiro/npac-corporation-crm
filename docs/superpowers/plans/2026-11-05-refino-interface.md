# Refino da interface — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** todo controle do CRM anima hover, clique e foco; o Acompanhamento ganha os módulos na
sidebar e um Dashboard com hierarquia clara.

**Architecture:** só CSS para o movimento (tokens + regra base em `@layer base` + classes `.btn-*`),
sem lib nova. A navegação do módulo vira dado em `nav-items.tsx` (arquivo sem `'use client'`),
consumido por sidebar e Ctrl+K. O Dashboard troca só a apresentação; ações, rotas e API não mudam.

**Tech Stack:** Next 16, React, Tailwind v4, Playwright (o web não tem vitest: os testes são e2e).

**Spec:** `docs/superpowers/specs/2026-11-05-refino-interface-design.md`

## Status

| Fase | Tarefa | Status |
|---|---|---|
| 0 | Preparar base, histórias e branch | ✅ |
| 1 | 1.1 Tokens, regra base e foco animado | ⏳ |
| 1 | 1.2 Variantes de botão | ⏳ |
| 1 | 1.3 Conflitos de escala, verificação visual e PR | ⏳ |
| 2 | 2.1 Dados da navegação e Ctrl+K | ⏳ |
| 2 | 2.2 Sidebar com grupos e sub-itens | ⏳ |
| 2 | 2.3 Tirar as abas do topo e o sobretítulo; verificação e PR | ⏳ |
| 3 | 3.1 Faixa de status | ⏳ |
| 3 | 3.2 Cabeçalho, ação principal e estado vazio; verificação e PR | ⏳ |

Uma sessão nova por fase. Atualize a coluna Status ao fechar cada tarefa (✅).

## Global Constraints

- Código de partida: `release/v0.7` cortada da `main` depois que a `hotfix/v0.6` entrar nela (Tarefa 0). As linhas citadas no plano vêm da `hotfix/v0.6`.
- Branch `feat/NPAC-<n>-<nome>` a partir da `release/vX.Y` aberta; PR `feat(NPAC-<n>): <resumo>` em
  minúsculas, squash (`RELEASING.md`). `release/*` só pela automação (`cut-release`).
- Sem push, PR, merge nem disparo de workflow sem o "sim" do Gabriel. Commits sem linha de atribuição.
- Antes de cada commit: `pnpm lint && pnpm typecheck`.
- e2e: `preview_stop`, liberar 3000/4000, rodar; depois `rm -rf apps/web/.next` e `preview_start npac-dev`.
- Tokens: `--dur-press: 80ms`, `--dur-fast: 140ms`, `--dur: 200ms`, `--dur-slow: 320ms`; curvas
  `--ease-out` e `--ease-spring` que já existem em `globals.css`.
- Pressionar: `scale: .97`. Foco: `outline: 2px solid #c2922e`, `outline-offset: 2px` (em repouso
  `transparent` e `0`). Hover só dentro de `@media (hover: hover)`.
- Movimento reduzido: a regra global de `prefers-reduced-motion` em `globals.css` não muda.
- Nada de lib nova no cliente; `/leads` < 150 KB gzip (teste existente).
- Textos exatos: grupos "Acompanhamento" e "Dados"; itens "Dashboard", "Linha do tempo",
  "Linha do tempo RDV", "Importação e backup"; vazio "Comece trazendo seus mentorados" e
  "Cole a planilha ou importe um backup .json."
- Playwright: `exact: true` e `filter({ visible: true })` (o layout mobile duplica controles).
- Usuários do e2e: `carla` (ACOMPANHAMENTO), `diretor` (DIRETOR), `ale` (SDR); senha `E2E_PASSWORD`.

## Decisões do plano (refinam o spec; confirmadas pelo Gabriel ao aprovar este plano)

- **Vazio sem botões duplicados:** com 0 mentorados, o cabeçalho do Dashboard não mostra ações; o
  bloco vazio tem "Colar planilha" e "Importar .json". Com dados, as 3 ações voltam ao cabeçalho.
  Motivo: dois "Colar planilha" na tela confundem e quebram os e2e de importação.
- **Indicador "Tudo salvo":** sai da linha do sobretítulo e entra no novo `CabecalhoModulo` das 4
  telas de lista; nas fichas (`linha-do-tempo/[id]`, `rdv/[id]`), que não têm H1, fica numa linha
  própria no topo, alinhado à direita.
- **Barra dourada e hover de card** são criados na Fase 3, onde são usados.

## Review Focus

1. Celular/toque: hover não pode ficar "grudado" depois do toque → Tarefa 1.2 testa com `hasTouch`.
2. Campos `.field` já têm anel próprio por `box-shadow`: o novo foco não pode desenhar anel duplo → Tarefa 1.1.
3. Grupo fechado da sidebar (Diretoria fora do módulo) não pode receber foco por Tab → Tarefa 2.2.
4. Tablet 768 px com a sidebar aberta: "Linha do tempo RDV" indentado não pode estourar a largura → Tarefa 2.2.
5. Elementos com `transition` próprio (sidebar, cards arrastáveis do Dashboard comercial) mantêm a
   animação deles → suíte e2e completa no fim de cada fase (`dashboard.spec.ts`, `sidebar.spec.ts`).

---

### Tarefa 0: Preparar base, histórias e branch

Precisa do Gabriel (deploy e workflow são ações externas).

Números das histórias: **NPAC-31** (Fase 1), **NPAC-32** (Fase 2), **NPAC-33** (Fase 3). Não há
tracker; os números só existem em branches e PRs, e o maior usado era NPAC-30.

- [x] **Passo 1:** `main` local atualizada com `origin/main` (05/11/2026).
- [x] **Passo 2:** (feito 05/11: `v0.6.3` em prod, PR #39 mergeado, `release/v0.7` aberta) a `hotfix/v0.6` tem 3 correções fora da `main` (#36, #37, #38; último rc
  `v0.6.3-rc`), e a #36 mexe em `nav-items.tsx`, que a Fase 2 altera. Por isso, antes do
  `cut-release`, o Gabriel fecha a hotfix: `deploy` do `v0.6.3-rc` em prod (se ainda não estiver)
  → PR `hotfix/v0.6` → `main` com merge commit. Só então Actions → Release → `cut-release`
  (abre `release/v0.7` a partir da `main`).
- [x] **Passo 3:** `git fetch origin && git checkout -b feat/NPAC-31-base-interacao origin/release/v0.7`;
  mover este plano e o spec para a branch e commitar: `docs(NPAC-31): spec e plano do refino da interface`.

---

## Fase 1 — Base de interação (PR 1)

### Tarefa 1.1: Tokens, regra base e foco animado

**Files:**
- Modify: `apps/web/app/globals.css` (`:root` com os tokens; `:focus-visible` atual na linha ~116;
  novo bloco em `@layer base`)
- Create: `apps/web/e2e/interacao.spec.ts`

**Interfaces:**
- Produces: variáveis CSS `--dur-press`, `--dur-fast`, `--dur`, `--dur-slow` (usadas nas Tarefas
  1.2, 2.2, 3.1).

- [ ] **Passo 1: testes que falham** em `e2e/interacao.spec.ts` (login como `carla`, abrir
  `/acompanhamento/dashboard`; botão = `getByRole('button', { name: 'Colar planilha', exact: true }).filter({ visible: true })`):

```ts
test('botão tem transição de cor e de escala', async ({ page }) => {
  const s = await btn.evaluate((el) => getComputedStyle(el));
  expect(s.transitionProperty).toContain('background-color');
  expect(s.transitionProperty).toContain('scale');
  expect(s.transitionDuration).not.toBe('0s');
});
test('foco por Tab: anel dourado com afastamento animado', async ({ page }) => {
  // Tab até o botão (até 40 vezes), conferindo document.activeElement.
  expect(await btn.evaluate((el) => getComputedStyle(el).outlineColor)).toBe('rgb(194, 146, 46)');
  expect(await btn.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe('2px');
  expect(await btn.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain('outline-offset');
});
test('campo .field focado não ganha anel duplo', async ({ page }) => {
  // Tab até "Buscar por nome": outlineStyle 'none' e boxShadow contém o dourado do .field:focus.
});
test.describe('movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' });
  test('duração ~0', async ({ page }) => {
    expect(parseFloat(await btn.evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThan(0.01);
  });
});
```

- [ ] **Passo 2:** `pnpm --filter @npac/web e2e e2e/interacao.spec.ts` → FAIL (sem `scale` na
  transição; `outline-offset` sem transição).
- [ ] **Passo 3:** em `globals.css`: tokens em `:root`; em `@layer base`, para
  `button, a, [role='button'], summary, input, select, textarea`: `transition-property: color,
  background-color, border-color, box-shadow, opacity, scale, translate, outline-color,
  outline-offset`, `transition-duration: var(--dur-fast)`, `transition-timing-function:
  var(--ease-out)`, `outline: 2px solid transparent`, `outline-offset: 0`. Trocar o `:focus-visible`
  atual por `outline-color: #c2922e; outline-offset: 2px` com `transition-duration: var(--dur)`.
  Manter `.field:focus { outline: none }`.
- [ ] **Passo 4:** rodar o mesmo comando → PASS.
- [ ] **Passo 5:** commit `feat(NPAC-31): transição e foco animado em todos os controles`.

### Tarefa 1.2: Variantes de botão

**Files:**
- Modify: `apps/web/app/globals.css` (classes `.btn`, `.btn-primary`, `.btn-secondary`,
  `.btn-ghost`, `.btn-danger`; `.btn-dark` existente, linha ~223)
- Modify: `apps/web/components/crm-ui.tsx:28-31`
- Test: `apps/web/e2e/interacao.spec.ts`

**Interfaces:**
- Consumes: tokens da 1.1.
- Produces (em `crm-ui.tsx`, strings de classe):
  `button = 'btn btn-primary'`, `quietButton = 'btn btn-secondary'`,
  `ghostButton = 'btn btn-ghost'`, `dangerButton = 'btn btn-danger'`. Os 26 arquivos que já
  importam `button`/`quietButton` não mudam.

- [ ] **Passo 1: testes que falham**:

```ts
test('secundário muda de fundo no hover', async ({ page }) => {
  const antes = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
  await btn.hover();
  await expect.poll(() => btn.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(antes);
});
test('pressionado encolhe para .97', async ({ page }) => {
  await btn.hover(); await page.mouse.down();
  await expect.poll(() => btn.evaluate((el) => getComputedStyle(el).scale)).toBe('0.97');
  await page.mouse.up();
});
test.describe('toque', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
  test('sem hover grudado depois do toque', async ({ page }) => {
    // tocar num botão que não navega (ex.: "Buscar por nome" fica fora; usar um .btn-secondary
    // visível no mobile) e conferir que backgroundColor volta ao de repouso.
  });
});
```

- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3:** `.btn`: `inline-flex`, `items-center`, `gap: 8px`, `border-radius: 12px`,
  `padding: 10px 16px`, `font: 600 14px/1 var(--font-sans)`; `:active:not(:disabled)` →
  `scale: .97` com `transition-duration: var(--dur-press)`; ao soltar volta com
  `var(--dur-slow) var(--ease-spring)` para `scale`. `:disabled` → `opacity: .5`, sem hover/escala.
  Cores: primary = `var(--ink)` / texto `var(--bg)`; secondary = fundo do `.field` em repouso +
  `inset 0 0 0 .5px` da borda; ghost = transparente; danger = `var(--danger)`. Hover (só
  `@media (hover: hover)`): primary clareia 8% (`color-mix`), secondary/ghost/danger ganham fundo
  `rgba(0,0,0,.05)` (escuro: `rgba(255,255,255,.08)`). `.btn-dark` ganha o mesmo `:active` e foco.
- [ ] **Passo 4:** rodar → PASS.
- [ ] **Passo 5:** commit `feat(NPAC-31): variantes de botão com hover e pressionar`.

### Tarefa 1.3: Conflitos de escala, verificação visual e PR

**Files:**
- Modify: os 7 arquivos achados por
  `git grep -n -E "transition-colors[^\"'\`]*active:scale|active:scale[^\"'\`]*transition-colors" -- apps/web`

- [ ] **Passo 1:** em cada ocorrência, trocar `transition-colors` por
  `transition-[color,background-color,scale]` (a regra base já dá a duração).
- [ ] **Passo 2:** `pnpm lint && pnpm typecheck` e a suíte e2e inteira
  `pnpm --filter @npac/web e2e` → tudo PASS (inclui `dashboard.spec.ts` e `sidebar.spec.ts`).
- [ ] **Passo 3:** verificação visual no painel (`preview_start npac-dev`), logado como `carla` e
  `diretor`: 375 / 768 / 1024 / 1440, claro e escuro; hover, pressionar e foco por Tab em Dashboard
  do Acompanhamento, Leads, Login. Guardar capturas no scratchpad.
- [ ] **Passo 4:** commit `fix(NPAC-31): escala animada onde a transição era só de cor`.
- [ ] **Passo 5:** mostrar as capturas ao Gabriel e pedir o "sim" para push + PR
  `feat(NPAC-31): base de interação com hover, pressionar e foco animados` na `release/v0.7`.

---

## Fase 2 — Módulos na sidebar (PR 2, branch `feat/NPAC-32-sidebar-acompanhamento` a partir da release depois do PR 1)

### Tarefa 2.1: Dados da navegação e Ctrl+K

**Files:**
- Modify: `apps/web/components/shell/nav-items.tsx` (sem `'use client'`)
- Modify: `apps/web/components/shell/command-palette.tsx:150`
- Modify: `apps/web/components/acompanhamento/abas-modulo.tsx` (deixa de exportar `ABAS`; ver 2.3)
- Test: `apps/web/e2e/acompanhamento-acesso.spec.ts` (teste "Carla vê só o Acompanhamento…")

**Interfaces:**
- Produces:
  - `NavItem` ganha `section?: 'Acompanhamento' | 'Dados'` e `children?: NavItem[]`.
  - `ACOMPANHAMENTO_SUBITEMS: NavItem[]` — os 4 itens (hrefs `/acompanhamento/dashboard`,
    `/linha-do-tempo`, `/rdv`, `/backup`), os 3 primeiros com `section: 'Acompanhamento'`, o último
    com `section: 'Dados'`; ícones novos em `ICONS` (traços 1.9, mesmo estilo).
  - `navItems(opts)`: `commercial === false` → `ACOMPANHAMENTO_SUBITEMS` (se `mentoria`);
    senão `ACOMPANHAMENTO_ITEM` vem com `children: ACOMPANHAMENTO_SUBITEMS`.
  - `paletteItems(opts): { href: string; label: string; icon: React.ReactNode }[]` — achata
    `children`; todo sub-item do módulo vira `Acompanhamento · <label>`.

- [ ] **Passo 1: teste que falha** — no teste da Carla, a sidebar passa a ter
  `toHaveText(['Dashboard', 'Linha do tempo', 'Linha do tempo RDV', 'Importação e backup'])`; no
  Ctrl+K, `opcoes.filter({ hasText: 'Acompanhamento · Linha do tempo RDV' })` tem 1.
- [ ] **Passo 2:** `pnpm --filter @npac/web e2e e2e/acompanhamento-acesso.spec.ts` → FAIL.
- [ ] **Passo 3:** implementar os dados acima; `command-palette.tsx` passa a usar `paletteItems`.
  A sidebar só lê `navItems` (render dos filhos vem na 2.2).
- [ ] **Passo 4:** rodar → PASS.
- [ ] **Passo 5:** commit `feat(NPAC-32): módulos do acompanhamento na navegação e no ctrl+k`.

### Tarefa 2.2: Sidebar com grupos e sub-itens

**Files:**
- Modify: `apps/web/components/shell/sidebar.tsx:41-61`
- Create: `apps/web/components/shell/nav-group.tsx` (`'use client'`: precisa do `usePathname`)
- Modify: `apps/web/app/globals.css` (`.side-sub`)
- Test: `apps/web/e2e/sidebar.spec.ts`

**Interfaces:**
- Consumes: `NavItem.section`, `NavItem.children`, `NavLink` (`nav-link.tsx`).
- Produces: `NavGroup({ item, linkClass, activeClass }: { item: NavItem; linkClass: string; activeClass: string })`
  — renderiza o link do pai e, abaixo, os filhos num `div.side-sub` com `data-open` quando
  `pathname` começa com `item.match`; fechado = `inert` + `grid-template-rows: 0fr`; aberto =
  `1fr`, transição `var(--dur-slow) var(--ease-out)`; filhos indentados 12 px.

- [ ] **Passo 1: testes que falham** em `sidebar.spec.ts`:

```ts
test('Carla navega pelos 4 itens da sidebar', async ({ page }) => {
  // login carla; para cada nome, clicar o link na 'Navegação lateral' e esperar a URL e aria-current="page".
  // Títulos de grupo "Acompanhamento" e "Dados" visíveis.
});
test('Diretoria: grupo abre dentro do módulo e fecha fora', async ({ page }) => {
  // login diretor; /leads → link 'Linha do tempo RDV' toBeHidden e seu wrapper tem atributo inert;
  // clicar 'Acompanhamento' → link visível; clicar → URL /acompanhamento/rdv.
});
test('tablet 768: sub-itens não estouram a sidebar', async ({ page }) => {
  // diretor em /acompanhamento/dashboard, viewport 768: .side-nav scrollWidth <= clientWidth.
});
test('trilho recolhido: Carla vê os 4 ícones com tooltip', async ({ page }) => {
  // recolher; hover em 'Linha do tempo RDV' → .side-tip com esse texto; títulos de grupo ocultos.
});
```

- [ ] **Passo 2:** `pnpm --filter @npac/web e2e e2e/sidebar.spec.ts` → FAIL.
- [ ] **Passo 3:** na sidebar, item com `children` → `NavGroup`; item com `section` diferente do
  anterior → título `h2` no estilo de "Filtros salvos" com classe `side-hide` (some no trilho).
  No trilho, `.side-sub` da Diretoria fica oculto (`side-hide`).
- [ ] **Passo 4:** rodar → PASS.
- [ ] **Passo 5:** commit `feat(NPAC-32): sidebar com grupos e sub-itens animados`.

### Tarefa 2.3: Tirar as abas do topo e o sobretítulo; verificação e PR

**Files:**
- Delete: `apps/web/components/acompanhamento/abas-modulo.tsx`
- Create: `apps/web/components/acompanhamento/cabecalho-modulo.tsx`
- Modify: `apps/web/app/(app)/acompanhamento/layout.tsx:17-26` (sai o `header` com sobretítulo,
  `IndicadorSalvo` e `AbasModulo`; fica `AbasMobile`)
- Modify: `dashboard-view.tsx:163-170`, `fichas-lista.tsx:84-90`, `rdv-lista.tsx` (H1 na linha ~79),
  `backup-view.tsx` (H1 na linha ~34) → usam `CabecalhoModulo`
- Modify: `app/(app)/acompanhamento/linha-do-tempo/[id]/page.tsx`, `rdv/[id]/page.tsx` → linha no
  topo com `IndicadorSalvo` à direita
- Modify: `apps/web/components/shell/sign-out-button.tsx`, `theme-toggle.tsx` (rodapé da sidebar:
  "Sair" e "Alternar tema" passam a usar `ghostButton`; mesmo lugar, mesmas ações)
- Test: `apps/web/e2e/acompanhamento-mobile.spec.ts:128-132`

**Interfaces:**
- Produces: `CabecalhoModulo({ titulo, descricao, acoes }: { titulo: string; descricao?: React.ReactNode; acoes?: React.ReactNode })`
  — H1 (mesmas classes de hoje), descrição embaixo, `IndicadorSalvo` ao lado do título, `acoes` à
  direita; quebra em coluna abaixo de `md`.

- [ ] **Passo 1: teste que falha** — trocar o teste "desktop: … abas do módulo no topo" por:
  em 1280 px, `navigation` "Módulos do acompanhamento" tem 0; o texto "Acompanhamento de
  mentorados" tem 0; `getByRole('status').filter({ hasText: 'Tudo salvo' })` tem 1 no Dashboard e
  1 numa ficha da Linha do tempo.
- [ ] **Passo 2:** rodar `e2e/acompanhamento-mobile.spec.ts` → FAIL.
- [ ] **Passo 3:** implementar conforme Files/Interfaces.
- [ ] **Passo 4:** rodar → PASS; depois a suíte inteira `pnpm --filter @npac/web e2e` → PASS.
- [ ] **Passo 5:** verificação visual como na 1.3 (carla e diretor, 4 larguras, 2 temas), clicando
  pelo menu, não por URL. Commit `feat(NPAC-32): tira as abas do topo do acompanhamento`.
- [ ] **Passo 6:** capturas ao Gabriel; com o "sim", push + PR
  `feat(NPAC-32): módulos do acompanhamento na sidebar`.

---

## Fase 3 — Dashboard do Acompanhamento (PR 3, branch `feat/NPAC-33-dashboard-acompanhamento`)

### Tarefa 3.1: Faixa de status

**Files:**
- Modify: `apps/web/components/acompanhamento/dashboard-cards.tsx:49-121`
- Modify: `apps/web/app/globals.css` (`.card-click`, `.card-sel`)
- Test: `apps/web/e2e/acompanhamento-dashboard.spec.ts`

**Interfaces:**
- Consumes: tokens da 1.1. Props de `DashboardCards` não mudam.
- Produces: `.card-click` (hover em `(hover: hover)` e sem movimento reduzido: `translate: 0 -2px`
  + borda mais forte, `var(--dur-slow)`); `.card-sel` (`::before` 3 px `var(--gold)` na lateral
  esquerda, `scale: 1 0` → `1 1` com `transform-origin: top`, `var(--dur-slow) var(--ease-out)`).

- [ ] **Passo 1: testes que falham** (com 3 mentorados importados, um por status, como os testes
  existentes fazem):

```ts
test('o card inteiro filtra', async ({ page }) => {
  const card = page.getByRole('button', { name: /Em risco/ });
  await card.locator('text=1').first().click();      // clicar no número, não no rótulo
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toHaveClass(/card-sel/);
});
test('zero não repete "Ninguém neste status"', async ({ page }) => {
  await expect(page.getByText('Ninguém neste status.')).toHaveCount(0);
});
```

- [ ] **Passo 2:** `pnpm --filter @npac/web e2e e2e/acompanhamento-dashboard.spec.ts` → FAIL.
- [ ] **Passo 3:** cada card = um único `<button aria-pressed>` com `card-click` (e `card-sel`
  quando selecionado) contendo ponto colorido, rótulo e número na mesma linha; `ring-2` sai. Os
  chips de nomes ficam abaixo, fora do botão, só quando `n > 0`.
- [ ] **Passo 4:** rodar → PASS.
- [ ] **Passo 5:** commit `feat(NPAC-33): faixa de status compacta e clicável`.

### Tarefa 3.2: Cabeçalho, ação principal e estado vazio; verificação e PR

**Files:**
- Modify: `apps/web/components/acompanhamento/dashboard-view.tsx:162-201` e `:296-302`
- Test: `apps/web/e2e/acompanhamento-dashboard.spec.ts`, `acompanhamento-importacao.spec.ts`

**Interfaces:**
- Consumes: `CabecalhoModulo` (2.3), `button` e `ghostButton` (1.2).

- [ ] **Passo 1: testes que falham**:

```ts
test('vazio convida e não duplica ações', async ({ page }) => {
  // sem mentorados
  await expect(page.getByText('Comece trazendo seus mentorados')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Colar planilha', exact: true }).filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Em risco/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Colar planilha', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('dialog', { name: 'Importar no Dashboard' })).toBeVisible();
});
test('com dados: 3 ações no cabeçalho, Colar planilha é a principal', async ({ page }) => {
  // 3 mentorados
  await expect(page.getByText('3 mentorados', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Colar planilha', exact: true }).filter({ visible: true })).toHaveClass(/btn-primary/);
  await expect(page.getByRole('button', { name: 'Exportar .json', exact: true }).filter({ visible: true })).toHaveClass(/btn-ghost/);
});
```

- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3:** cabeçalho via `CabecalhoModulo` com `descricao` = `"{totalBase} mentorados"`
  (`1 mentorado` no singular) e `acoes` só quando `totalBase > 0`. Vazio (`totalBase === 0`): bloco
  com borda tracejada, ícone de pessoas, os dois textos exatos e os botões "Importar .json"
  (`quietButton`) e "Colar planilha" (`button`); faixa de status, busca e tabela não aparecem.
- [ ] **Passo 4:** rodar os dois specs → PASS; suíte inteira → PASS.
- [ ] **Passo 5:** verificação visual (vazio e com dados; carla e diretor; 4 larguras; 2 temas),
  comparando com o rascunho aprovado no chat. Commit
  `feat(NPAC-33): cabeçalho com ação principal e estado vazio no dashboard`.
- [ ] **Passo 6:** capturas ao Gabriel; com o "sim", push + PR
  `feat(NPAC-33): dashboard do acompanhamento com hierarquia clara`.
