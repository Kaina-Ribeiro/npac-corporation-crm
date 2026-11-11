# Filtros lembrados (NPAC-46) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** filtros, abas e períodos de todas as telas continuam iguais ao trocar de tela, de aba ou dar F5, e os filtros valem assim que escolhidos.

**Architecture:** regras puras de leitura/gravação em `@npac/shared/screen-prefs` (testadas no vitest do shared); no web, nome/caminho do cookie por tela, gravação no navegador e um gancho que reaplica o cookie mais novo ao voltar do navegador. Telas com estado no React leem o cookie no servidor e já buscam filtrado; telas com estado na URL (Acompanhamento) guardam a última URL de cada aba. Busca por texto fica num mapa em memória.

**Tech Stack:** Next 16 (App Router), React 19, TypeScript, vitest (shared), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-11-11-filtros-lembrados-design.md`

## Global Constraints

- Cookie: `Path` da tela, `SameSite=Lax`, `Secure` no https, 1 ano; nome = `userCookieName(prefixo, userId)`; valor = `URLSearchParams` só com chaves validadas; vazio apaga; mais de 1024 caracteres não grava.
- Nunca guardar texto digitado, nome, telefone, e-mail ou @ em cookie, URL ou storage.
- `@npac/shared/screen-prefs` sem zod (vai ao cliente).
- JS da primeira carga de `/leads` < 150 KB gzip (`e2e/login.spec.ts:399`); hoje ~149,4.
- Textos novos: "Limpar filtros". Botões que saem: "Aplicar filtros", "Filtrar Hoje", "Buscar" (Pipeline), "Atualizar relatório".
- Semana da agenda (`dia`) e mês do Controle mensal (`mes`) só valem no mesmo dia de Brasília.
- URL com parâmetro lembrado vence o cookie e passa a ser o lembrado.
- e2e: `preview_stop` e liberar 3000/4000 antes; depois `rm -rf apps/web/.next` e `preview_start npac-dev`.
- Commits `feat(NPAC-46): …` em minúsculas, sem linha de atribuição.

## Review Focus

1. Cookie com ID de quem saiu da equipe ou etapa excluída: a tela abre sem esse filtro, sem erro (teste no Task 1).
2. Filtro lembrado que a API recusa (intervalo sem data): a tela abre sem filtro e apaga o cookie (teste no Task 3).
3. Outra pessoa entra no mesmo navegador: não herda filtro nem busca (teste no Task 3).
4. Voltar do navegador depois de trocar o filtro: aparece o mais recente, não o da primeira carga (teste no Task 3).
5. Termo de busca nunca aparece em `context.cookies()` nem na URL (teste no Task 3).

## Arquivos

| Arquivo | Papel |
|---|---|
| `packages/shared/src/screen-prefs.ts` (novo) | `readPrefs`, `writePrefs`, validadores, regras de Leads/Relatórios/Dashboard, `readTabUrls`/`writeTabUrls`, `brasiliaDay` |
| `packages/shared/test/screen-prefs.test.ts` (novo) | testes das regras |
| `packages/shared/package.json` | export `./screen-prefs` |
| `apps/web/lib/screen-prefs.ts` (novo) | `PREFS` (prefixo e caminho por tela), `prefsCookie`, `rememberPrefs` |
| `apps/web/lib/use-latest-prefs.ts` (novo, `'use client'`) | `useLatestPrefs` |
| `apps/web/lib/screen-memory.ts` (novo) | `recall`, `keep` |
| `apps/web/lib/report-presets.ts` (novo) | `Preset` e `presetFilters`, tirados de `components/reports.tsx` para o servidor usar |
| `apps/web/components/acompanhamento/lembrar-url.tsx` (novo, `'use client'`) | grava a última URL da aba |
| telas e páginas citadas em cada task | uso |
| `apps/web/e2e/preferencias.spec.ts`, `apps/web/e2e/acompanhamento-v2-preferencias.spec.ts` (novo) | e2e |

---

## PR 1 — Comercial

### Task 1: Regras puras em `@npac/shared/screen-prefs` — Status: ✅

**Files:** Create `packages/shared/src/screen-prefs.ts`, `packages/shared/test/screen-prefs.test.ts`; Modify `packages/shared/package.json` (exports, igual a `./reminders`).

**Interfaces — Produces:**
```ts
export type PrefRule = (value: string) => boolean;
export type PrefRules = Record<string, PrefRule>;
export function readPrefs(raw: string | undefined, rules: PrefRules): Record<string, string>;
export function writePrefs(values: Record<string, string | undefined>, rules: PrefRules): string; // ordem das chaves = ordem de `rules`
export const oneOf: (list: readonly string[]) => PrefRule;
export const isoDate: PrefRule;   // /^\d{4}-\d{2}-\d{2}$/
export function brasiliaDay(at?: Date): string; // 'AAAA-MM-DD' em America/Sao_Paulo
export const LEAD_FILTER_DEFAULTS: { sort: 'createdAt'; direction: 'desc' };
export function leadFilterRules(c: Pick<LeadCatalog, 'stages' | 'team'>): PrefRules;
// stage (keys de c.stages), tier (TIERS), source (LEAD_SOURCE_OPTIONS+LEGACY_LEAD_SOURCES+FORM_LEAD_SOURCE),
// sdrId (team canProspect), closerId (team canClose), period (TODAY|TOMORROW|WEEK|OVERDUE|NO_DATE|RANGE),
// from/to (isoDate), sort (nextContactAt|meetingAt|name), direction (asc)  — padrões não entram
export function readLeadFilters(raw: string | undefined, c: Pick<LeadCatalog, 'stages' | 'team'>): Record<string, string>;
// = readPrefs + tira period=RANGE sem from e to, e tira from/to sem RANGE
export function reportRules(c: Pick<LeadCatalog, 'stages' | 'team'>, productIds: readonly string[], head: boolean, role: Role): PrefRules;
// period (TODAY|RANGE; MONTH é o padrão), from/to, stage, tier, source; sdrId/closerId só se head;
// productId só para quem o formulário mostra (mesma condição do JSX de reports.tsx)
export function dashboardRules(c: Pick<LeadCatalog, 'team'>, head: boolean): PrefRules;
// preset (TODAY|WEEK; MONTH é o padrão), sdrId só se head (team canProspect)
export type TabUrls = { last?: string; tabs: Record<string, string> };
export function readTabUrls(raw: string | undefined, tabs: readonly string[], today: string, daily: readonly string[]): TabUrls;
export function writeTabUrls(saved: TabUrls, tab: string, query: string, today: string): string;
// formato: URLSearchParams { <aba>: <query da aba>, last: <aba>, d: <today> }; `daily` some das queries se d ≠ today
```

- [ ] **Step 1: Testes que falham** (`describe('screen-prefs')`)

```ts
const rules = { stage: oneOf(['SONDAGEM', 'VENDA']), from: isoDate };
it('lê só chave e valor aceitos', () => {
  expect(readPrefs('stage=VENDA&from=2026-11-01&x=1', rules)).toEqual({ stage: 'VENDA', from: '2026-11-01' });
  expect(readPrefs('stage=OUTRA&from=01%2F11%2F2026', rules)).toEqual({});
  expect(readPrefs(undefined, rules)).toEqual({});
});
it('grava sem vazio nem chave desconhecida', () => {
  expect(writePrefs({ from: '2026-11-01', stage: 'VENDA', x: '1' }, rules)).toBe('stage=VENDA&from=2026-11-01');
  expect(writePrefs({ stage: '' }, rules)).toBe('');
});
it('filtro de leads derruba quem saiu, padrão e intervalo incompleto', () => {
  const c = { stages: [{ key: 'SONDAGEM' }], team: [{ id: 'u1', canProspect: true, canClose: false }] } as never;
  expect(readLeadFilters('sdrId=u9&stage=SONDAGEM&sort=createdAt&direction=desc', c)).toEqual({ stage: 'SONDAGEM' });
  expect(readLeadFilters('period=RANGE&from=2026-11-01', c)).toEqual({});
  expect(readLeadFilters('from=2026-11-01&to=2026-11-02', c)).toEqual({});
});
it('relatório: SDR não lembra SDR, closer nem produto', () => { /* reportRules(..., head=false, 'SDR') ignora sdrId, closerId, productId */ });
it('última URL por aba: semana e mês só no mesmo dia', () => {
  const raw = writeTabUrls({ tabs: {} }, 'agenda', 'aba=agenda&dia=2026-11-09&condutor=u1', '2026-11-10');
  const tabs = ['agenda', 'controle', 'sem'];
  expect(readTabUrls(raw, tabs, '2026-11-10', ['dia', 'mes'])).toEqual({ last: 'agenda', tabs: { agenda: 'aba=agenda&dia=2026-11-09&condutor=u1' } });
  expect(readTabUrls(raw, tabs, '2026-11-11', ['dia', 'mes'])).toEqual({ last: 'agenda', tabs: { agenda: 'aba=agenda&condutor=u1' } });
  expect(readTabUrls('outra=aba%3Doutra&last=outra', tabs, '2026-11-10', [])).toEqual({ tabs: {} });
});
it('brasiliaDay usa o dia de Brasília', () => {
  expect(brasiliaDay(new Date('2026-11-11T02:30:00Z'))).toBe('2026-11-10');
});
```

- [ ] **Step 2:** `pnpm --filter @npac/shared test -- screen-prefs` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar as funções acima em `packages/shared/src/screen-prefs.ts`; export no `package.json`.
- [ ] **Step 4:** `pnpm --filter @npac/shared test -- screen-prefs` → PASS; `pnpm --filter @npac/shared build`.
- [ ] **Step 5:** Commit `feat(NPAC-46): regras dos filtros lembrados`.

### Task 2: Ferramentas do web — Status: ✅

**Files:** Create `apps/web/lib/screen-prefs.ts`, `apps/web/lib/use-latest-prefs.ts`, `apps/web/lib/screen-memory.ts`, `apps/web/lib/report-presets.ts`; Modify `apps/web/components/reports.tsx` (importa `Preset`/`presetFilters` do arquivo novo).

**Interfaces — Produces:**
```ts
// lib/screen-prefs.ts (sem 'use client')
export const PREFS: {
  leads: { prefix: 'npac_f_leads'; path: '/leads' }; pipeline: { prefix: 'npac_f_pipe'; path: '/pipeline' };
  dashboard: { prefix: 'npac_f_dash'; path: '/dashboard' }; reports: { prefix: 'npac_f_rel'; path: '/relatorios' };
  admin: { prefix: 'npac_f_admin'; path: '/admin' }; chat: { prefix: 'npac_f_chat'; path: '/chat' };
  playbook: { prefix: 'npac_m_playbook'; path: '' };              // só memória
  acFila: { prefix: 'npac_f_ac_fila'; path: '/acompanhamento/fila' };
  acMentorados: { prefix: 'npac_f_ac_ment'; path: '/acompanhamento/mentorados' };
  acReunioes: { prefix: 'npac_f_ac_reun'; path: '/acompanhamento/reunioes' };
  acPlano: { prefix: 'npac_f_ac_plano'; path: '/acompanhamento/plano' };
  acConfig: { prefix: 'npac_f_ac_config'; path: '/acompanhamento/configuracoes' };
  acOnboarding: { prefix: 'npac_f_ac_onb'; path: '/acompanhamento/onboarding' };
  acFicha: { prefix: 'npac_f_ac_ficha'; path: '/acompanhamento/ficha' };
};
export type Screen = keyof typeof PREFS;
export function prefsCookie(screen: Screen, userId: string): string;      // userCookieName(prefix, userId)
export function rememberPrefs(screen: Screen, cookie: string, value: string): void; // savePreference; ignora > 1024
// lib/use-latest-prefs.ts ('use client')
export function useLatestPrefs(cookie: string, serverValue: string, apply: (saved: string) => void): void;
// uma vez ao montar: se (readPreference(cookie) ?? '') !== serverValue, chama apply com o valor do cookie
// lib/screen-memory.ts — mapa do módulo; chave = nome do cookie (já tem o hash da pessoa)
export function recall<T>(key: string): T | undefined;
export function keep(key: string, value: unknown): void;
// lib/report-presets.ts
export type Preset = 'TODAY' | 'WEEK' | 'MONTH';
export function presetFilters(p: Preset, now?: Date): Record<string, string>;
```

- [ ] **Step 1:** Criar os quatro arquivos; mover `Preset`, `SP`, `spDate`, `presetFilters` de `reports.tsx` para `report-presets.ts`.
- [ ] **Step 2:** `pnpm --filter @npac/web typecheck && pnpm --filter @npac/web lint` → sem erros (os testes chegam pelas telas, Tasks 3–7).
- [ ] **Step 3:** Commit `feat(NPAC-46): cookie, memoria e gancho dos filtros lembrados`.

### Task 3: Leads — Status: ✅

**Files:** Modify `apps/web/app/(app)/(comercial)/leads/page.tsx`, `apps/web/components/leads-browser.tsx`, `apps/web/components/lead-filters.tsx`; Test `apps/web/e2e/preferencias.spec.ts`.

**Interfaces — Consumes:** Task 1 (`readLeadFilters`, `leadFilterRules`, `writePrefs`, `readPrefs`, `LEAD_FILTER_DEFAULTS`), Task 2 (`prefsCookie('leads')`, `rememberPrefs`, `useLatestPrefs`, `recall`/`keep`).
**Produces:** `LeadFilters` com props `values`, `form`, `catalog`, `onApply(): void` (chamado no `onChange` do contêiner dos campos) e `onClear?(): void` (botão "Limpar filtros" quando há filtro fora do padrão); sem "Aplicar filtros". Pipeline (Task 4) usa o mesmo.

Página: `view` da URL vence; sem ela, `view` do cookie (se ainda existe em `/api/views`); sem view, `readLeadFilters(cookie, catalog)`. Busca inicial com eles; 400 → busca sem filtro e passa `resetPrefs`. Props novas de `LeadsBrowser`: `cookie`, `prefs` (valor normalizado usado), `initialFilters`, `resetPrefs?`.
Tela: grava `view=<id>` ao abrir filtro salvo, os filtros (sem padrões) ao aplicar, `''` ao limpar; `keep(cookie, { q, page })` após cada busca e, ao montar, `recall` → refaz a busca se houver termo ou página > 1; intervalo incompleto não busca.

- [ ] **Step 1: e2e que falham** (`test.describe('filtros lembrados: leads')`, login `ale@npac.com.br` salvo onde indicado)
  - `leads lembra o filtro ao trocar de tela e no F5`: escolhe Perfil = P0 (sem clicar em botão) → lista só P0 → menu Pipeline → menu Leads → select Perfil = P0 e lista só P0 → `page.reload()` → igual.
  - `limpar filtros vale também ao voltar`: com P0 → "Limpar filtros" → menu Pipeline → menu Leads → Perfil = "Todos".
  - `busca volta ao trocar de tela, some no F5 e nunca vai para cookie ou URL`: busca `@pref.busca` + Enter → menu Hoje → menu Leads → campo com o termo e resultado filtrado; `context.cookies()` e `page.url()` sem `pref.busca`; reload → campo vazio.
  - `filtro salvo aberto pela barra lateral fica lembrado`: cria view pela API, abre `/leads?view=<id>` → menu Hoje → menu Leads → chip da view pressionado.
  - `voltar do navegador mostra o filtro mais recente`: P0 → abre um lead → `page.goBack()` → P0; troca para P1 → abre lead → `goBack()` → P1.
  - `outra pessoa no mesmo navegador não herda`: ale filtra P0 e busca termo → sai → login `murilo@npac.com.br` → Perfil "Todos" e busca vazia.
  - `filtro inválido no cookie abre sem filtro e é limpo`: `context.addCookies` com `period=RANGE&from=2026-11-01` no cookie de ale (`npac_f_leads_<hash>`, mesmo FNV-1a de `user-cookie.ts`) → `/leads` abre com todos e o cookie some (a tela regrava o valor normalizado quando o do cookie difere). O caminho do 400 da API segue o que a página já faz com filtro salvo (`resetPrefs` apaga o cookie), sem teste próprio.
  - `seleção em massa não volta`: marca 2 leads → menu Hoje → menu Leads → barra "Ações em massa" ausente.
- [ ] **Step 2:** `pnpm --filter @npac/web e2e e2e/preferencias.spec.ts -g "leads"` → FAIL.
- [ ] **Step 3:** Implementar página, `LeadsBrowser` e `LeadFilters` como descrito.
- [ ] **Step 4:** Rodar de novo → PASS; `pnpm --filter @npac/web e2e e2e/login.spec.ts -g "150 KB"` → PASS. Se passar de 150 KB: trocar `CsvExport` em `leads-browser.tsx` por `import()` sob demanda (só liderança usa), sem subir o limite.
- [ ] **Step 5:** Commit `feat(NPAC-46): leads lembra filtros e aplica na hora`.

### Task 4: Pipeline — Status: ✅

**Files:** Modify `apps/web/app/(app)/(comercial)/pipeline/page.tsx`, `apps/web/components/pipeline.tsx`; Test `e2e/preferencias.spec.ts`.

Cookie `npac_f_pipe`: filtros (`leadFilterRules`) + `col` (coluna aberta no celular, `oneOf(stage keys)`). Página busca por `apiPost('/api/leads/pipeline/search', filtros)` quando há filtro. Sai o botão "Buscar" (busca no Enter); termo em memória (`keep/recall`).

- [ ] **Step 1: e2e que falham:** `pipeline lembra filtro e coluna do celular` (filtra P0 → menu Leads → menu Pipeline → só cards P0; em 375 px escolhe a coluna "Em Follow-up" → reload → ela segue aberta); `pipeline busca no Enter e lembra o termo ao voltar`.
- [ ] **Step 2:** rodar `-g "pipeline"` → FAIL. **Step 3:** implementar. **Step 4:** rodar → PASS (inclui o teste antigo das colunas ocultas).
- [ ] **Step 5:** Commit `feat(NPAC-46): pipeline lembra filtros e coluna aberta`.

### Task 5: Hoje aplica na hora — Status: ✅

**Files:** Modify `apps/web/components/today.tsx` (sai o form/botão "Filtrar Hoje"; `onChange` dos selects chama `apply(selected)`, que grava o cookie e busca); Test `e2e/preferencias.spec.ts` (ajustar `hoje lembra o filtro de SDR e closer ao voltar`, que clicava no botão) e `grep -rn "Filtrar Hoje" apps/web/e2e` para os demais.

- [ ] **Step 1:** Ajustar o teste: escolher o SDR já filtra (sem botão) → `expect(page.getByRole('button', { name: 'Filtrar Hoje' })).toHaveCount(0)`. Rodar → FAIL.
- [ ] **Step 2:** Implementar. **Step 3:** rodar `-g "hoje"` → PASS.
- [ ] **Step 4:** Commit `feat(NPAC-46): hoje aplica o filtro ao escolher`.

### Task 6: Dashboard e Relatórios — Status: ✅

**Files:** Modify `apps/web/app/(app)/(comercial)/dashboard/page.tsx`, `apps/web/app/(app)/(comercial)/relatorios/page.tsx`, `apps/web/components/reports.tsx`; Test `e2e/preferencias.spec.ts` e `grep -rn "Atualizar relatório" apps/web/e2e`.

Props novas de `Reports`: `prefs: { screen: 'dashboard' | 'reports'; cookie: string; value: string }`, `initialFilters: Record<string, string>`. Dashboard: cookie `preset`/`sdrId` → `presetFilters` + `sdrId` na busca do servidor; `pick` grava. Relatórios: campos com `defaultValue` de `initialFilters`; `onChange` do form → `requestSubmit` (intervalo incompleto não busca); sai "Atualizar relatório"; "Limpar filtros" volta a `{ period: 'MONTH' }` e apaga o cookie.

- [ ] **Step 1: e2e que falham:** `dashboard lembra período e SDR` (liderança: "7 dias" + SDR → menu Leads → menu Dashboard → "7 dias" pressionado e SDR escolhido); `relatórios aplicam ao mudar e lembram` (Perfil = P0 sem botão → menu → volta → P0; reload → P0; "Limpar filtros"); `SDR não herda filtro de produto` (cookie com `productId` para ale → campo não aparece e relatório carrega).
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** rodar → PASS; `e2e/dashboard.spec.ts` → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-46): dashboard e relatorios lembram filtros`.

