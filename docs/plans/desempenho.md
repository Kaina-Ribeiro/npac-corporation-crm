# Desempenho e resposta da interface — plano de implementação

> **Para quem executa:** uma sessão nova por fase, na ordem. Leia só este arquivo e o `CLAUDE.md`.
> Ao terminar cada tarefa, marque o checkbox e atualize a linha **Status** da fase. Use
> superpowers:executing-plans. Fases 1 e 3 mexem em permissão e dinheiro: pedem um revisor
> independente (somente leitura) antes do merge.

**Objetivo:** tirar o custo que cresce com a base (permissão calculada linha a linha, telas
pré-carregadas em segundo plano, canal ao vivo varrendo o banco) e fazer a interface responder na
hora, com movimento curto e consistente.

**Arquitetura:** a autorização continua sendo RLS no SQL; muda só a forma (lista calculada uma vez
por consulta em vez de função por linha). No web, a navegação passa a mostrar esqueleto imediato e
buscar dado fresco no clique, sem pré-carga completa. O canal ao vivo lê um contador em vez de
resumir tabelas inteiras.

**Stack:** Postgres 16 (RLS, SQL manual em `packages/db/drizzle`), NestJS + Drizzle (`apps/api`),
Next 16 App Router + React 19 + Tailwind 4 (`apps/web`).

**Origem:** auditoria de 12/11/2026 (seção "Achados e medições" abaixo; não há outro documento). A auditoria rodou no commit `086de9e` (v0.14); a `release/v0.15` trouxe as tabelas de PMEs, metas e ciclos (0057–0059), que não foram medidas: o teste-guarda de T1.2 aponta as políticas delas.

| Fase | Assunto | Status |
|---|---|---|
| 1 | Banco: permissão por consulta | ⏳ pendente |
| 2 | Web: navegação, carregamento e erro | ⏳ pendente |
| 3 | API: canal ao vivo, relatórios, índices | ⏳ pendente (depois da Fase 1) |
| 4 | Interface: movimento e resposta | ⏳ pendente (depois da Fase 2; Gabriel escolhe a opção em T4.1) |
| 5 | Varredura de fluxos por cargo e sobras | ⏳ pendente (por último) |

## Decisões do Gabriel (12/11/2026)

- **D1:** o banco dev `npac` estava divergente (migration de e-mail com o número antigo; `migrate`
  falhava com `email_enc already exists`). **Decidido: recriar mantendo os acessos (usuários e
  senhas).** Feito pela sessão coordenadora, fora das fases.
- **D2 (fase 3):** canal ao vivo por **contador global**: qualquer escrita avisa todas as abas, que
  recarregam a tela atual.
- **D3 (fases 2 e 4):** textos novos **aprovados**: aviso de sucesso "Salvo"; tela de erro "Não foi
  possível carregar." com botão "Tentar de novo".
- **D4 (fase 5):** os 5 itens "Em breve" do menu do Acompanhamento **ficam como estão**. T5.3 não
  tem nada a fazer.

## Ordem de execução

Fases 1 e 2 rodam em paralelo (banco e web, arquivos diferentes). A Fase 3 só começa com a Fase 1
mergeada (usa a ferramenta de T1.1 e as migrations dela vêm depois das da Fase 1). A Fase 4 só começa com a
Fase 2 mergeada (mexe nos mesmos componentes). A Fase 5 fica por último. Só a sessão da Fase 1
versiona este arquivo; a da Fase 2 relata o status no PR e a coordenadora atualiza aqui.

## Restrições globais

- Branch `tipo/NPAC-N-nome` a partir de `release/v0.15`, PR `tipo(NPAC-N): resumo` em minúsculas,
  squash (`RELEASING.md`). Abrir a issue no Linear no início de cada fase e usar o número dela.
- Migration nova: o próximo `idx` livre da `release/v0.15` no momento do PR (em 12/11 a última é a **0059**, `when` `1794455807300`) e `when` maior que o da última. A fase 2 do Acompanhamento (NPAC-43) segue criando migrations: se outra entrar antes, renumerar. Nunca
  reescrever migration aplicada.
- Runtime usa `npac_app`. Consulta de domínio sempre em `withUser`. Invisível = 404.
- A semântica de quem vê o quê **não muda**: `packages/db/test/rls.test.ts`,
  `mentoria-v2-rls.test.ts` e `mentoria-v2-especialista.test.ts` passam sem edição.
