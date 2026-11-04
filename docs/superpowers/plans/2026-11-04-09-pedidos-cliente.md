# Pedidos do cliente (04/11) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** entregar os 9 pedidos do cliente de 04/11/2026 exatamente como a spec descreve.

**Architecture:** mudanças pontuais nos módulos existentes (relatórios, Hoje, handoff, leads,
catálogo de etapas). Duas migrations: `RESCHEDULED` no resultado de reunião e etapa com chave
livre (`text`) + flag `system`. Nada de lib nova.

**Tech Stack:** NestJS + Drizzle + Postgres 16 (RLS), Next 16, Zod, vitest e2e, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-pedidos-cliente-design.md`

## Global Constraints

- Branch `feat/NPAC-14-pedidos-cliente` a partir de `release/v0.3`; um PR por bloco (5 blocos),
  título `feat(NPAC-14): …` em minúsculas, squash. Sem push sem pedir.
- Consulta de domínio sempre em `withUser`; autorização de linha é RLS. Invisível = 404.
- Mudança + `recordActivity` na mesma transação; PATCH/ações exigem `version` (409
  `VERSION_CONFLICT`).
- Dinheiro em centavos inteiros. Valor por reunião realizada: **P0 = 900, P1 = 700, P2 = 500**.
- CSV: POST, auditado, `csvCell` (fórmulas neutralizadas), recusa > 10 mil linhas, só liderança
  (`@Can('export:csv')`).
- Erros da API em português. Nada de contato/termo de busca em URL ou log.
- Migration nova nunca reescreve aplicada; valor novo de enum não vale na mesma transação.
- Antes de cada commit: `pnpm lint && pnpm typecheck`. Bug/feature: teste RED → código → teste.
- UI: capturas 375/768/1024/1440 do que mudou; visual no padrão atual (glass-card, hover/press).

## Review Focus

1. **Resultado corrigido pela liderança** (Realizada → No-show): o valor some do card. Teste na Task 6.
2. **Perfil do lead mudado depois da reunião**: o valor segue o perfil atual (decisão do cliente). Teste na Task 6.
3. **SDR lendo R$ por outro caminho** (Relatórios, resumo de WhatsApp, `byProduct`, `daily`): nenhum
   campo de dinheiro na resposta. Teste na Task 6.
4. **Coluna excluída com a tela de outro usuário aberta**: mover lead para ela → 400 "Etapa
   inexistente", sem 500. Teste na Task 13.
5. **Ação rápida com versão velha** (dois cliques, duas abas): 409, nada gravado. Teste na Task 10.

---

## Bloco 1 — rápidos (PR 1)

### Task 1: Botão "Novo lead" no Pipeline

**Files:**
- Modify: `apps/web/app/(app)/pipeline/page.tsx`, `apps/web/components/pipeline.tsx`
- Test: `apps/web/e2e/productivity.spec.ts`

**Interfaces:** Produces: prop `canCreate: boolean` em `Pipeline`.

- [ ] **Step 1:** teste Playwright `pipeline tem botão Novo lead que abre o formulário`: como `ale`
  (SDR), em `/pipeline`, `getByRole('link', { name: 'Novo lead', exact: true }).filter({ visible: true })`
  leva a `/leads/new`; como `sonia` (CLOSER) o link não existe.
- [ ] **Step 2:** rodar `pnpm --filter @npac/web e2e e2e/productivity.spec.ts` → FAIL.
- [ ] **Step 3:** página lê `getSession()` e passa `canCreate={can(me, 'lead:create')}`; `Pipeline`
  mostra `<Link href="/leads/new" className={button}>+ Novo lead</Link>` no cabeçalho (mesmo estilo de
  `leads-browser.tsx:254`).
- [ ] **Step 4:** e2e → PASS.
- [ ] **Step 5:** commit `feat(NPAC-14): novo lead no pipeline`.

### Task 2: Filtro por SDR no Dashboard da liderança

**Files:**
- Modify: `apps/web/components/reports.tsx` (cabeçalho do modo `dashboard`, `pick`)
- Test: `apps/web/e2e/dashboard.spec.ts`

- [ ] **Step 1:** teste `head filtra o dashboard por SDR`: como `ana`, escolher "Ale" no select
  `SDR` do cabeçalho; a requisição `/api/reports/search` leva `sdrId` do Ale (checar com
  `page.waitForRequest` e `postDataJSON().sdrId`); como `ale` o select não existe.
- [ ] **Step 2:** e2e → FAIL.
- [ ] **Step 3:** select "SDR" (opção "Todos" + `catalog.team.filter(u => u.canProspect)`) só se
  `head`; trocar chama `load({ ...presetFilters(preset), sdrId })`; `pick(preset)` preserva o
  `sdrId` escolhido.
- [ ] **Step 4:** e2e → PASS.
- [ ] **Step 5:** commit `feat(NPAC-14): filtro por sdr no dashboard`.

### Task 3: Contato de hoje que passou do horário vai para Atrasados

**Files:**
- Modify: `apps/api/src/today/today.service.ts:53-60`, `apps/web/components/today.tsx`
- Test: `apps/api/test/today.e2e.test.ts`

- [ ] **Step 1:** teste `contato de hoje que já passou da hora está em atrasados`: lead do `ale` com
  `nextContactAt = agora - 5 min` (dentro de hoje) aparece em `overdue` e não em `contacts`; lead
  com `agora + 5 min` (se ainda for hoje; senão pular com `it.skipIf`) aparece em `contacts`.
- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/today.e2e.test.ts -t "passou da hora"` → FAIL.
- [ ] **Step 3:** `const now = new Date()`; overdue `lt(leads.nextContactAt, now)`; contacts
  `gte(leads.nextContactAt, now)` e `lt(…, end)`. Web: `useEffect` com `setInterval(() => load(), 60_000)`
  limpo no unmount.