### Task 7: Admin, Chat e Playbook — Status: ✅

**Files:** Modify `apps/web/app/(app)/(comercial)/admin/page.tsx`, `components/admin.tsx` (`tab` inicial do cookie, `oneOf(TABS)`; grava ao trocar), `chat/page.tsx`, `components/chat.tsx` (`active` inicial = canal do cookie se ainda está em `initial`; grava ao abrir), `playbook/page.tsx`, `components/playbook.tsx` (`query` em memória, chave `prefsCookie('playbook', me.id)`); Test `e2e/preferencias.spec.ts`.

- [ ] **Step 1: e2e que falham:** `admin lembra a aba` (Etapas → menu → volta → Etapas); `chat lembra a conversa aberta`; `playbook lembra a busca ao trocar de tela`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS; `e2e/admin.spec.ts` e `e2e/collab.spec.ts` → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-46): admin, chat e playbook lembram a escolha`.

### Task 8: Fechar o PR 1 — Status: ✅

- [ ] `pnpm lint && pnpm typecheck` → limpo; `pnpm --filter @npac/shared test` → PASS.
- [ ] `pnpm --filter @npac/web e2e > "$TEMP/e2e-pr1.log" 2>&1; tail -30 "$TEMP/e2e-pr1.log"` → 0 falhas.
- [ ] Capturas 375/768/1024/1440 de Leads, Pipeline, Hoje, Relatórios (com e sem filtro), vistas uma a uma.
- [ ] `CLAUDE.md`: linha "Cookies em vez de localStorage" com os cookies novos (`npac_f_<tela>_<hash>`, `Path` da tela), "busca só na memória (`lib/screen-memory.ts`)", "filtros aplicam ao mudar"; mapa: `sh/screen-prefs.ts`, `lib/screen-prefs.ts`, `lib/use-latest-prefs.ts`.
- [ ] Commit `docs(NPAC-46): claude.md com os filtros lembrados`; `git push -u origin HEAD`; PR `feat(NPAC-46): filtros lembrados no comercial` para `release/v0.13`; Auto-fix; squash no verde.

---

## PR 2 — Acompanhamento (branch nova a partir da release com o PR 1)

### Task 9: Reuniões — última URL por aba — Status: ⏳

**Files:** Create `apps/web/components/acompanhamento/lembrar-url.tsx`; Modify `apps/web/app/(app)/acompanhamento/reunioes/page.tsx`; Test `apps/web/e2e/acompanhamento-v2-preferencias.spec.ts`.

**Interfaces — Produces:**
```ts
export function LembrarUrl(p: { cookie: string; screen: Screen; abas: readonly string[]; aba: string; consulta: string; daily?: readonly string[] }): null;
// ao montar e quando aba/consulta mudam: writeTabUrls(readTabUrls(cookie atual…), aba, consulta, brasiliaDay()) → rememberPrefs
```
Página: chaves lembradas `aba, dia, condutor, mes, mentoria`; sem nenhuma na URL → usa `tabs[last ?? 'agenda']`; links das abas = `?` + `tabs[id]` (a atual usa a consulta atual); `daily = ['dia', 'mes']`; abas fora do perfil (Especialista) seguem filtradas como hoje.

- [ ] **Step 1: e2e que falham** (login `duda`): `reuniões lembram a aba e o filtro de cada aba` (Controle mensal + mentoria RDV → menu Fila → menu Reuniões → Controle e RDV; aba Agenda → aba Controle → RDV continua); `semana da agenda de ontem não volta hoje` (`addCookies` com `d=<ontem>` e `dia` de outra semana → abre na semana atual).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS; `e2e/acompanhamento-v2-reunioes.spec.ts` → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-46): reunioes lembram aba e filtros`.

