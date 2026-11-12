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
| 1 | Banco: permissão por consulta | ✅ feita (12/11/2026, PR #95, `65d7135`; ITODEV `v0.15.2-rc` 22/22 por cargo) |
| 2 | Web: navegação, carregamento e erro | ✅ feita (12/11/2026, PR #96, `a3c5e75`; no ar no ITODEV `v0.15.2-rc`) |
| 3 | API: canal ao vivo, relatórios, índices | ✅ feita (12/11/2026, PR #98, `a3bf7fd`; ITODEV `v0.15.4-rc` 18/18) |
| 4 | Interface: movimento e resposta | ✅ PR para `release/v0.15` (Gabriel escolheu a opção B em T4.1) |
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

**Status:** ✅ feita (12/11/2026, PR #95) · **Feito quando:** T1.5 bate as metas e `pnpm --filter @npac/db test` e
`pnpm --filter @npac/api test` passam. db 256/256, API 582/582 (1 pulado: MFA ligado), lint e
typecheck verdes; todas as metas de T1.5 batidas.

### T1.1 Ferramenta de medição (um comando)

**Arquivos:** criar `scripts/perf/seed.mjs`, `scripts/perf/volume.sql`, `scripts/perf/medir.sh`;
alterar `package.json` (raiz) com `perf:seed` e `perf:api`; `CLAUDE.md` (Comandos).

- [x] `perf:seed`: recria `npac_e2e_perf` com `resetTestDb` + `seed` + `seedMentoria` (senha
  `senha-do-e2e-123`, `must_change_password = false`), roda `dist/dev/mock-prototype.js` com
  `DATABASE_URL` apontando para esse banco e aplica `volume.sql`.
- [x] `volume.sql` (com `session_replication_role = replica` durante as cargas e `analyze` no fim):
  clona os leads `legacy_id like 'mock-%'` 60 vezes (instagram `clone<g>_<8 primeiros do id>`,
  `created_at` recuado `g` horas); clona as reuniões para os clones; 10 eventos por lead na
  timeline com `kind` em (`lead.created`, `lead.updated`); clona cada inscrição 25 vezes com
  `mentoria_pessoas`, `mentoria_acoes` **e `mentoria_onboarding_etapas`** (`importacao_chave`,
  `whatsapp_idx` e `email_idx` nulos nos clones).
- [x] `perf:api`: sobe `apps/api/dist/main.js` em produção na porta 4150 com `APP_DATABASE_URL` do
  `npac_e2e_perf` e `MEDIA_DIR` temporário.
- [x] `medir.sh <usuario> <metodo> <caminho> [corpo]`: loga em `:4150/api/auth/sign-in/username`,
  repete 5 vezes e imprime a mediana em ms.
- [x] Rodar e anotar aqui a linha de base de `igor`, `sonia`, `operacao` nos endpoints de T1.5
  (coluna "Antes (12/11)" da tabela de T1.5).
  Notas: `perf:api` aceita `PERF_API_PORT` e `medir.sh` aceita `PERF_API` — em 12/11 a 4150 estava
  ocupada por uma API antiga da auditoria (PID 53224), e a medição rodou na 4151. `medir.sh` faz 1
  chamada de aquecimento antes das 5. O volume dá o mesmo da auditoria (20.618 leads, 11.651
  reuniões, 206.180 eventos, 364 inscrições, 1.716 ações); das gerações 3 a 60 o closer dos clones é
  o Ronaldo (Head), e a Sônia fica com 483 leads. `node scripts/perf/medir-sql.mjs <usuario>` mede
  `count(*)` e o canal ao vivo direto no banco.
- [x] Commit.

### T1.2 Testes primeiro (RED)

**Arquivos:** `packages/db/test/rls.test.ts`, `mentoria-v2-rls.test.ts`, criar
`packages/db/test/rls-por-consulta.test.ts`.

- [x] Teste-guarda `nenhuma política de leitura chama função por linha` (em
  `rls-por-consulta.test.ts`; mais amplo que o descrito: pega qualquer `closer_has_lead(`,
  `mentoria_*(`, `app_role(` ou `app_user_id(` fora de `( SELECT f() AS f)`, também no `WITH CHECK` de
  política ALL; apontou 24 políticas, as 18 da v0.14 mais `mentoria_ciclos`, `mentoria_metas`,
  `mentoria_pmes` e `mentoria_tarefas` da v0.15). O mesmo arquivo compara, linha a linha e para cada
  perfil, `closer_has_lead` × `closer_lead_ids` e `mentoria_ve`/`_reuniao`/`_meta` × a expressão nova: em `pg_policies`, espera
  zero linhas com `cmd in ('SELECT','ALL')` cujo `qual` case com
  `(closer_has_lead|mentoria_ve|mentoria_ve_reuniao)\(` ou com `mentoria_(admin|perfil)\(\)` fora
  de `( SELECT …)` (o Postgres imprime o subselect como `( SELECT mentoria_admin() AS …)`); e que
  o `qual` de `leads_update` não contenha `closer_has_lead(`. Exceção nomeada no teste:
  `mentoria_midia_leitura` (mídia é lida uma linha por vez, pelo id).
- [x] (Os casos que faltavam — `leads.closer_id` em Agendou Pagamento, venda ativa, venda estornada,
  venda de outro closer, closer sem reunião e lead excluído para o closer — entraram em
  `rls-por-consulta.test.ts`, para não editar os testes antigos.) Conferir se `rls.test.ts` já cobre os quatro caminhos do closer (reunião não cancelada;
  `leads.closer_id` em Agendou Pagamento; venda ativa dele; reunião cancelada não conta) e os casos
  1 e 2 do Foco da revisão. Acrescentar os que faltarem.
- [x] Rodar `pnpm --filter @npac/db test`: o teste-guarda falha, os demais passam.
- [x] Commit.

### T1.3 Migration comercial

**Arquivos:** `packages/db/drizzle/00NN_rls_por_consulta_comercial.sql`, `meta/_journal.json`,
snapshot.

**Produz:** `closer_lead_ids() returns uuid[]` (`STABLE SECURITY DEFINER`, `search_path = public,
pg_temp`, `execute` só para `npac_app`).

- [x] Função: união de `meetings.lead_id` (do closer, não canceladas) com `leads.id` em que
  `closer_id = app_user_id()` e (etapa `AGENDOU_PAGAMENTO` ou venda ativa do mesmo closer);
  devolve `'{}'` quando vazio. Mesmas condições de `closer_has_lead`.
- [x] `alter policy leads_select` e `leads_update` (mesma expressão no `USING`):

  ```sql
  (select app_role()) = 'HEAD'::role
  or (deleted_at is null and (sdr_id = (select app_user_id())
      or id = any ((select closer_lead_ids())::uuid[])))
  ```

- [x] `closer_has_lead` continua existindo (gatilhos e outras funções a usam).
- [x] Teste do caso 3 do Foco: já existia em `apps/api/test/pagamento-sdr.e2e.test.ts` ("closer sem
  reunião tira o lead da etapa: fica gravado na timeline").
- [x] `pnpm --filter @npac/db build && pnpm --filter @npac/db test` verde. Commit.

### T1.4 Migration do Acompanhamento

**Arquivos:** `packages/db/drizzle/00NN_rls_por_consulta_mentoria.sql`, journal, snapshot.

**Produz:** `mentoria_ve_todas() returns boolean` e `mentoria_ids_especialista() returns uuid[]`
(mesmos atributos de T1.3).

- [x] `mentoria_ve_todas`: `mentoria_admin() or coalesce(mentoria_perfil() in ('ACOMPANHAMENTO',
  'OPERACAO'), false)`.
- [x] `mentoria_ids_especialista`: `inscricao_id` distintos de `mentoria_reunioes` com
  `conduzida_por = app_user_id()`, só quando `mentoria_perfil() = 'ESPECIALISTA'`; senão `'{}'`.
- [x] Reescrever o `USING` das 11 políticas `*_leitura` que hoje são `mentoria_ve(<chave>)`
  (`mentoria_inscricoes` com chave `id`; `mentoria_pessoas`, `mentoria_acoes`,
  `mentoria_anotacoes`, `mentoria_contatos`, `mentoria_enderecos`, `mentoria_envios_fisicos`,
  `mentoria_historico`, `mentoria_momento_inicial`, `mentoria_onboarding_etapas`,
  `mentoria_pausas` com chave `inscricao_id`):

  ```sql
  (select mentoria_ve_todas())
  or <chave> = any ((select mentoria_ids_especialista())::uuid[])
  ```

- [x] `mentoria_avaliacoes_leitura`: mesmo `exists` em `mentoria_pessoas`, trocando
  `mentoria_ve(p.inscricao_id)` pela expressão acima com `p.inscricao_id`.
- [x] `mentoria_reunioes_leitura` (hoje `mentoria_ve_reuniao(conduzida_por, inscricao_id)`):
  `(select mentoria_ve_todas()) or ((select mentoria_perfil()) = 'ESPECIALISTA' and conduzida_por
  = (select app_user_id()))`.
- [x] Políticas com `mentoria_admin()` / `mentoria_perfil()` soltos (`mentoria_legado_admin`,
  `mentoria_fila_feitos_leitura`, `mentoria_mensagens_leitura`, `mentoria_perfis_leitura`,
  `mentoria_plano_leitura`): mesma expressão, com cada chamada dentro de `(select …)`.
- [x] `mentoria_midia_leitura` não muda (exceção do teste-guarda).
- [x] Tabelas da v0.15 na mesma migration: `mentoria_ciclos_leitura` (como as 11), `mentoria_metas_leitura`
  (`mentoria_ve_meta` = `(select mentoria_ve_todas())`), `mentoria_pmes_leitura` (como o plano) e
  `mentoria_tarefas_leitura` (`mentoria_ve_todas()` ou, para a Especialista, `exists` da reunião dela
  pela chave).

- [x] `mentoria_ve` continua existindo (as funções `mentoria_edita*` a usam). Políticas de
  `INSERT`/`UPDATE` com `mentoria_edita` ficam como estão: valem para uma linha por vez.
- [x] Teste do caso 4 do Foco em `mentoria-v2-especialista.test.ts`.
- [x] Suítes db e API verdes, teste-guarda verde. Commit.

### T1.5 Medir e fechar

- [x] `pnpm perf:seed && pnpm perf:api` e medir. Metas no `npac_e2e_perf`:

  | Quem | Medida | Auditoria | Antes (12/11) | Depois (12/11) | Meta |
  |---|---|---|---|---|---|
  | igor (SDR) | `select count(*) from leads` (npac_app) | 1.250 ms | 1.639 ms | **4 ms** ✅ | ≤ 50 ms |
  | igor | consulta do canal ao vivo (`events.controller.ts:38`) | 5.914 ms | 4.397 ms | **30 ms** ✅ | ≤ 100 ms |
  | igor | `GET /api/leads?page=1` | página 2.184 ms | 3.135 ms | **28 ms** ✅ | ≤ 150 ms |
  | igor | `GET /api/leads/pipeline` | página 4.822 ms | 6.486 ms | **42 ms** ✅ | ≤ 200 ms |
  | igor | `POST /api/today/search {}` | página 824 ms | 1.408 ms | **41 ms** ✅ | ≤ 200 ms |
  | sonia (closer, 483 leads) | `GET /api/leads?page=1` | 2,4–5,1 s | 4.384 ms | **56 ms** ✅ | ≤ 300 ms |
  | sonia | `GET /api/leads/pipeline` | | 9.690 ms | **92 ms** ✅ | ≤ 300 ms |
  | sonia | `POST /api/today/search {}` | | 4.180 ms | **70 ms** ✅ | ≤ 300 ms |
  | sonia | `count(*)` / canal ao vivo | | 2.325 / 6.308 ms | **18 / 66 ms** | — |
  | operacao | `POST /api/mentoria/plano/semana {}` | página 1.355 ms | 1.883 ms | **121 ms** ✅ | ≤ 200 ms |
  | diretor | `POST /api/mentoria/plano/semana {}` | página 649 ms | 1.103 ms | **63 ms** ✅ | ≤ 150 ms |

  Mediana de 5 (`scripts/perf/medir.sh`, `medir-sql.mjs`), API em produção local na 4151. "Antes" =
  mesmo banco com as 24 políticas antigas reaplicadas à mão, medido com a suíte da API rodando ao
  lado (um pouco inflado); "Depois" sem carga paralela. A auditoria media a página inteira; aqui é o
  endpoint.

- [x] Anotar os números aqui. Revisor independente leu as duas migrations (foco: vazamento de linha):
  nenhum vazamento; conferiu as 24 políticas contra as antigas, NULLs, inativo, sem `app.user_id`,
  atributos e grants das funções novas. PR para a `release/v0.15`.
- [x] ITODEV `v0.15.2-rc` (Fases 1 e 2), roteiro pela API com contas próprias `tcperf*` (desativadas
  no fim, dados apagados): **22/22**. SDR vê os dois leads dele; closer vê só o da reunião (404 no
  outro), abre Pipeline e Hoje; Especialista sem reunião vê 0 inscrições, com reunião vê só a dela
  (404 em outra ficha) e não vê o comercial; Operação vê as 362 inscrições como a Diretoria, abre
  Plano e Fila; closer não vê o módulo. Tempos da minha máquina (com rede): SDR 149/183/166 ms,
  closer 164/179/169 ms (leads/pipeline/hoje), Plano 221 ms (Operação) e 191 ms (Diretoria).
- [x] ⚠️ Falha do `[iphone] mobile-layout.spec.ts:31` no e2e do PR #95 (2 tentativas, "Navigation to
  /pipeline is interrupted by another navigation to /leads/<id>"). Causa: o canal ao vivo manda
  `ready` ao conectar e o `LiveUpdates` o trata como `crm:invalidate`; a ficha faz `router.refresh()`
  (lead-detail.tsx:118) e lista/Pipeline refazem a busca. Antes da Fase 1 o 1º `ready` do SDR levava
  4–6 s e chegava depois de o teste sair da tela; agora chega em ~30 ms e interrompe o `goto`
  seguinte. Efeito colateral: carga dupla ao abrir ficha, lista e Pipeline. O e2e do PR #96 (release
  com #95 e #96) passou, e o spec sozinho no topo da release (`a3c5e75`) passou 5/5 localmente
  (`--repeat-each=5`, iPhone). **Correção na Fase 3, T3.1 (opção A, coordenação 12/11):** o cliente informa
  a revisão que o render entregou ao conectar e o servidor responde `ready` ou `invalidate`; o
  evento continua só `{ type }`.

## Fase 2 — Web: navegação, carregamento e erro

**Status:** ✅ feita (12/11/2026, PR #96, `a3c5e75`, relatado pela sessão da Fase 2; no ar no ITODEV) ·
**Feito quando:** T2.5 passa e `pnpm --filter @npac/web e2e` fica verde. e2e local: 187 passaram, 4
pulados (MFA ligado); JS de `/leads` 149,7 KB gzip.

Desvios decididos por evidência (detalhes na descrição do PR #96):

1. **Sem `loading.tsx`.** Com ele a carga direta começa em 200 antes de a página decidir:
   `notFound()` virava 200 e `redirect()` virava redirecionamento no navegador (quebrou 15 e2e). O
   esqueleto vem escondido na casca (`main` e `.ac`); o `NavProgress` marca `data-nav-pending` no
   `<html>` e o CSS troca a tela pelo esqueleto até a URL mudar. Carga direta segue com 404/307.
2. **`retry()` em vez de `reset()`** no botão: no Next 16 `reset()` só redesenha o mesmo erro.
3. **150 KB de `/leads`:** a `BottomNav` virou componente de servidor para caber a tela de erro.

### T2.1 Menu sem pré-carga completa

**Arquivos:** `components/shell/nav-link.tsx`, `nav-items.tsx`, `nav-menu.tsx`.

- [x] Ler a doc de prefetch do Next 16 e registrar aqui, em uma linha, o que o modo padrão baixa
  com e sem `loading.tsx`: rota dinâmica (todas aqui) sem `loading.tsx` não pré-carrega a página,
  só a árvore da rota; com `loading.tsx`, baixa os layouts até o esqueleto, nunca a página.
- [x] Tirar `prefetch={item.ready && !item.semPrefetch}` (fica o padrão); `semPrefetch` vira
  `prefetch={false}` (Ficha do mentorado e os 5 itens "Em breve").

### T2.2 Esqueleto e erro

**Arquivos:** criar `app/(app)/(comercial)/loading.tsx`, `app/(app)/acompanhamento/loading.tsx`,
`app/(app)/error.tsx`, `components/shell/page-skeleton.tsx`; `e2e/interacao.spec.ts`.

- [x] `PageSkeleton`: título + 3 blocos com o vidro do CRM, brilho suave em laço, sem texto.
  Componente de servidor, sem JS.
- [x] `error.tsx` (cliente): texto e botão de D3; o botão chama `retry()` (desvio 2).
- [x] e2e do caso 5 do Foco (esqueleto com a tabela do Playbook travada; erro com o SELECT revogado): rota da API interceptada com atraso mostra o esqueleto; resposta 500
  mostra a tela de erro e o botão recarrega.

### T2.3 Tirar o recarregar-ao-abrir

**Arquivos:** `components/acompanhamento/plano-semana.tsx:46-49`, `reunioes-agenda.tsx:119-122`,
`onboarding-funil.tsx:123-126`.

- [x] Remover os três `useEffect(() => router.refresh(), [router])`. O `router.refresh()` depois
  de uma ação fica.
- [x] `e2e/acompanhamento-v2-plano.spec.ts`: marcar uma ação como feita em outra aba do navegador
  e abrir o Plano pelo menu mostra o estado novo (prova que o dado vem fresco sem o efeito).

### T2.4 Listas longas sem pré-carga por linha

**Arquivos:** `plano-semana.tsx`, `fila.tsx`, `mentorados-lista.tsx`, `leads-browser.tsx`,
`pipeline.tsx`, `today.tsx`.

- [x] `prefetch={false}` nos `<Link>` de linha e de card (também `reunioes-agenda` e
  `onboarding-funil`).

### T2.5 Prova

**Arquivos:** criar `e2e/navegacao-leve.spec.ts`.

- [x] Abrir `/avisos`, esperar 3 s: nenhuma linha nova em `audit_log` com `action` em
  (`report.view`, `today.view`, `lead.list`).
- [x] Abrir `/acompanhamento/plano`, esperar 3 s: nenhuma requisição `_rsc` para a própria rota
  depois da carga e no máximo 20 requisições `_rsc` no total (eram 67).
- [x] `pnpm lint && pnpm typecheck`, e2e verde, conferir o limite de 150 KB de `/leads`. PR #96.
- [x] ITODEV: `v0.15.2-rc` no ar (api e web), roteiro da Fase 1 passou nele.

## Fase 3 — API: canal ao vivo, relatórios, índices

**Status:** ✅ feita (12/11/2026, PR #98, migrations 0062–0063; ITODEV `v0.15.4-rc` 18/18) · **Feito quando:** metas de T3.4 batidas e suítes verdes.

### T3.1 Canal ao vivo por contador (opção A de D2)

**Arquivos:** migration `00NN_revisao.sql`, `api/src/events/events.controller.ts`, criar
`api/src/events/revision.service.ts`, `apps/api/test/events.e2e.test.ts`.

**Produz:** tabela `app_revision (id boolean primary key default true, n bigint not null)` com uma
linha; função de gatilho `app_revision_bump()`; `RevisionService.changes$: Observable<void>`.

- [x] Gatilho nas tabelas do resumo antigo (`leads`, `lead_tasks`, `lead_timeline`,
  `chat_messages`, `chat_channels`, `chat_reads`, `notifications`) e também em `meetings` e `deals`,
  que mudam quais leads o closer vê (o resumo antigo, sob a RLS, pegava isso; o e2e `login.spec.ts`
  "revogam acesso sem recarregar" pegou a falta), migration **0062**. `npac_app` só
  lê `app_revision` (RLS `using (true)`, sem UPDATE). **Mudança de forma:** em vez de `FOR EACH
  STATEMENT` imediato, é `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED FOR EACH ROW` com
  `set_config` local para somar uma vez por transação. Motivo: o gatilho por instrução trava a linha
  do contador no meio da transação (uma transação longa seguraria as escritas de todos, e quem já
  travou um lead e espera o contador fecha deadlock com quem segura o contador e espera o lead); no
  commit, a trava dura milissegundos e o aviso só sai com a escrita pronta. UPDATE que não muda nada
  não soma: o Chat regrava "lido até" com o mesmo valor a cada recarga, e isso virava um laço de
  avisos a cada 2 s (o resumo antigo também não mudava nesse caso).
- [x] Correção pedida na T1.5 (falha do `mobile-layout` no PR #95, carga dupla ao abrir): `/api/me`
  traz `revision`; o layout passa ao `LiveUpdates`, que conecta com `?rev=`; o servidor responde
  `ready` se o contador não mudou desde o render e `invalidate` se mudou (ou sem `rev`). No cliente,
  só `invalidate` recarrega. O evento continua só `{ type }`.
- [x] `RevisionService`: um `timer(0, 2000)` com `share()` para o processo inteiro (só corre com
  alguém conectado), lê `n` e emite quando muda; erro de leitura pula a rodada. `EventsController`
  assina `changes$` (só depois do `ready`) e confere a sessão ao abrir e a cada 10 s (`heartbeat`).
- [x] Testes: uma escrita gera um `invalidate` em cada uma de três conexões e o sinal seguinte é o
  `heartbeat` (saiu uma vez só); revisão do render em dia dá `ready`, velha ou ausente dá `invalidate`; sem escrita, só `heartbeat`; o contador é lido no máximo uma vez a
  cada 2 s com três abas; "lido até" repetido não avisa; usuário desativado recebe `session-ended`
  em até 10 s. No banco (`packages/db/test/app-revision.test.ts`): transação grande soma 1, rollback
  não soma, invisível antes do commit, cada tabela soma, UPDATE igual não soma.

### T3.2 Relatório em menos consultas

**Arquivos:** `api/src/finance/reports.service.ts`, `apps/api/test/reports.e2e.test.ts`.

- [x] Antes de mexer: teste que compara a resposta inteira (texto JSON, byte a byte) de `search` e
  de `GET /team` com uma cópia congelada da versão antiga (`apps/api/test/reports-legacy.ts`), para 8
  filtros (mês; `sdrId`; `closerId` + `productId`; hoje; intervalo; closer; perfil + página; etapa +
  origem) × 4 papéis (Diretoria, Head, SDR, closer), com leads, reuniões, vendas parceladas,
  estornadas e lead excluído espalhados por este mês e o anterior. Também gravei as 92 respostas
  (search, summary e team, 11 filtros × 4 pessoas) no `npac_e2e_perf` antes e depois: **92 de 92
  iguais**.
- [x] `scope` traz só `id, sdr_id, tier, created_at`; `calls` e `sales` só as colunas usadas;
  métricas, conversão e taxas numa consulta (`count(*) filter`); `daily` e `previousDaily` numa
  consulta com `group by` do dia de Brasília e `left join` na série (o dia de mesma posição do
  período anterior vai na mesma linha); `bySdr`, `byCloser`, `byProduct` e a página ficam como
  consultas próprias (a página lê `leads` direto). De 9 consultas para 6; a série diária era 720 ms.
- [x] `GET /team`: `peopleOfMonth(tx)` roda só `bySdr` e `byCloser` (sem métricas, série, produtos
  e página), na mesma transação dos usuários e das vendas por pessoa.

### T3.3 Índices

**Arquivos:** migration `00NN_indices_desempenho.sql`, `db/src/schema/*.ts`.

- [x] Testados os três no `npac_e2e_perf` com `auto_explain` (Pipeline, relatório, Leads, feed).
- [x] Migration **0063** com os dois que entraram em plano: `lead_timeline (at desc, id)` (feed:
  Index Scan, 78 → 14 ms) e `leads (stage_id) where deleted_at is null` (Pipeline: Bitmap Index
  Scan em cada coluna, 38 → 35 ms). `leads (created_at) where deleted_at is null` **ficou de fora**:
  não apareceu em nenhum plano.

### T3.4 Medir e fechar

- [x] Metas (Diretoria, `npac_e2e_perf`, mediana de 5 com `scripts/perf/medir.sh`, API em produção
  local na 4152):

  | Medida | Auditoria | Antes (12/11) | Depois (12/11) | Meta |
  |---|---|---|---|---|
  | `POST /api/reports/search {"period":"MONTH"}` | 1.012 ms | 982 ms | **143 ms** ✅ | ≤ 200 ms |
  | `GET /api/team` | 1.073 ms | 970 ms | **54 ms** ✅ | ≤ 200 ms |
  | `GET /api/reports/activity` | 83 ms | 77 ms | **14 ms** ✅ | ≤ 20 ms |
  | canal ao vivo, 10 abas por 20 s | por aba | 100 resumos md5 + 330 consultas de sessão | **10 leituras do contador** + 96 de sessão ✅ | 1 a cada 2 s no processo |
  | `POST /api/reports/summary {"period":"MONTH"}` | 1.055 ms | 966 ms | 138 ms | — |
  | igor (SDR) `POST /api/reports/search` | | 861 ms | 127 ms | — |
  | sonia (closer) `POST /api/reports/search` | | 1.068 ms | 339 ms | — |

  A closer fica em 339 ms porque cada uma das 6 consultas paga a política de `leads` (`id = any`
  da lista do closer, varrida linha a linha); sem meta nesta fase. Contagem do canal com
  `log_min_duration_statement = 0` só para `npac_app` no `npac_e2e_perf` (desligado depois).
- [x] Revisor independente (somente leitura): relatório e `/team` conferidos campo a campo contra a
  cópia congelada, sem achado (filtros, janelas, ordem das chaves, corte do SDR). Gatilho: dedupe,
  deadlock, SECURITY DEFINER e laço de avisos sem achado; pediu medir a fila no commit (todo commit
  que escreve nas tabelas vigiadas atualiza a mesma linha): 20 escritores simultâneos, 3.000 commits no
  `npac_e2e_perf`, **456–467/s com o gatilho × 467–475/s sem** (≤ 4%). TRUNCATE e
  `session_replication_role = replica` (seeds) não avisam: fora do caminho do app.
- [x] PR #98 (squash `a3bf7fd`, CI verde: verify, e2e, pr-checks).
- [x] ITODEV `v0.15.4-rc`, roteiro pela API com contas próprias `tcf3*` (desativadas no fim, lead
  apagado): **18/18**. `/api/me` traz a revisão; closer conecta com ela e recebe `ready`; revisão
  diferente ou ausente recebe `invalidate`; o lead que o SDR cadastra com reunião para o closer
  avisa o canal dele em ~1,5 s e ele abre a ficha; o sinal só leva `type`. Relatório do mês da
  Diretoria com vendas e série diária fechando com as métricas; SDR sem nenhum valor de venda no
  relatório e só os próprios números na Equipe; feed e Pipeline abrem. Tempos da minha máquina (com
  rede): relatório 200 ms, Equipe 151 ms, feed 137 ms, Pipeline 185 ms (Diretoria); relatório do
  SDR 203 ms e do closer 201 ms.

## Fase 4 — Interface: movimento e resposta

**Status:** ✅ feito (12/11/2026, D3; opção **B** escolhida pelo Gabriel) · **Feito quando:** capturas em
375 / 768 / 1024 / 1440 px conferidas e e2e verde.

Medido (`document.getAnimations()`, entrada pelo menu, build de dev com 20.618 leads): a última animação de
entrada termina em **280 ms** em Leads, Pipeline, Dashboard e Hoje (antes: 1.220, 2.230 e 1.950 ms); o
Pipeline caiu de 215 para 12 animações. Janelinhas: entrada 200 ms, saída 140 ms. JS de `/leads`:
149,8 KB gzip (o aviso "Salvo" não usa React para não pesar). Capturas e GIFs na pasta de notas da
coordenação (`capturas-fase-4/`).

### T4.1 Três opções de movimento para o Gabriel escolher

- [x] Página só de dev com a mesma tela (Leads) em três variantes e um vídeo ou sequência de
  capturas de cada: **A** só opacidade, 160 ms, sem cascata · **B** sobe 6 px + opacidade, 220 ms,
  cascata de 3 blocos × 30 ms · **C** a atual encurtada (12 px, 320 ms, sem desfoque). Nenhuma usa
  `filter: blur`. Esperar a escolha antes de T4.2. *(Feito sem página nova: as variantes foram
  aplicadas só no navegador, por cima da tela real, e mostradas em GIF; medido: A 160 ms, B 280 ms,
  C 740 ms. Gabriel escolheu B.)*

### T4.2 Entrada de página e tokens

**Arquivos:** `app/globals.css:859-909`.

- [x] Aplicar a variante escolhida em `.page-reveal`, `.reveal`, `.reveal-grid`. Cards do Pipeline
  não animam um a um (só as colunas). Meta: última animação de entrada termina em ≤ 300 ms em
  Leads, Pipeline e Dashboard (medir com `document.getAnimations()`; os gráficos do Dashboard
  ficam de fora da meta).
- [x] Caso 6 do Foco: e2e com `reducedMotion: 'reduce'` não encontra animação em andamento
  (`e2e/resposta-imediata.spec.ts`; o movimento reduzido também zera os atrasos da cascata).

### T4.3 Diálogos, abas e linhas do Acompanhamento

**Arquivos:** `acompanhamento/modulo.css`, `components/acompanhamento/dialogo.tsx`,
`components/stage-move-dialog.tsx`.

- [x] `.ac-dialogo` e o diálogo de mover etapa: entrada e saída com `@starting-style` e
  `transition … allow-discrete` (como o `::picker(select)` em `globals.css:1444`), `--dur` e
  `--ease-out`.
- [x] Linhas clicáveis, abas (`.tabs a`), botões e cartões do módulo: estado de hover e de toque
  usando os tokens `--dur-fast` / `--dur-press`.

### T4.4 Resposta imediata nas ações

**Arquivos:** criar `components/toast.tsx`; `components/acompanhamento/fila.tsx`,
`plano-mentorado.tsx` (`BotaoFeita`), `components/pipeline.tsx`, `components/shell/nav-progress.tsx`.

- [x] `toast.tsx`: um aviso por vez, `role="status"`, some em 2,5 s; textos de D3. *(Virou
  `components/toast.ts`, sem React: a região vem do layout e o aviso é montado no DOM.)*
- [x] Concluir item da Fila, marcar ação feita no Plano e mover card no Pipeline: a tela muda no
  clique (`useOptimistic`), o `router.refresh()` vai dentro de `startTransition`, e erro desfaz e
  mostra a mensagem da API.
- [x] `NavProgress` expõe `startNavProgress()` e os `router.push` de busca, Ctrl+K, criar lead e
  nova inscrição o chamam.
- [x] e2e: com a rota da ação atrasada em 1 s, o item já aparece concluído antes da resposta; com
  erro 409, volta ao estado anterior.

### T4.5 Conferência visual

- [x] Capturas 375 / 768 / 1024 / 1440 px de Leads, Pipeline, Dashboard, Fila, Plano e ficha, nos
  dois temas; rever toda tela que usa `.page-reveal`. PR. *(Sem rolagem lateral em nenhuma; Hoje,
  Relatórios, Equipe, Admin e Mentorados revistos a 1440. ITODEV fica para o roteiro da coordenação.)*

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