- [ ] **Step 4:** teste → PASS; suíte `today.e2e` inteira PASS.
- [ ] **Step 5:** commit `feat(NPAC-14): contato vencido de hoje vai para atrasados`.

### Task 4: Google Agenda com título e handoff

**Files:**
- Modify: `apps/api/src/collab/handoff.ts`
- Test: `apps/api/test/collab.e2e.test.ts:116-139`

**Interfaces:** Produces: `export function initials(name: string): string` em `handoff.ts`.

- [ ] **Step 1:** trocar a asserção `not.toContain('Maria')` por: `url.searchParams.get('text')`
  `=== 'Reunião Maria Handoff (<tier do lead>) AL'` (reunião criada pelo `ale`, nome "Ale");
  `details` contém `'Handoff NPAC'`, `'SDR: Ale'` e `/leads/<id>`; `calendarUrl` sem `9876`.
  Unit no mesmo arquivo: `initials('Igor') === 'IG'`, `initials('  ana  ') === 'AN'`.
- [ ] **Step 2:** `vitest run test/collab.e2e.test.ts -t handoff` → FAIL.
- [ ] **Step 3:** a subconsulta lateral também traz `created_by`; junta `"user" a` para o nome de
  quem agendou. `initials` = 2 primeiras letras do nome sem espaços, maiúsculas.
  `text` = `` `Reunião ${row.name} (${row.tier}) ${initials(row.scheduler)}` ``;
  `details` = `` `${text}\n\nFicha no CRM: ${WEB_ORIGIN}/leads/${leadId}` `` (o `text` do handoff).
  Atualizar o comentário do serviço: nome e resumo vão ao Google por pedido do cliente; telefone e
  Instagram nunca.
- [ ] **Step 4:** teste → PASS.
- [ ] **Step 5:** commit `feat(NPAC-14): google agenda com nome, perfil, sigla e handoff`.

---

## Bloco 2 — Dashboard de comparecimento (PR 2)

### Task 5: Resultado "Remarcado" e valor por perfil