### Task 10: Plano e Configurações — Status: ⏳

**Files:** Modify `apps/web/app/(app)/acompanhamento/plano/page.tsx` (chaves `aba, mes`; sem `daily`), `apps/web/app/(app)/acompanhamento/configuracoes/page.tsx` (chaves `aba, mentoria`); Test o spec do Task 9.

- [ ] **Step 1:** e2e `plano lembra aba e mês`, `configurações lembram a aba` → FAIL. **Step 2:** implementar com `LembrarUrl`. **Step 3:** PASS + `acompanhamento-v2-plano.spec.ts`. **Step 4:** Commit `feat(NPAC-46): plano e configuracoes lembram a aba`.

### Task 11: Fila e Mentorados — Status: ⏳

**Files:** Modify `apps/web/app/(app)/acompanhamento/fila/page.tsx`, `components/acompanhamento/fila.tsx` (cookie `ver` = `oneOf(['minha','equipe'])` e `grupo` = `oneOf(FILA_GRUPOS chaves)`; `ver` da URL vence; prop `inicialGrupo`), `apps/web/app/(app)/acompanhamento/mentorados/page.tsx`, `components/acompanhamento/mentorados-lista.tsx` (cookie `mes` 1–13, `status` em `InscricaoStatus` — exportar a lista em `@npac/shared/mentoria` se não existir —, `responsavelId` em `responsaveis`, `completar=1`; página busca filtrada; prop `inicial: Filtros`; "Limpar filtros" se a tela ainda não tiver).