- Nenhum rótulo, campo ou fluxo novo além dos listados em D3.
- JS de `/leads` continua < 150 KB gzip. Sem biblioteca nova no cliente.
- `prefers-reduced-motion` continua zerando animações (`globals.css:543`).
- Next 16 difere do que se conhece: antes de mexer em prefetch, `loading.tsx` ou `error.tsx`, ler
  `apps/web/node_modules/next/dist/docs/` (prefetching, loading-ui, error-handling).
- Produção só com o sim do Gabriel, depois do roteiro no ITODEV por cargo.
- Mudança de comando ou regra atualiza o `CLAUDE.md` no mesmo PR.

## Achados e medições (12/11/2026)

Build de produção local. Volume **assumido**: 20.618 leads, 11.651 reuniões, 206.180 eventos de
timeline, 364 inscrições, 1.716 ações. O volume real de produção não foi consultado.

| # | Achado | Onde | Medido |
|---|---|---|---|
| A1 | `leads_select`/`leads_update` chamam `closer_has_lead(id)` por linha (função `SECURITY DEFINER`, não é embutida) | `0002_rls.sql`, `0043_pagamento_sdr.sql` | `count(*)` de leads como SDR: 1.250 ms. Páginas do SDR: Dashboard 20,7 s, Pipeline 4,8 s, Leads 2,2 s, Hoje 0,8 s |
| A2 | 18 políticas de leitura do módulo chamam função por linha: 11 com `mentoria_ve()` (que chama `mentoria_admin()` e `mentoria_perfil()`), avaliações, reuniões e 5 com `mentoria_admin()`/`mentoria_perfil()` soltos | `0045`–`0056` | Plano: 649 ms (Diretoria), 1.355 ms (Operação); com 14 inscrições era 87 ms |
| A3 | Menu com `prefetch` completo: abrir uma tela dispara 67 requisições, incluindo Dashboard (1.370 ms), Relatórios (1.258 ms) e Equipe (1.238 ms) | `components/shell/nav-link.tsx:25` | contagem no navegador |
| A4 | Plano, Reuniões e Onboarding chamam `router.refresh()` ao abrir: carregam duas vezes e limpam o cache | `plano-semana.tsx:47`, `reunioes-agenda.tsx:120`, `onboarding-funil.tsx:124` | leitura do código |
| A5 | Canal ao vivo: a cada 2 s por aba, `md5` de todos os leads, tarefas e contagem da timeline, sob RLS; pool de 10 conexões | `api/src/events/events.controller.ts:29`, `packages/db/src/client.ts:16` | 5.914 ms por rodada como SDR, 67 ms como Diretoria |
| A6 | Relatório: 9 consultas, cada uma relê todos os leads (`scope as (select l.* …)`), e o gráfico diário usa subconsulta por dia | `api/src/finance/reports.service.ts:133-207` | `POST /api/reports/search` 1.012 ms, `/summary` 1.055 ms, `GET /api/team` 1.073 ms (Diretoria) |
| A7 | Sem índice em `lead_timeline(at)`, `leads(created_at)`, `leads(stage_id)` | `db/src/schema` | feed do Dashboard 83 ms |
| A8 | Entrada de página: 0,8 s + cascata de 70 ms + desfoque | `app/globals.css:868-909` | última animação termina em 1.220 ms (Leads), 1.950 ms (Dashboard), 2.230 ms (Pipeline, 215 animações) |
| A9 | Nenhum `loading.tsx` nem `error.tsx`; API fora mostra erro 500 cru | `apps/web/app` | visto em dev |
| A10 | 36 `router.refresh()` (28 no Acompanhamento), nenhum `useTransition`, nenhum `useOptimistic`, nenhum aviso de sucesso | `apps/web/components` | contagem |
| A11 | `modulo.css`: 3.401 linhas, 3 transições, 12 `:hover`; `.ac-dialogo` abre sem animação | `acompanhamento/modulo.css:2861` | contagem |
| A12 | `NavProgress` só reage a clique em `<a>`; `router.push` (busca, Ctrl+K, criar lead) não mostra progresso | `components/shell/nav-progress.tsx:20` | leitura do código |
| A13 | `[secao]/page.tsx` e `SOON` são código morto (as quatro seções existem) | `app/(app)/(comercial)/[secao]`, `shell/nav-items.tsx:114` | leitura do código |

