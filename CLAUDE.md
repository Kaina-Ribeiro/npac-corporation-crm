# NPAC CRM — guia para o Claude

CRM comercial da NPAC (SDRs, closers, liderança). Leia antes de explorar e abra só o que o mapa
indicar. Mantenha denso; ao mudar arquitetura, regra ou comando, atualize aqui.

## Como trabalhar

- **Pergunta não é pedido** ("o que acha?", "dá pra…?", "faz sentido…?"): opinar, dar opções e
  recomendação, esperar o "faz". Sem editar nem rodar nada.
- Português, respostas curtas, execução direta quando o pedido é explícito. Commits frequentes; push só se pedirem.
- Branch, PR, tag e release seguem `RELEASING.md` (release-kit): branch `tipo/NPAC-N-nome` a partir da
  `release/vX.Y` aberta, PR `tipo(NPAC-N): resumo` em minúsculas, squash. Tags só pela automação.
- Sem subagentes sem pedido. Plano novo grande: apresentar antes de implementar.
- Régua: CRMs robustos (Linear, Attio).
- Bug: teste que falha (RED) → correção → teste focado → suíte ao fechar.
- Segredos (senhas, chaves, `.env`): pode gerar e definir pelas ferramentas (Cubeship, shell) quando o
  pedido envolver infra; não os repita em mensagens sem necessidade. Dados reais de clientes nunca
  em ferramentas, logs ou mensagens.

## Mapa

pnpm 12 + Turborepo, Node ≥22, Postgres 16 no Docker. Prefixos: `api/` = `apps/api/src`,
`web/` = `apps/web`, `db/` = `packages/db`, `sh/` = `packages/shared/src`.

- **Shared:** papéis/`isLeader`/enums `sh/enums.ts` · `can` `sh/permissions.ts` · Zod de lead
  `sh/schemas/lead.ts`, `lead-update.ts` · usuário/pedido de acesso `sh/schemas/account.ts` ·
  DTOs `sh/dto.ts`, `finance.ts`, `today.ts` · dinheiro/datas BR `sh/money.ts`, `dates.ts`
- **Banco:** schema `db/src/schema/*.ts` · migrations `db/drizzle/00NN_*.sql` + `meta/` ·
  `withUser`, `leadContactTaken` `db/src/with-user.ts` · seed `db/src/seed*.ts`
- **Auth:** Better Auth (username, TOTP, auditoria, rate limit) `api/auth/auth.ts` · sessão e
  troca obrigatória `api/auth/session.guard.ts` · `@Can`/`@Public`/`@AllowIncomplete`
  `api/auth/*.decorator.ts` · pedido de acesso público `api/auth/request-access.ts` · env Zod `api/config/env.ts`
- **Leads:** rotas/leitura/escrita `api/leads/leads.controller.ts`, `leads.service.ts`,
  `lead-mutations.service.ts` · filtros/SQL `leads.repository.ts` · timeline+audit
  `activity.ts` (`recordActivity`) · notas/tarefas `lead-activity.*`
- **Resto da API:** reuniões `api/meetings/*` (`cancel.ts` = SQL restrito) · vendas/parcelas/estorno
  `api/finance/finance.service.ts` · relatórios/dashboard/CSV/feed `api/finance/reports.service.ts` ·
  Hoje `api/today/*` · avisos/filtros salvos `api/notifications/notifications.ts`, `views.ts` ·
  chat/handoff/equipe/playbook `api/collab/*` · admin `api/admin/users.ts`, `catalog.ts`, `lgpd.ts`,
  `access-requests.ts` · SSE `api/events/events.controller.ts` · import Firebase `api/import/*` ·
  mock do protótipo `api/dev/mock-prototype.ts`
- **Web:** layout/sidebar/bottom nav `web/app/(app)/layout.tsx`, `web/components/shell/*` · login,
  pedir acesso `web/components/login/*` · senha/MFA `components/conta/*`, `app/(conta)/*` · API
  server/client `web/lib/api.ts` / `lib/client-api.ts` · sessão (`getSession`, `pendingStep`)
  `web/lib/session.ts` · UI base (`Field`, `button`, `StageOptions`) `components/crm-ui.tsx` ·
  cargo (`ROLE_LABEL`, tag) `components/role-tag.tsx` · tokens/`.tier-*`/`.role-*` `web/app/globals.css`
