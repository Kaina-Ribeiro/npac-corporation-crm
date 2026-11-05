# Ficha da Linha do tempo em linha vertical — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a visão "Linha do tempo" da ficha (Acompanhamento) vira uma linha vertical do Momento
inicial (dourado) ao Depois da mentoria (verde), com campos discretos que crescem com o texto.

**Architecture:** só apresentação. A visão sai de `ficha-view.tsx` para `ficha-linha.tsx`; os campos
continuam `<textarea>` com os mesmos `aria-label` e o mesmo `useCampo` (salva no blur). Movimento e
altura automática só em CSS (`globals.css`), sem JS novo.

**Tech Stack:** Next 16, React, Tailwind v4, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-ficha-linha-do-tempo-design.md`

## Status

| Tarefa | Status |
|---|---|
| 0 Release, branch e docs | ✅ (release/v0.8 aberta; branch e docs criados pela sessão coordenadora) |
| 1 Separar a visão em `ficha-linha.tsx` (sem mudança visual) | ✅ |
| 2 Linha vertical e nós | ✅ |
| 3 Campos discretos e layout das seções | ⏳ |
| 4 Impressão, verificação visual e PR | ⏳ |

## Global Constraints

- Branch `feat/NPAC-36-ficha-linha-vertical` a partir de `origin/release/v0.8`; PR
  `feat(NPAC-36): ficha da linha do tempo em linha vertical`, squash. Sem push/PR sem o "sim".
- Commits sem linha de atribuição; `pnpm lint && pnpm typecheck` antes de cada commit.
- e2e: `preview_stop`, liberar 3000/4000 (o dev do projeto `comanda` pode ocupar a 3000: não
  derrube, use o build do e2e). Outra sessão rodando e2e: `E2E_DB=npac_e2e_f4 E2E_WEB_PORT=3400
  E2E_API_PORT=4400`. `productivity.spec.ts:72` é instável: repetir antes de investigar.
- Nada muda em API, banco, `ficha-lado-a-lado.tsx`, lista de fichas, RDV, Backup.
- `aria-label` dos campos não mudam: "Data de início", "Notas do momento inicial", "Tempo de
  mentoria", "Notas do momento atual", "<Pilar> antes"/"<Pilar> hoje", "<Item> antes"/"<Item>
  depois", "Data da conquista", "Descrição da conquista".
- Cores: dourado `--gold-deep` (claro) / `--gold` (escuro); verde = token novo `--ok` em `:root` e
  `.dark`, mesmo tom do ponto "Engajado" do Dashboard. Animações com `--dur`/`--ease-out`; hover só
  em `(hover: hover)`.
- Rail 28 px (≥768 px) / 20 px (<768 px); nós 24 px / 20 px; fio 2 px.
- Placeholders: "Adicionar…" genérico; nos pilares "Adicionar antes"/"Adicionar hoje"; nas notas
  atuais "Adicionar notas do momento atual".

## Review Focus

1. Texto longo colado nas notas (dezenas de linhas): o campo cresce sem cortar e sem rolagem
   interna → Tarefa 3.
2. Teclado: Tab percorre os campos na ordem das seções, e o foco mostra o anel → Tarefa 3.
3. Ficha antiga com só alguns campos preenchidos: vazios ficam em 1 linha, a linha não "quebra"
   → Tarefa 3.
4. Celular 375 px com pilares e evolução: sem rolagem horizontal, setas não empurram o texto →
   Tarefa 3.
5. Impressão de ficha parcialmente vazia: nada de "Adicionar…" no papel; a linha sai em cor →
   Tarefa 4.

---

### Tarefa 0: Release, branch e docs

- [ ] **Passo 1:** com o "sim" do Gabriel, Actions → Release → `cut-release` (abre `release/v0.8`).
- [ ] **Passo 2:** `git fetch origin && git checkout -b feat/NPAC-36-ficha-linha-vertical origin/release/v0.8`
  (com worktree próprio se a pasta principal estiver ocupada por outra sessão).
- [ ] **Passo 3:** commitar spec e plano: `docs(NPAC-36): spec e plano da ficha em linha vertical`.

### Tarefa 1: Separar a visão em `ficha-linha.tsx` (sem mudança visual)

**Files:**
- Create: `apps/web/components/acompanhamento/ficha-linha.tsx`
- Modify: `apps/web/components/acompanhamento/ficha-view.tsx` (o bloco `role="tabpanel"
  aria-label="Linha do tempo"`, ~linhas 253–450, e `Secao`, `Pilar`, `Evolucao`, `Conquista`, `ComoFica`)

**Interfaces:**
- Produces: `FichaLinha(props: FichaLinhaProps): JSX.Element` com `FichaLinhaProps` = o que o bloco
  usa hoje (ficha `f`, `midias`, handlers `guardar`, `evolucaoSalvar`, envio/remoção de mídia,
  conquistas). `useCampo` passa a ser exportado de `ficha-linha.tsx` e importado em `ficha-view.tsx`.

- [ ] **Passo 1:** `pnpm --filter @npac/web e2e e2e/acompanhamento-linha.spec.ts e2e/acompanhamento-impressao.spec.ts`
  → anotar que passa antes (linha de base).
- [ ] **Passo 2:** mover o bloco e os componentes, sem mudar classes nem textos.
- [ ] **Passo 3:** rodar os mesmos dois specs → PASS; `pnpm lint && pnpm typecheck`.
- [ ] **Passo 4:** commit `refactor(NPAC-36): visão linha do tempo da ficha em arquivo próprio`.

### Tarefa 2: Linha vertical e nós

**Files:**
- Modify: `ficha-linha.tsx` (`Secao` vira `NoLinha`), `apps/web/app/globals.css` (`.linha-rail`,
  `.linha-no`, `--ok`)
- Test: `apps/web/e2e/acompanhamento-linha.spec.ts`

**Interfaces:**
- Produces: `NoLinha({ titulo, sub, tom, marca, children }: { titulo: string; sub: string; tom:
  'inicio' | 'meio' | 'fim'; marca: React.ReactNode; children: React.ReactNode })` — `<section
  aria-label={titulo} data-tom={tom}>` com o nó (`.linha-no`, `aria-hidden`) e o conteúdo;
  o contêiner da visão tem `.linha-rail`.

- [ ] **Passo 1: teste que falha**

```ts
test('ficha em linha: 5 seções na ordem, início dourado e fim verde', async ({ page }) => {
  await entrar(page, `/acompanhamento/linha-do-tempo/${FICHA}`);
  const painel = page.getByRole('tabpanel', { name: 'Linha do tempo' });
  await expect(painel.locator('section[data-tom]')).toHaveCount(5);
  await expect(painel.locator('section[data-tom] h2')).toHaveText([
    'Momento inicial', 'Os 4 pilares', 'Evolução', 'Depois da mentoria', 'Galeria de conquistas',
  ]);
  await expect(painel.locator('section[data-tom]').first()).toHaveAttribute('data-tom', 'inicio');
  await expect(painel.locator('section[data-tom]').nth(3)).toHaveAttribute('data-tom', 'fim');
  await expect(painel.locator('.linha-rail')).toHaveCount(1);
});
```

- [ ] **Passo 2:** rodar o teste → FAIL.
- [ ] **Passo 3:** implementar `NoLinha` e o CSS com os valores de Global Constraints; tons:
  Momento inicial `inicio` (marca "1"), pilares e evolução `meio` ("2", "3"), Depois `fim` ("4"),
  Galeria `fim` (ícone de estrela). Fio em degradê dourado → verde atrás dos nós.
- [ ] **Passo 4:** rodar → PASS; specs de linha e impressão inteiros → PASS.
- [ ] **Passo 5:** commit `feat(NPAC-36): ficha da linha do tempo em linha vertical`.

### Tarefa 3: Campos discretos e layout das seções

**Files:**
- Modify: `ficha-linha.tsx` (classes `caixa`/`area` → `campo-quieto`; layout das seções),
  `globals.css` (`.campo-quieto`)
- Test: `apps/web/e2e/acompanhamento-linha.spec.ts`

**Interfaces:**
- Produces: classe `.campo-quieto` (repouso sem borda/fundo; hover fundo leve; foco = fundo e anel
  do `.field:focus`; `field-sizing: content`, `min-height` 1 linha; sem suporte: `min-height` 3
  linhas + `resize: vertical`, via `@supports not (field-sizing: content)`).

- [ ] **Passo 1: testes que falham**

```ts
test('campo vazio é discreto: placeholder e 1 linha', async ({ page }) => {
  await entrar(page, `/acompanhamento/linha-do-tempo/${FICHA}`);
  const fe = page.getByLabel('Fé antes', { exact: true });
  await expect(fe).toHaveAttribute('placeholder', 'Adicionar antes');
  expect((await fe.boundingBox())!.height).toBeLessThanOrEqual(44);
});
test('texto longo faz o campo crescer sem rolagem interna', async ({ page }) => {
  await entrar(page, `/acompanhamento/linha-do-tempo/${FICHA}`);
  const notas = page.getByLabel('Notas do momento inicial', { exact: true });
  const vazio = (await notas.boundingBox())!.height;
  await notas.fill(Array.from({ length: 30 }, (_, i) => `Linha ${i + 1}`).join('\n'));
  expect((await notas.boundingBox())!.height).toBeGreaterThan(vazio * 4);
  expect(await notas.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(2);
});
test('Tab segue a ordem das seções e o foco tem anel', async ({ page }) => {
  // foco em "Notas do momento inicial"; Tab até chegar em "Fé antes" antes de qualquer campo
  // de Evolução; no foco, boxShadow do campo contém a cor do anel dourado.
});
test('375 px: pilares e evolução sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await entrar(page, `/acompanhamento/linha-do-tempo/${FICHA}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
```

- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3:** aplicar `.campo-quieto` em todos os `textarea`/`input` da visão; placeholders
  de Global Constraints. Layout: Momento inicial = foto 96 px ao lado das notas (data embaixo da
  foto); pilares em grade 2×2 a partir de 768 px, cada card com "Antes" → "Hoje"; evolução uma
  linha por item `rótulo: antes → depois`; Depois da mentoria = foto ao lado das notas atuais +
  tempo de mentoria; galeria com o "+" como última miniatura. Prévia "Como fica" continua.
  No cabeçalho (`ficha-view.tsx`): "Exportar PDF" com `quietButton` e "Remover ficha" com
  `dangerButton` (classes de `apps/web/lib/button.ts`), no lugar das classes soltas de hoje.
- [ ] **Passo 4:** rodar os novos e os specs de linha/impressão → PASS.
- [ ] **Passo 5:** commit `feat(NPAC-36): campos discretos que crescem com o texto na ficha`.

### Tarefa 4: Impressão, verificação visual e PR

**Files:**
- Modify: `globals.css` (bloco `@media print` da ficha, ~linha 1129), `ficha-linha.tsx` (classe
  `campo-vazio` quando o valor está vazio)
- Test: `apps/web/e2e/acompanhamento-impressao.spec.ts`

- [ ] **Passo 1: teste que falha**

```ts
test('impressão: sem "Adicionar…" e linha em cor', async ({ page }) => {
  // ficha FICHA com só "Fé antes" preenchido; emulateMedia({ media: 'print' })
  const painel = page.getByRole('tabpanel', { name: 'Linha do tempo' });
  await expect(painel.locator('.campo-vazio').first()).toBeHidden();
  expect(await painel.locator('.linha-rail').evaluate((el) =>
    getComputedStyle(el).printColorAdjust)).toBe('exact');
  await expect(page.getByLabel('Fé antes', { exact: true })).toBeVisible();
});
```

- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3:** em `@media print`: `.campo-vazio { display: none }`, `::placeholder { color:
  transparent }`, `.linha-rail, .linha-no { print-color-adjust: exact }`, `.campo-quieto` sem fundo.
- [ ] **Passo 4:** rodar → PASS; `pnpm lint && pnpm typecheck`; suíte `pnpm --filter @npac/web e2e` → PASS.
- [ ] **Passo 5:** capturas 375/768/1024/1440, claro e escuro, `carla` e `diretor` pelo menu:
  ficha vazia, preenchida, foco num campo e prévia de impressão; comparar com o rascunho do chat.
- [ ] **Passo 6:** commit `feat(NPAC-36): impressão da ficha em linha vertical`; marcar ✅ no Status;
  mostrar capturas ao Gabriel e pedir o "sim" para push + PR.