Protótipo da correção de A1 e A2 (só no banco de teste): Dashboard do SDR 20,7 s → 0,9 s, Pipeline
4,8 s → 61 ms, Leads 2,2 s → 43 ms, canal ao vivo do SDR 5.914 → 48 ms, Plano 1.355 → 129 ms
(Operação) e 649 → 86 ms (Diretoria). O closer ficou em 6,3 s no Dashboard porque o dado clonado
lhe deu ~5,8 mil leads; a meta dele está em T1.5.

O banco `npac_e2e_audit` da auditoria tem políticas de protótipo: T1.1 cria um banco limpo e ele
pode ser apagado (`drop database npac_e2e_audit`).

## Foco da revisão

Casos que os testes de cada tarefa precisam cobrir (cada um está na tarefa dona do código):

1. Closer sem nenhuma reunião e Especialista sem nenhuma reunião conduzida: lista vazia, veem zero
   linhas, sem erro (T1.2, T1.4).
2. Lead excluído (`deleted_at`): invisível ao SDR dono e ao closer, visível à liderança (T1.2).
3. Closer que tira o lead de Agendou Pagamento sem ter reunião: o `UPDATE` passa e o lead some para
   ele em seguida; a timeline é gravada antes (T1.3).
4. Quem conduziu reunião como Especialista e trocou de perfil: deixa de ver na consulta seguinte
   (T1.4).
5. API fora do ar ou lenta: aparece o esqueleto e depois a tela de erro com "Tentar de novo", nunca
   o 500 cru (T2.2).
6. `prefers-reduced-motion: reduce`: nenhuma animação nova roda (T4.2).

---

## Fase 1 — Banco: permissão por consulta

**Status:** ⏳ pendente · **Feito quando:** T1.5 bate as metas e `pnpm --filter @npac/db test` e
`pnpm --filter @npac/api test` passam.

### T1.1 Ferramenta de medição (um comando)

**Arquivos:** criar `scripts/perf/seed.mjs`, `scripts/perf/volume.sql`, `scripts/perf/medir.sh`;
alterar `package.json` (raiz) com `perf:seed` e `perf:api`; `CLAUDE.md` (Comandos).

- [ ] `perf:seed`: recria `npac_e2e_perf` com `resetTestDb` + `seed` + `seedMentoria` (senha
  `senha-do-e2e-123`, `must_change_password = false`), roda `dist/dev/mock-prototype.js` com
  `DATABASE_URL` apontando para esse banco e aplica `volume.sql`.
- [ ] `volume.sql` (com `session_replication_role = replica` durante as cargas e `analyze` no fim):
  clona os leads `legacy_id like 'mock-%'` 60 vezes (instagram `clone<g>_<8 primeiros do id>`,
  `created_at` recuado `g` horas); clona as reuniões para os clones; 10 eventos por lead na
  timeline com `kind` em (`lead.created`, `lead.updated`); clona cada inscrição 25 vezes com
  `mentoria_pessoas`, `mentoria_acoes` **e `mentoria_onboarding_etapas`** (`importacao_chave`,
  `whatsapp_idx` e `email_idx` nulos nos clones).
- [ ] `perf:api`: sobe `apps/api/dist/main.js` em produção na porta 4150 com `APP_DATABASE_URL` do
  `npac_e2e_perf` e `MEDIA_DIR` temporário.
- [ ] `medir.sh <usuario> <metodo> <caminho> [corpo]`: loga em `:4150/api/auth/sign-in/username`,
  repete 5 vezes e imprime a mediana em ms.
- [ ] Rodar e anotar aqui a linha de base de `igor`, `sonia`, `operacao` nos endpoints de T1.5.
- [ ] Commit.

### T1.2 Testes primeiro (RED)

**Arquivos:** `packages/db/test/rls.test.ts`, `mentoria-v2-rls.test.ts`, criar
`packages/db/test/rls-por-consulta.test.ts`.