**Files:**
- Create: `packages/db/drizzle/0025_meeting_rescheduled.sql` (+ snapshot e `_journal.json`)
- Modify: `packages/shared/src/enums.ts:40`, `packages/shared/src/money.ts`,
  `apps/web/components/lead-detail.tsx:240-275`, `apps/web/components/today.tsx:150-190`,
  `apps/web/lib/activity-text.ts` (se houver rótulo por resultado)
- Test: `apps/api/test/meetings.e2e.test.ts`, `packages/shared` (teste de money)

**Interfaces:** Produces: `MEETING_OUTCOMES = ['DONE', 'NO_SHOW', 'RESCHEDULED']`;
`MEETING_VALUE_CENTS: Record<Tier, number> = { P0: 900, P1: 700, P2: 500 }` em `sh/money.ts`.

- [ ] **Step 1:** testes: API `resultado remarcado é aceito depois do horário` (POST
  `/api/meetings/:id/outcome` com `RESCHEDULED` → 200, linha com `outcome='RESCHEDULED'`); shared
  `MEETING_VALUE_CENTS` igual a `{ P0: 900, P1: 700, P2: 500 }`.
- [ ] **Step 2:** rodar os dois → FAIL.
- [ ] **Step 3:** migration `ALTER TYPE meeting_outcome ADD VALUE IF NOT EXISTS 'RESCHEDULED';`;
  enum e constante; botão "Remarcado" ao lado de "No-show" nas duas telas, rótulo "Remarcada" na
  lista de reuniões. Aplicar no dev (`pnpm --filter @npac/db build && … migrate`).
- [ ] **Step 4:** testes → PASS; `pnpm --filter @npac/db test` PASS.
- [ ] **Step 5:** commit `feat(NPAC-14): resultado remarcado na reunião`.

### Task 6: Métricas de comparecimento e corte de R$ para SDR (API)

**Files:**
- Modify: `apps/api/src/finance/reports.service.ts` (`search`, `summary`), `packages/shared/src/finance.ts` (`ReportDTO`)
- Test: `apps/api/test/reports.e2e.test.ts`

**Interfaces:** Produces em `ReportDTO`: `metrics.rescheduled`, `metrics.meetingValueCents`;
`daily[].meetingValueCents`; para SDR, `soldCents`, `receivedCents`, `outstandingCents`,
`conversionBps` ausentes de `metrics`, `daily[]` sem `soldCents`/`receivedCents`,
`byProduct = []`, `previousDaily = []`, linhas de `bySdr`/`byCloser` sem `soldCents`
(campos de dinheiro viram opcionais no tipo).

- [ ] **Step 1:** testes com reuniões do `ale` no mês: P0 DONE, P1 DONE, P2 NO_SHOW, P0 RESCHEDULED.
  - `valor por reunião realizada soma só as realizadas`: `meetingValueCents === 1600`,
    `done === 2`, `noShow === 1`, `rescheduled === 1`; soma de `daily[].meetingValueCents === 1600`.
  - `resultado corrigido para no-show tira o valor` (liderança muda o P1 DONE): `900`.
  - `perfil mudado depois vale o atual` (P0 DONE vira P2): `500 + 700`.
  - `filtro por SDR`: como `ana` com `sdrId` do `murilo` → `meetingValueCents === 0`.
  - `SDR não recebe dinheiro`: como `ale`, `metrics` sem `soldCents`, `receivedCents`,
    `outstandingCents`; `byProduct` vazio; `summary` sem `R$`. Como `ana`, `soldCents` presente.
- [ ] **Step 2:** `vitest run test/reports.e2e.test.ts` → FAIL.
- [ ] **Step 3:** em `metrics`: `count(*) filter outcome='RESCHEDULED'` no período de `outcome_at`
  como `"rescheduled"`; `"meetingValueCents"` = soma sobre `calls` com `outcome='DONE'` no período
  de `case l.tier when 'P0' then 900 when 'P1' then 700 else 500 end` (junta `scope l`; os valores
  vêm de `MEETING_VALUE_CENTS` interpolados). Mesma soma por dia em `daily`. Depois da transação,
  `if (u.role === 'SDR') return stripMoney(result)` (função local que remove os campos listados).
  `summary` para SDR: texto com Leads, Reuniões, Reuniões realizadas, No-show/Remarcados e Valor a
  receber por reunião realizada; sem vendido/recebido.