- **Telas:** leads `components/leads-browser.tsx`, `lead-filters.tsx` · ficha/venda `lead-detail.tsx`,
  `sale-flow.tsx`, `finance-panel.tsx` · `pipeline.tsx`, `today.tsx`, `reports.tsx`, `dashboard-*.tsx`
  (cards reordenáveis: `dashboard-board.tsx`, `lib/dashboard-layout.ts`, `lib/board-motion.ts`) ·
  admin `admin.tsx`, `access-requests.tsx` · Ctrl+K `shell/command-palette.tsx` · avisos `inbox.tsx` ·
  textos de atividade `lib/activity-text.ts` · editor de colunas `pipeline-columns-editor.tsx` · ação
  rápida do Hoje `today-quick-action.tsx` · menu de CSV `csv-export.tsx` (API: `api/common/csv.ts`)
- **Acompanhamento (mentorados):** API `api/mentoria/*` (guarda 404 + MFA: `MentoriaController` em
  `mentoria.guard.ts`; leitura `mentoria.service.ts`, `fichas.service.ts`; escrita `escrita.service.ts`;
  import/export `.json` `import.service.ts`; mídia `midia.controller.ts`, `media-store.ts`, `media-sniff.ts`,
  `media-worker.ts`; cifra v2 `mentoria-crypto.ts`) · banco `db/src/schema/mentoria.ts` + 0028–0032
  (`mentoria_pode()`, funções `mentoria_*`) · lógica pura `sh/mentoria/*` (cliente: `@npac/shared/mentoria`,
  sem zod) · telas `web/app/(app)/acompanhamento/*`, `web/components/acompanhamento/*`, fila
  `web/lib/acompanhamento-saver.ts` · backup cifrado `infra/backup/*` (age)
- **Docs:** `docs/spec.md`; deploy `docs/deploy.md` (Oracle), `docs/deploy-cubeship.md`; planos `docs/superpowers/plans/`; releases `RELEASING.md`

Next 16 tem APIs incompatíveis: em dúvida, `web/node_modules/next/dist/docs/`. Valor exportado de
módulo `'use client'` não é legível em server component: constantes compartilhadas ficam em arquivo
sem `'use client'` (ex.: `lib/last-user.ts`, `role-tag.tsx`).

## Papéis e acesso

- **DIRETOR** ("Diretoria") > **HEAD** > SDR / CLOSER. `isLeader(role)` (`LEADER_ROLES` = DIRETOR+HEAD), nunca `role === 'HEAD'`.
- Só a Diretoria dá/tira liderança e administra contas de Head/Diretoria (`guardLeadership` em
  `admin/users.ts`); Head gerencia SDR/closer. Na RLS, `app_role()` devolve `'HEAD'` para DIRETOR (0021).
- Liderança vê tudo; SDR, os próprios leads; CLOSER, leads com reunião não cancelada dele.
  Invisível e inexistente → **404**, nunca 403. `canProspect`/`canClose` são dados; nada depende de nomes.
- **SDR não recebe R$ de venda** (pedido do cliente, 04/11/2026): `/reports/search`, `/reports/summary`
  e `/team` cortam no servidor (`dropSales`); o Dashboard do SDR mostra comparecimento. Closer igual a
  antes; liderança vê venda + comparecimento, com filtro por SDR. Vendas e pagamentos (ficha,
  cobranças do Hoje, `sale:register`) são do closer e da liderança; o SDR só marca o resultado da reunião.
- Login por **usuário** (`/sign-in/username`, `[a-z0-9_.]{3,30}`, minúsculo); login por e-mail e
  `/is-username-available` desligados. Senha mínima 3 (provisório, decisão de 29/10/2026: no dev
  todas são `123`; as regras voltam no fim).
- **Pedido de acesso** (29/10/2026): `/login/solicitar` grava em `access_requests`, fora de `user`
  (pendente não loga). Head/Diretoria aprovam no Admin escolhendo o cargo (`guardLeadership`);
  recusar apaga; expira em 7 dias; 3/hora por IP; resposta igual exista ou não o usuário (hash
  sempre, para o tempo não revelar). "Esqueci minha senha" manda pedir redefinição à liderança;
  Diretoria trancada: `reset-password-cli.js <usuário> [--mfa]` no shell da api (`db/src/reset-password.ts`).