- [ ] Teste-guarda `nenhuma política de leitura chama função por linha`: em `pg_policies`, espera
  zero linhas com `cmd in ('SELECT','ALL')` cujo `qual` case com
  `(closer_has_lead|mentoria_ve|mentoria_ve_reuniao)\(` ou com `mentoria_(admin|perfil)\(\)` fora
  de `( SELECT …)` (o Postgres imprime o subselect como `( SELECT mentoria_admin() AS …)`); e que
  o `qual` de `leads_update` não contenha `closer_has_lead(`. Exceção nomeada no teste:
  `mentoria_midia_leitura` (mídia é lida uma linha por vez, pelo id).
- [ ] Conferir se `rls.test.ts` já cobre os quatro caminhos do closer (reunião não cancelada;
  `leads.closer_id` em Agendou Pagamento; venda ativa dele; reunião cancelada não conta) e os casos
  1 e 2 do Foco da revisão. Acrescentar os que faltarem.
- [ ] Rodar `pnpm --filter @npac/db test`: o teste-guarda falha, os demais passam.
- [ ] Commit.

### T1.3 Migration comercial

**Arquivos:** `packages/db/drizzle/00NN_rls_por_consulta_comercial.sql`, `meta/_journal.json`,
snapshot.

**Produz:** `closer_lead_ids() returns uuid[]` (`STABLE SECURITY DEFINER`, `search_path = public,
pg_temp`, `execute` só para `npac_app`).

- [ ] Função: união de `meetings.lead_id` (do closer, não canceladas) com `leads.id` em que
  `closer_id = app_user_id()` e (etapa `AGENDOU_PAGAMENTO` ou venda ativa do mesmo closer);
  devolve `'{}'` quando vazio. Mesmas condições de `closer_has_lead`.
- [ ] `alter policy leads_select` e `leads_update` (mesma expressão no `USING`):

  ```sql
  (select app_role()) = 'HEAD'::role
  or (deleted_at is null and (sdr_id = (select app_user_id())
      or id = any ((select closer_lead_ids())::uuid[])))
  ```

- [ ] `closer_has_lead` continua existindo (gatilhos e outras funções a usam).
- [ ] Teste do caso 3 do Foco em `apps/api/test/leads.e2e.test.ts` (se não existir).
- [ ] `pnpm --filter @npac/db build && pnpm --filter @npac/db test` verde. Commit.

### T1.4 Migration do Acompanhamento

**Arquivos:** `packages/db/drizzle/00NN_rls_por_consulta_mentoria.sql`, journal, snapshot.

**Produz:** `mentoria_ve_todas() returns boolean` e `mentoria_ids_especialista() returns uuid[]`
(mesmos atributos de T1.3).

- [ ] `mentoria_ve_todas`: `mentoria_admin() or coalesce(mentoria_perfil() in ('ACOMPANHAMENTO',
  'OPERACAO'), false)`.
- [ ] `mentoria_ids_especialista`: `inscricao_id` distintos de `mentoria_reunioes` com
  `conduzida_por = app_user_id()`, só quando `mentoria_perfil() = 'ESPECIALISTA'`; senão `'{}'`.
- [ ] Reescrever o `USING` das 11 políticas `*_leitura` que hoje são `mentoria_ve(<chave>)`
  (`mentoria_inscricoes` com chave `id`; `mentoria_pessoas`, `mentoria_acoes`,
  `mentoria_anotacoes`, `mentoria_contatos`, `mentoria_enderecos`, `mentoria_envios_fisicos`,
  `mentoria_historico`, `mentoria_momento_inicial`, `mentoria_onboarding_etapas`,
  `mentoria_pausas` com chave `inscricao_id`):

  ```sql
  (select mentoria_ve_todas())
  or <chave> = any ((select mentoria_ids_especialista())::uuid[])
  ```

- [ ] `mentoria_avaliacoes_leitura`: mesmo `exists` em `mentoria_pessoas`, trocando
  `mentoria_ve(p.inscricao_id)` pela expressão acima com `p.inscricao_id`.
- [ ] `mentoria_reunioes_leitura` (hoje `mentoria_ve_reuniao(conduzida_por, inscricao_id)`):
  `(select mentoria_ve_todas()) or ((select mentoria_perfil()) = 'ESPECIALISTA' and conduzida_por
  = (select app_user_id()))`.