- [ ] **Step 4:** testes → PASS; suíte `reports` e `finance` PASS.
- [ ] **Step 5:** commit `feat(NPAC-14): metricas de comparecimento e sdr sem valores de venda`.

### Task 7: Cards do Dashboard por papel

**Files:**
- Modify: `apps/web/components/reports.tsx` (`dashCards`, `cards`), `apps/web/lib/dashboard-layout.ts`,
  `apps/web/components/dashboard-charts.tsx` (gráfico acumulado), `apps/web/components/dashboard-team.tsx`,
  `apps/web/app/(app)/dashboard/page.tsx`, `apps/web/app/(app)/relatorios/page.tsx`
- Test: `apps/web/e2e/dashboard.spec.ts`

**Interfaces:** Consumes: campos da Task 6. Produces: prop `role: Role` em `Reports`; ids novos em
`DASH_CARDS`: `'kpi-done'`, `'kpi-missed'`, `'meeting-value'`.

- [ ] **Step 1:** testes: como `ale` o dashboard mostra "Reuniões realizadas", "No-show / Remarcados"
  e "Valor a receber por reunião realizada" e **nenhum** texto `R$` fora desse card; não mostra
  "Vendido", "Recebido", "Faturamento acumulado", "Produtos". Como `sonia`, igual a hoje (tem
  "Vendido", não tem "Valor a receber por reunião realizada"). Como `ana`, tem os dois conjuntos.
  Relatórios como `ale`: sem "Vendido"/"Recebido no período".