- **Limite de tentativas de login DESLIGADO** (temporário, 04/11/2026: travava os acessos):
  `customRules[SIGN_IN] = false` em `api/auth/auth.ts`; antes era 5/min por IP. O pedido de
  acesso (3/h) e o TOTP (3/10 s, padrão do plugin) continuam limitados. Religar depois.
- MFA (TOTP) **opcional** (28/10/2026): cada um liga/desliga em `/conta/mfa`; quem ligou confirma o
  login, código enviado sozinho aos 6 dígitos (`lib/otp-input.ts`). Primeiro acesso só obriga trocar a senha.
- **Acompanhamento** (`ACOMPANHAMENTO`, 04/11/2026): só o módulo de mentorados; RLS por
  `mentoria_pode()` (papel cru, nunca `app_role()`), MFA obrigatório nas rotas `mentoria/*` para
  Diretoria e Acompanhamento, 404 para os demais. Texto sensível cifrado com AAD
  (`MENTORADO_ENCRYPTION_KEY`); mídia fora do banco em `MEDIA_DIR`; sem DELETE para `npac_app`
  (exclusão só pelas funções, que enfileiram a mídia). Filhos usam a `version` do pai (D5).
- Cookies em vez de localStorage: último usuário `npac_last_user` (`Path=/login`); ordem dos cards
  `npac_dash_<hash do id>` (`Path=/dashboard`, só IDs, o servidor já renderiza na ordem).

## Segurança e privacidade (não negociável)

- Runtime usa `npac_app` (sem BYPASSRLS); owner só em migrations/seed/fixtures.
- Consulta de domínio sempre em `withUser(db, u.id, tx => …)`: autorização de linha é RLS no SQL,
  nunca filtro em JS (`FOR UPDATE` também passa pela RLS).
- Usuários e pedidos de acesso não têm RLS (Better Auth lê `user`): guarda = `admin:manage` + auditoria.
  Leads no admin continuam via `withUser`.
- Contato, termo de busca e conteúdo pessoal nunca em URL, logs, analytics ou localStorage (há e2e
  que barra `@` e dígitos longos). Buscas/relatórios por POST. Exceção pedida pelo cliente (04/11):
  o link do Google Agenda leva nome do lead, perfil, sigla de quem agendou e o handoff; nunca
  telefone nem Instagram.
- Telefone E.164 BR, AES-256-GCM + blind index HMAC. Renda só em faixas ≥ R$ 5 mil.
- Timeline append-only: tipo, IDs e nomes de campos, **nunca valores**. Auditoria sem e-mail nem nome.
- API com `Cache-Control: no-store`. SSE só manda `{ type }`.
- Chat: DM privada por RLS mesmo para liderança; mensagens append-only.
- LGPD: eliminação só via `lgpd_anonymize_lead`; nada de outro caminho que apague fato financeiro.
- CSV com contato: só liderança, auditado, fórmulas neutralizadas.

## Regras de escrita e negócio

- PATCH exige `version` (409 `VERSION_CONFLICT`); campos permitidos explícitos.
- Duplicidade de contato: advisory locks em ordem determinística; resposta não revela o dono.
- Mudança + `recordActivity` na **mesma transação**.
- Dinheiro em centavos inteiros (`sh/money.ts`), nunca `parseFloat * 100`.
- Venda: uma ativa por lead; `requestKey` idempotente + hash do payload; entrada + parcelas = total,
  parcelas futuras; só liderança estorna; lead com venda ativa não é excluído.
- **Etapa VENDA = venda ativa**: entra só por `POST /finance/deals`, sai só pelo estorno. PATCH recusa
  entrar (409 `SALE_REQUIRED`) e sair com venda (409 `ACTIVE_SALE`). Selects usam `<StageOptions>`
  (Venda desabilitada); ação em massa não oferece Venda.
- Resultado de reunião só depois do horário (400 "A reunião ainda não aconteceu"). Resultados:
  `DONE`, `NO_SHOW`, `RESCHEDULED`. Valor por reunião realizada = `MEETING_VALUE_CENTS`
  (P0 900, P1 700, P2 500), pelo perfil **atual** do lead; no-show e remarcada não somam.
- **Etapas**: `pipeline_stages.key` é texto; `system` é coluna gerada (`key` ∈ `STAGE_KEYS`). A
  liderança cria (`C_` + 8 hex), renomeia, reordena e exclui; não exclui de sistema, com lead ativo
  ou referenciada por venda (`deals.previous_stage_id`, imutável). Validação: `stageKeySchema`.