- [ ] Políticas com `mentoria_admin()` / `mentoria_perfil()` soltos (`mentoria_legado_admin`,
  `mentoria_fila_feitos_leitura`, `mentoria_mensagens_leitura`, `mentoria_perfis_leitura`,
  `mentoria_plano_leitura`): mesma expressão, com cada chamada dentro de `(select …)`.
- [ ] `mentoria_midia_leitura` não muda (exceção do teste-guarda).

- [ ] `mentoria_ve` continua existindo (as funções `mentoria_edita*` a usam). Políticas de
  `INSERT`/`UPDATE` com `mentoria_edita` ficam como estão: valem para uma linha por vez.
- [ ] Teste do caso 4 do Foco em `mentoria-v2-especialista.test.ts`.
- [ ] Suítes db e API verdes, teste-guarda verde. Commit.

### T1.5 Medir e fechar

- [ ] `pnpm perf:seed && pnpm perf:api` e medir. Metas no `npac_e2e_perf`:

  | Quem | Medida | Antes | Meta |
  |---|---|---|---|
  | igor (SDR) | `select count(*) from leads` (psql, `set role npac_app`) | 1.250 ms | ≤ 50 ms |
  | igor | consulta do canal ao vivo (`events.controller.ts:38`) | 5.914 ms | ≤ 100 ms |
  | igor | `GET /api/leads?page=1` | página 2.184 ms | ≤ 150 ms |
  | igor | `GET /api/leads/pipeline` | página 4.822 ms | ≤ 200 ms |
  | igor | `POST /api/today/search {}` | página 824 ms | ≤ 200 ms |
  | sonia (closer) | os três endpoints acima, com no máximo 500 leads dela (ajustar o clone) | 2,4–5,1 s | ≤ 300 ms |
  | operacao | `POST /api/mentoria/plano/semana {}` | página 1.355 ms | ≤ 200 ms |
  | diretor | `POST /api/mentoria/plano/semana {}` | página 649 ms | ≤ 150 ms |

- [ ] Anotar os números aqui. Revisor independente lê as duas migrations (foco: vazamento de
  linha). PR, ITODEV, roteiro por cargo (SDR, closer, Especialista, Operação).

## Fase 2 — Web: navegação, carregamento e erro

**Status:** ⏳ pendente · **Feito quando:** T2.5 passa e `pnpm --filter @npac/web e2e` fica verde.

### T2.1 Menu sem pré-carga completa

**Arquivos:** `components/shell/nav-link.tsx`, `nav-items.tsx`, `nav-menu.tsx`.

- [ ] Ler a doc de prefetch do Next 16 e registrar aqui, em uma linha, o que o modo padrão baixa
  com e sem `loading.tsx`.
- [ ] Tirar `prefetch={item.ready && !item.semPrefetch}` (fica o padrão); `semPrefetch` vira
  `prefetch={false}`.

### T2.2 Esqueleto e erro

**Arquivos:** criar `app/(app)/(comercial)/loading.tsx`, `app/(app)/acompanhamento/loading.tsx`,
`app/(app)/error.tsx`, `components/shell/page-skeleton.tsx`; `e2e/interacao.spec.ts`.

- [ ] `PageSkeleton`: título + 3 blocos com o vidro do CRM, brilho suave em laço, sem texto.
  Componente de servidor, sem JS.
- [ ] `error.tsx` (cliente): texto e botão de D3; o botão chama `reset()`.
- [ ] e2e do caso 5 do Foco: rota da API interceptada com atraso mostra o esqueleto; resposta 500
  mostra a tela de erro e o botão recarrega.

### T2.3 Tirar o recarregar-ao-abrir

**Arquivos:** `components/acompanhamento/plano-semana.tsx:46-49`, `reunioes-agenda.tsx:119-122`,
`onboarding-funil.tsx:123-126`.

- [ ] Remover os três `useEffect(() => router.refresh(), [router])`. O `router.refresh()` depois
  de uma ação fica.
- [ ] `e2e/acompanhamento-v2-plano.spec.ts`: marcar uma ação como feita em outra aba do navegador
  e abrir o Plano pelo menu mostra o estado novo (prova que o dado vem fresco sem o efeito).

### T2.4 Listas longas sem pré-carga por linha

**Arquivos:** `plano-semana.tsx`, `fila.tsx`, `mentorados-lista.tsx`, `leads-browser.tsx`,
`pipeline.tsx`, `today.tsx`.