- [ ] **Step 2:** e2e → FAIL.
- [ ] **Step 3:** cards novos: `kpi-done` (valor `m.done`, rodapé "P0 · P1 · P2 não muda"; sparkline
  de `meetings`), `kpi-missed` (`m.noShow + m.rescheduled`, rodapé "`x` no-show · `y` remarcados"),
  `meeting-value` (`wide`, gráfico acumulado de `daily.meetingValueCents`, rodapé "P0 R$ 9 · P1 R$ 7 ·
  P2 R$ 5 por reunião realizada"; reaproveitar o traço do `RevenueHero` sem a linha do mês anterior).
  Lista por papel: SDR = `kpi-leads, kpi-meetings, kpi-done, kpi-missed, meeting-value, funnel,
  daily-leads, tiers, closers, sdrs` (sem `kpi-sold`, `kpi-received`, `revenue`, `products`);
  Closer = atual; liderança = atual + os 3 novos. `CloserDesk`/`SdrTable` escondem coluna de R$ quando
  `soldCents` não vem. Em Relatórios, `cards` omite entradas de dinheiro ausentes. Cookie antigo com
  ids que o papel não tem: ignorados (o filtro por `dashIds` já faz isso — confirmar).
- [ ] **Step 4:** e2e → PASS; capturas 375/768/1024/1440 do dashboard de `ale` e `ana`.
- [ ] **Step 5:** commit `feat(NPAC-14): dashboard de comparecimento para sdr e lideranca`.

---

## Bloco 3 — Exportações (PR 3)

### Task 8: Relatórios: exportar por período, filtro ou total

**Files:**
- Modify: `apps/api/src/finance/reports.controller.ts`, `reports.service.ts` (`csv`, `window`),
  `apps/web/components/reports.tsx` (`csv`)
- Create: `apps/api/src/common/csv.ts` (move `csvCell` para cá; `reports.service` reexporta ou importa)
- Test: `apps/api/test/reports.e2e.test.ts`

**Interfaces:** Produces: `csvCell(value: unknown): string` em `common/csv.ts`; `period` do CSV
aceita `'ALL'`.

- [ ] **Step 1:** testes: `csv total ignora a data` (lead criado há 2 anos entra com `period: 'ALL'`);
  `csv por filtro respeita sdrId` (só leads do `murilo`); `csv por período sem filtros` (só o período).
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** schema do CSV = `query.extend({ period: z.enum(['TODAY','MONTH','RANGE','ALL']) })`;
  em `csv`, `ALL` não aplica cláusula de `created_at`. Web: botão "Exportar CSV" vira menu com
  "Só o período" (`{ period, from, to }` atuais), "Com os filtros atuais" (`filters`) e "Tudo"
  (`{ period: 'ALL' }`).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** commit `feat(NPAC-14): exportar relatorio por periodo, filtro ou total`.

### Task 9: Leads: exportar por período, filtro ou total

**Files:**
- Modify: `apps/api/src/leads/leads.controller.ts`, `leads.service.ts`, `leads.repository.ts`,
  `apps/web/components/leads-browser.tsx`
- Test: `apps/api/test/leads.e2e.test.ts`, `apps/web/e2e/productivity.spec.ts`

**Interfaces:** Produces: `POST /api/leads/csv` (`@Can('export:csv')`, `@HttpCode(200)`, `text/csv`),
corpo = `listQuerySchema` sem `page/pageSize/sort/direction` + `createdFrom?`, `createdTo?`
(`z.iso.date()`); `LeadsRepository.exportRows(tx, filters, created?: { start: Date; end: Date })`.

- [ ] **Step 1:** testes API: `ale` (SDR) → 403; `ana` com `{}` → todos os leads visíveis, cabeçalho
  `Nome;Telefone;Instagram;Perfil;Etapa;SDR;Criado em`, telefone decifrado; com `tier: 'P0'` → só P0;
  com `createdFrom/createdTo` → só criados no intervalo (dias de Brasília, [início, fim)); fórmula
  `=1+1` no nome sai `'=1+1`; > 10 mil → 400 "Reduza o filtro para exportar até 10 mil leads";
  auditoria `lead.export.csv` com `{ count }`. Sem resultados → só o cabeçalho.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** repositório reaproveita `this.where(filters)` + `created_at` no intervalo, `limit 10001`,
  ordem `created_at, id`. Web: botão "Exportar" (só liderança) com menu "Por período" (dois campos de
  data), "Com os filtros atuais", "Todos os leads"; download como em `reports.tsx:202`.
- [ ] **Step 4:** → PASS; e2e: como `ana`, "Todos os leads" baixa `npac-leads.csv`; como `ale`, sem botão.
- [ ] **Step 5:** commit `feat(NPAC-14): exportar leads por periodo, filtro ou total`.

---

## Bloco 4 — Ação rápida no Hoje (PR 4)

### Task 10: API da ação rápida

**Files:**
- Modify: `apps/api/src/leads/leads.controller.ts`, `lead-mutations.service.ts`, `apps/web/lib/activity-text.ts`
- Test: `apps/api/test/today.e2e.test.ts`

**Interfaces:** Produces: `POST /api/leads/:id/quick-action` (`@Can('lead:update')`), corpo
`{ version: number; action: 'CALLED' | 'RESCHEDULED' | 'NEXT_ACTION'; at?: string (datetime); title?: string (1..200) }`
→ `{ id, version }`. `LeadMutationsService.quickAction(u, id, input, meta)`.

- [ ] **Step 1:** testes:
  - `chamado tira o lead da lista`: `nextContactAt` vira `null`, timeline `lead.called`, some do Hoje.
  - `remarcado muda o próximo contato`: `at` amanhã 10h → `nextContactAt` igual, timeline
    `lead.contact_rescheduled` com `fields: ['nextContactAt']`.
  - `próxima ação vira tarefa`: tarefa com `title` e `dueAt = at`, `nextContactAt` `null`, aparece em
    `tasks` do Hoje.
  - `RESCHEDULED`/`NEXT_ACTION` sem `at` → 400 "Informe a data"; `NEXT_ACTION` sem `title` → 400.
  - versão velha → 409 `VERSION_CONFLICT` e nada gravado; lead de outro SDR → 404.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** uma transação `withUser`: `lockLead`, conferir versão, aplicar, `version + 1`,
  `recordActivity` (para tarefa, o mesmo kind que `lead-activity` usa ao criar tarefa). Rótulos em
  `activity-text.ts`: `lead.called` "marcou como chamado", `lead.contact_rescheduled` "remarcou o
  contato de".
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** commit `feat(NPAC-14): acao rapida de chamado, remarcado e proxima acao`.

### Task 11: Botão de ação rápida no Hoje

**Files:**
- Modify: `apps/web/components/today.tsx` (`contacts`), `TodayDTO` em `sh/today.ts` se faltar `version`
- Test: `apps/web/e2e/productivity.spec.ts`

**Interfaces:** Consumes: rota da Task 10; `version` já vem em cada contato (`today.service.ts` seleciona).

- [ ] **Step 1:** e2e `ação rápida no hoje`: como `ale`, num contato de "Atrasados", "Ação rápida" →
  "Chamado" → o lead sai da lista; outro → "Remarcado" + data de amanhã → sai de Hoje; outro →
  "Próxima ação" + título + data → aparece em Tarefas.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** botão "Ação rápida" ao lado de "Abrir ficha"; abre menu com as 3 opções; Remarcado
  e Próxima ação abrem formulário inline (`datetime-local` em Brasília via `brasiliaInput`, título só
  na Próxima ação); envia por `action('/api/leads/:id/quick-action', 'POST', …)`. Alvo de toque ≥ 44 px.
- [ ] **Step 4:** → PASS; capturas 375/1440 do Hoje com o menu aberto.
- [ ] **Step 5:** commit `feat(NPAC-14): botao de acao rapida no hoje`.

---

## Bloco 5 — Pipeline editável (PR 5)

### Task 12: Etapa com chave livre (banco e shared)

**Files:**
- Create: `packages/db/drizzle/0026_custom_stages.sql` (+ snapshot e journal)
- Modify: `packages/db/src/schema/pipeline.ts`, `packages/db/src/schema/enums.ts` (tira `stageKeyEnum`),
  `packages/db/src/seed.ts`, `packages/shared/src/enums.ts`, `packages/shared/src/schemas/lead.ts`,
  `apps/api/src/leads/leads.controller.ts:35`, `apps/api/src/finance/reports.controller.ts:17`,
  `apps/api/src/notifications/views.ts:27`, `apps/web/components/crm-ui.tsx`, `apps/web/components/pipeline.tsx`
- Test: `packages/db` (teste de RLS/migrations)

**Interfaces:** Produces: `STAGE_KEYS` continua (chaves de sistema); `type SystemStageKey =
(typeof STAGE_KEYS)[number]`; `type StageKey = string`; `stageKeySchema =
z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/)` em `sh/enums.ts` (ou `schemas/lead.ts`), usado onde hoje
há `z.enum(STAGE_KEYS)`; coluna `pipeline_stages.system boolean not null default false`;
`LeadCatalog['stages'][n].system: boolean`.

- [ ] **Step 1:** testes db: as 8 etapas do seed têm `system = true`; `npac_app` como HEAD não
  consegue `DELETE` de etapa de sistema (0 linhas) e consegue de uma etapa criada; SDR não insere.
- [ ] **Step 2:** `pnpm --filter @npac/db test` → FAIL.
- [ ] **Step 3:** SQL: `ALTER TABLE pipeline_stages ALTER COLUMN key TYPE text USING key::text;`
  `DROP TYPE stage_key;` `ADD COLUMN system boolean NOT NULL DEFAULT false;`
  `UPDATE … SET system = true WHERE key IN (<8 chaves>);` `GRANT DELETE ON pipeline_stages TO npac_app;`
  `CREATE POLICY pipeline_stages_delete … FOR DELETE USING ((SELECT app_role()) = 'HEAD' AND NOT system);`
  Antes, `grep` por `stage_key` em funções/triggers (hoje só `0000_init`). Seed grava `system: true`.
  Trocar `z.enum(STAGE_KEYS)` por `stageKeySchema` nos 4 lugares; `StageKey` como `string` não quebra
  `pipeline.tsx`/`crm-ui.tsx` (conferir com `pnpm typecheck`).
- [ ] **Step 4:** db test PASS; `pnpm typecheck` PASS; suíte API inteira PASS (regras de VENDA intactas).
- [ ] **Step 5:** commit `feat(NPAC-14): etapas com chave livre e flag de sistema`.

### Task 13: API de colunas (criar, renomear, reordenar, excluir)

**Files:**
- Modify: `apps/api/src/admin/catalog.ts` (serviço e controller), `apps/api/src/leads/*` (catálogo devolve `system`)
- Test: `apps/api/test/admin.e2e.test.ts`

**Interfaces:** Produces (todas `@Can('admin:manage')`, auditadas):
`POST /api/admin/stages {label}` → `{ id, key }` (key `C_` + 8 hex maiúsculos, `position` = máx + 1);
`PATCH /api/admin/stages/:id {label}` (existe); `PUT /api/admin/stages/order {ids: string[]}` (precisa
conter todos os ids, senão 400 "Ordem incompleta"); `DELETE /api/admin/stages/:id` → 204.

- [ ] **Step 1:** testes: `ana` cria "Reativação" → aparece no catálogo no fim; renomeia; reordena e
  `GET /api/leads/catalog` volta na ordem; lead criado com `stageKey` da nova coluna; excluir coluna
  com lead ativo → 409 "Mova os leads desta coluna antes de excluir"; excluir etapa de sistema → 409
  "Esta coluna é usada pelo sistema e não pode ser excluída"; excluir coluna vazia → 204 e mover lead
  para a chave dela depois → 400 "Etapa inexistente"; lead apagado (soft) na coluna não bloqueia: vai
  para `SONDAGEM`; `ale` (SDR) → 403 em todas.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** reordenação numa transação (posições 1..n); exclusão: `FOR UPDATE` na etapa,
  conferir `system`, contar leads com `deleted_at is null`, mover os apagados, `DELETE`. Auditoria
  `admin.stage.create/update/order/delete`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** commit `feat(NPAC-14): api para editar colunas do pipeline`.

### Task 14: Editar colunas na tela do Pipeline

**Files:**
- Modify: `apps/web/components/pipeline.tsx`, `apps/web/app/(app)/pipeline/page.tsx`
- Create: `apps/web/components/pipeline-columns-editor.tsx`
- Test: `apps/web/e2e/admin.spec.ts`

**Interfaces:** Consumes: rotas da Task 13. Produces: `PipelineColumnsEditor({ stages }: { stages: LeadCatalog['stages'] })`.

- [ ] **Step 1:** e2e como `ana`: "Editar colunas" → "+ Nova coluna" "Reativação" → aparece no
  quadro; renomear; mover para cima; excluir (confirmação) → some. Coluna de sistema: botão excluir
  desabilitado com texto "usada pelo sistema". Como `ale`: sem "Editar colunas". Restaurar estado no fim.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** painel lateral (glass-card) com a lista: campo de nome (salva ao sair do campo),
  botões ↑ ↓, excluir com confirmação; erros do `clientApi` na tela; `router.refresh()` após cada
  mudança. Só para liderança (`canEditColumns` vindo da página).
- [ ] **Step 4:** → PASS; capturas 375/768/1024/1440 do Pipeline com o editor aberto.
- [ ] **Step 5:** commit `feat(NPAC-14): heads editam as colunas do pipeline`.

---

## Fechamento de cada PR

- `pnpm lint && pnpm typecheck`, `pnpm --filter @npac/api test`, `pnpm --filter @npac/db test`,
  `pnpm --filter @npac/web e2e` (parar o dev antes; ver `CLAUDE.md`).
- Atualizar `CLAUDE.md` onde a regra mudou: valor por reunião, SDR sem R$, etapas com chave livre,
  Google Agenda leva nome e resumo.