- Hoje: atrasado = próximo contato < **agora**; a tela move vencidos no navegador (sem polling, que
  gravaria auditoria). Ação rápida `POST /leads/:id/quick-action` (Chamado/Remarcado/Próxima ação).
- Desativar usuário derruba sessões; leads dele vão por `POST /admin/users/:id/transfer-leads`.
- Fuso `America/Sao_Paulo`; `datetime-local` = Brasília (`brasiliaInput`); intervalos [início, fim);
  em `sql` cru, datas como ISO string.
- Métricas em SQL com CTEs que não multiplicam linhas; vendas contam por `deals`, não por etapa.
- Paginação no servidor; CSV recusa > 10 mil linhas; cabeçalhos do CSV com `csvHeaders` depois de
  gerar o arquivo (com `@Header` fixo, erro de validação virava 500). Leads e Relatórios exportam por
  período, filtro atual ou tudo (`period: 'ALL'` só no CSV).
- Erros da API em português para o usuário final (`BadRequestException('…')`); o `clientApi` mostra a
  mensagem, as padrão do Nest viram texto genérico. `clientApi` aceita 204.

## Banco

- Migration nova: `pnpm --filter @npac/db generate` (ou SQL manual) → `00NN_nome.sql` + snapshot +
  `_journal.json`. **Nunca reescreva migration aplicada**; crie sucessora.
- RLS, grants, triggers e SECURITY DEFINER são SQL manual: revise além do schema. `npac_app` sem
  UPDATE numa tabela não pode `SELECT … FOR UPDATE` nela.
- Valor novo de enum não vale na mesma transação da migration (compare como texto).
- Aplicar no dev: `pnpm --filter @npac/db build && pnpm --filter @npac/db migrate`.
  psql: `docker exec npac-corporation-postgres-1 psql -U npac_owner -d npac`.
- Apagar lead/usuário à mão: FKs em `chat_reads`, `chat_*`, `payments`, `deals`, `lead_notes`,
  `lead_tasks`, `notifications`, `lead_timeline`, `meetings`, `lgpd_requests` (usuário: também `session`, `account`).

## Comandos

```sh
docker compose up -d                 # Postgres local
pnpm lint && pnpm typecheck          # antes de commitar
pnpm --filter @npac/api test         # vitest e2e da API (~1 min, bancos npac_test*)
pnpm --filter @npac/db test          # RLS/migrations/seed
pnpm --filter @npac/shared test
pnpm --filter @npac/api exec vitest run test/leads.e2e.test.ts -t "nome"   # focado
pnpm --filter @npac/web e2e [e2e/admin.spec.ts]   # Playwright (~2 min)
pnpm exec prettier --write <arquivos>
```

- **Dev só pelo painel**: `preview_start` `npac-dev` (`.claude/launch.json`), nunca `pnpm dev` em
  segundo plano (porta 3000). e2e e dev disputam portas e `.next`: antes do e2e, `preview_stop` e
  libere 3000/4000; depois, `rm -rf apps/web/.next` e `preview_start`. e2e usa API 4100, web 3100
  (`E2E_WEB_PORT=3200` se outro projeto ocupar) e banco `npac_e2e`.
- Testes só recriam `npac_test*`/`npac_e2e*`; nunca aponte para outro banco.
- API e e2e compartilham usuários: teste que mexe em MFA/senha/papel restaura no fim; `truncate leads`
  inclui as tabelas com FK.
- e2e loga com `email.split('@')[0]`. Seeds: diretor (DIRETOR), ana/ronaldo (HEAD), ale/murilo/igor
  (SDR), sonia (CLOSER), `@npac.com.br`; teste que troca papel: `update "user" set role = …` e restaurar.
- Playwright: `filter({ visible: true })`/`exact: true` (layout mobile oculto duplica controles);
  `role=alert` também pega o anunciador de rotas do Next; nada de `networkidle` (SSE).
- JS de `/leads` < 150 KB gzip (teste; hoje ~148). Sem libs pesadas no cliente, nem zod; prefira server components.
- Capturas dos e2e: `apps/web/test-results/*.png`.

## Não commitar

`.env`, dumps, `test-results/`, logs, `node_modules`, `.claude/`. Commits sem linha de
atribuição.