- [ ] `prefetch={false}` nos `<Link>` de linha e de card.

### T2.5 Prova

**Arquivos:** criar `e2e/navegacao-leve.spec.ts`.

- [ ] Abrir `/avisos`, esperar 3 s: nenhuma linha nova em `audit_log` com `action` em
  (`report.view`, `today.view`, `lead.list`).
- [ ] Abrir `/acompanhamento/plano`, esperar 3 s: nenhuma requisição `_rsc` para a própria rota
  depois da carga e no máximo 20 requisições `_rsc` no total (eram 67).
- [ ] `pnpm lint && pnpm typecheck`, e2e verde, conferir o limite de 150 KB de `/leads`. PR,
  ITODEV.

## Fase 3 — API: canal ao vivo, relatórios, índices

**Status:** ⏳ pendente (D2) · **Feito quando:** metas de T3.4 batidas e suítes verdes.

### T3.1 Canal ao vivo por contador (opção A de D2)

**Arquivos:** migration `00NN_revisao.sql`, `api/src/events/events.controller.ts`, criar
`api/src/events/revision.service.ts`, `apps/api/test/events.e2e.test.ts`.

**Produz:** tabela `app_revision (id boolean primary key default true, n bigint not null)` com uma
linha; função de gatilho `app_revision_bump()`; `RevisionService.changes$: Observable<void>`.

- [ ] Gatilho `AFTER INSERT OR UPDATE OR DELETE … FOR EACH STATEMENT` em `leads`, `lead_tasks`,
  `lead_timeline`, `chat_messages`, `chat_channels`, `chat_reads`, `notifications` (as tabelas do
  resumo atual). `npac_app` só lê `app_revision`.
- [ ] `RevisionService`: **um** temporizador de 2 s para o processo inteiro lê `n` e emite quando
  muda. `EventsController` assina `changes$`; a checagem de sessão por conexão passa para 10 s.
- [ ] Testes: uma escrita gera um `invalidate` em duas conexões; sem escrita, só `heartbeat`;
  sessão encerrada ainda fecha em até 10 s.

### T3.2 Relatório em menos consultas

**Arquivos:** `api/src/finance/reports.service.ts`, `apps/api/test/reports.e2e.test.ts`.

- [ ] Antes de mexer: teste que grava a resposta inteira de `search` para três filtros (mês,
  `sdrId`, `closerId` + `productId`) sobre os dados do mock e compara igualdade profunda.
- [ ] `scope` passa a trazer só `id, sdr_id, tier, created_at`; métricas, conversão e taxas viram
  uma consulta; `daily` e `previousDaily` agregam com `group by` do dia de Brasília e `left join`
  na série de dias; `bySdr`, `byCloser`, `byProduct` e a página ficam como consultas próprias.
  Saída idêntica (o teste acima não muda).
- [ ] Mesmo tratamento para o que `GET /api/team` reaproveita.

### T3.3 Índices

**Arquivos:** migration `00NN_indices_desempenho.sql`, `db/src/schema/*.ts`.

- [ ] `lead_timeline (at desc, id)`, `leads (created_at) where deleted_at is null`,
  `leads (stage_id) where deleted_at is null`.
- [ ] `explain` do feed (`reports.service.ts:118`), do relatório e do Pipeline no `npac_e2e_perf`:
  manter só o índice que aparece em algum plano.

### T3.4 Medir e fechar

- [ ] Metas (Diretoria, `npac_e2e_perf`): `POST /api/reports/search {"period":"MONTH"}` 1.012 →
  ≤ 200 ms; `GET /api/team` 1.073 → ≤ 200 ms; `GET /api/reports/activity` 83 → ≤ 20 ms; canal ao
  vivo: uma consulta a cada 2 s no processo, qualquer que seja o número de abas.
- [ ] Revisor independente (dinheiro: totais do relatório). PR, ITODEV.

## Fase 4 — Interface: movimento e resposta

**Status:** ⏳ pendente (D3) · **Feito quando:** capturas em 375 / 768 / 1024 / 1440 px conferidas e
e2e verde.

### T4.1 Três opções de movimento para o Gabriel escolher