- [ ] **Step 1:** e2e `fila lembra Equipe e grupo`, `mentorados lembram os filtros` → FAIL. **Step 2:** implementar. **Step 3:** PASS + `acompanhamento-v2-fila.spec.ts`. **Step 4:** Commit `feat(NPAC-46): fila e mentorados lembram filtros`.

### Task 12: Onboarding e Ficha — Status: ⏳

**Files:** Modify `apps/web/app/(app)/acompanhamento/onboarding/page.tsx`, `components/acompanhamento/onboarding-funil.tsx` (cookie `etapa` e `painel` = `oneOf(['funil','caixas','idrs'])`), `apps/web/app/(app)/acompanhamento/ficha/[id]/page.tsx` (`aba` da URL vence; senão a do cookie; senão a padrão), `components/acompanhamento/ficha.tsx` (grava `aba` ao trocar), `components/acompanhamento/historico-lista.tsx` (filtro no mesmo cookie, chave `historico`), `components/acompanhamento/plano-mentorado.tsx` (mês em `keep/recall`, chave `<cookie da ficha>:plano:<fichaId>`).

- [ ] **Step 1:** e2e `onboarding lembra etapa e painel`, `ficha abre na última aba, em qualquer mentorado`, `link da fila com ?aba= vence`, `histórico lembra o filtro` → FAIL. **Step 2:** implementar. **Step 3:** PASS + `acompanhamento-v2-onboarding.spec.ts`, `acompanhamento-v2-base.spec.ts`. **Step 4:** Commit `feat(NPAC-46): onboarding e ficha lembram a escolha`.

### Task 13: Fechar o PR 2 — Status: ⏳

- [ ] Igual ao Task 8 (lint, typecheck, e2e completo, capturas das telas do módulo, `CLAUDE.md` com "última URL por aba" e `lembrar-url.tsx`), PR `feat(NPAC-46): filtros lembrados no acompanhamento`.