- [ ] Página só de dev com a mesma tela (Leads) em três variantes e um vídeo ou sequência de
  capturas de cada: **A** só opacidade, 160 ms, sem cascata · **B** sobe 6 px + opacidade, 220 ms,
  cascata de 3 blocos × 30 ms · **C** a atual encurtada (12 px, 320 ms, sem desfoque). Nenhuma usa
  `filter: blur`. Esperar a escolha antes de T4.2.

### T4.2 Entrada de página e tokens

**Arquivos:** `app/globals.css:859-909`.

- [ ] Aplicar a variante escolhida em `.page-reveal`, `.reveal`, `.reveal-grid`. Cards do Pipeline
  não animam um a um (só as colunas). Meta: última animação de entrada termina em ≤ 300 ms em
  Leads, Pipeline e Dashboard (medir com `document.getAnimations()`; os gráficos do Dashboard
  ficam de fora da meta).
- [ ] Caso 6 do Foco: e2e com `reducedMotion: 'reduce'` não encontra animação em andamento.

### T4.3 Diálogos, abas e linhas do Acompanhamento

**Arquivos:** `acompanhamento/modulo.css`, `components/acompanhamento/dialogo.tsx`,
`components/stage-move-dialog.tsx`.

- [ ] `.ac-dialogo` e o diálogo de mover etapa: entrada e saída com `@starting-style` e
  `transition … allow-discrete` (como o `::picker(select)` em `globals.css:1444`), `--dur` e
  `--ease-out`.
- [ ] Linhas clicáveis, abas (`.tabs a`), botões e cartões do módulo: estado de hover e de toque
  usando os tokens `--dur-fast` / `--dur-press`.

### T4.4 Resposta imediata nas ações

**Arquivos:** criar `components/toast.tsx`; `components/acompanhamento/fila.tsx`,
`plano-mentorado.tsx` (`BotaoFeita`), `components/pipeline.tsx`, `components/shell/nav-progress.tsx`.

- [ ] `toast.tsx`: um aviso por vez, `role="status"`, some em 2,5 s; textos de D3.
- [ ] Concluir item da Fila, marcar ação feita no Plano e mover card no Pipeline: a tela muda no
  clique (`useOptimistic`), o `router.refresh()` vai dentro de `startTransition`, e erro desfaz e
  mostra a mensagem da API.
- [ ] `NavProgress` expõe `startNavProgress()` e os `router.push` de busca, Ctrl+K, criar lead e
  nova inscrição o chamam.
- [ ] e2e: com a rota da ação atrasada em 1 s, o item já aparece concluído antes da resposta; com
  erro 409, volta ao estado anterior.

### T4.5 Conferência visual

- [ ] Capturas 375 / 768 / 1024 / 1440 px de Leads, Pipeline, Dashboard, Fila, Plano e ficha, nos
  dois temas; rever toda tela que usa `.page-reveal`. PR, ITODEV.

## Fase 5 — Varredura de fluxos por cargo e sobras

**Status:** ⏳ pendente (D4) · **Feito quando:** a tabela de fluxos abaixo está preenchida e cada
falha virou issue no Linear.

- [ ] T5.1 Um login por cargo no ITODEV (Diretoria, Head, SDR, Closer, Acompanhamento Admin,
  Operação, Especialista, Mentor, Acompanhamento sem perfil): login → onde cai → cada item do menu
  → ação principal de cada tela. Registrar ✅/❌ por tela numa tabela neste arquivo.
- [ ] T5.2 Apagar `app/(app)/(comercial)/[secao]/page.tsx` e `SOON` (`nav-items.tsx:114`), com o
  e2e de 404 para `/qualquer-coisa`.
- [ ] T5.3 Aplicar D4 no menu do Acompanhamento.
- [ ] T5.4 Rodar o Playwright completo e o roteiro de celular (não rodados na auditoria).

## Brief para abrir cada fase

```
Goal: executar a Fase <N> de docs/plans/desempenho.md até o "Feito quando".
Where: npac-corporation, branch nova a partir de release/v0.15; plano docs/plans/desempenho.md, Fase <N>.
Decided: semântica de acesso não muda; migrations no próximo número livre da release/v0.15; sem biblioteca nova; textos só os de D3; metas da tabela da fase.
Done when: o "Feito quando" da fase, com os números anotados no plano.
Limits: push/PR/merge pelas regras de Git, prod precisa do sim; sem outras sessões; relatório final ≤5 linhas.
```
