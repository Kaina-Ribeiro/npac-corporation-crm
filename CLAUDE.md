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
  push (Web Push) e despertador dos lembretes `api/push/*` ·
  mock do protótipo `api/dev/mock-prototype.ts`
- **Web:** layout/sidebar/bottom nav `web/app/(app)/layout.tsx`, `web/components/shell/*` (menu da
  sidebar e do Ctrl+K, grupos e sub-itens do Acompanhamento: `shell/nav-menu.tsx`, só servidor, para
  não pesar no JS; `nav-items.tsx` vai ao cliente pela barra inferior) · classes de botão `lib/button.ts` · dropdown (todos os `<select>`) com o visual do CRM só por CSS
  (`appearance: base-select` + `::picker(select)` no fim de `globals.css`; Safari fica com o do
  sistema; Lightning CSS não aceita pseudo-classe depois de `::picker`, use `select:open::picker(select)`) · login,
  pedir acesso `web/components/login/*` · senha/MFA `components/conta/*`, `app/(conta)/*` · API
  server/client `web/lib/api.ts` / `lib/client-api.ts` · sessão (`getSession`, `pendingStep`)
  `web/lib/session.ts` · UI base (`Field`, `button`, `StageOptions`) `components/crm-ui.tsx` ·
  cargo (`ROLE_LABEL`, tag) `components/role-tag.tsx` · tokens/`.tier-*`/`.role-*` `web/app/globals.css`
- **Telas:** leads `components/leads-browser.tsx`, `lead-filters.tsx` · ficha/venda `lead-detail.tsx`,
  `sale-flow.tsx`, `finance-panel.tsx` · `pipeline.tsx`, `today.tsx`, `reports.tsx`, `dashboard-*.tsx`
  (cards reordenáveis: `dashboard-board.tsx`, `lib/dashboard-layout.ts`, `lib/board-motion.ts`) ·
  admin `admin.tsx`, `access-requests.tsx` · Ctrl+K `shell/command-palette.tsx` · avisos `inbox.tsx` ·
  textos de atividade `lib/activity-text.ts` · campos por etapa `stage-fields.tsx` (+ `lib/stage-fields.ts`,
  `lib/stage-kind.ts`) e janelinha `stage-move-dialog.tsx` (Pipeline, lista, massa) · editor de colunas `pipeline-columns-editor.tsx` · ação
  rápida do Hoje `today-quick-action.tsx` · menu de CSV `csv-export.tsx` (API: `api/common/csv.ts`) ·
  avisos compartilhados (selo do chat, `(N)` na aba, lembretes) `lib/alerts.ts`, `meeting-reminder.tsx` ·
  push no aparelho `lib/push.ts`, `public/sw.js`, `/conta/avisos`
- **Acompanhamento (mentorados):** API `api/mentoria/*` (guarda 404 + MFA: `MentoriaController` em
  `mentoria.guard.ts`; leitura `mentoria.service.ts`, `fichas.service.ts`; RDV `rdv.service.ts`/`rdv.controller.ts`; escrita `escrita.service.ts`;
  import/export `.json` `import.service.ts`; mídia `midia.controller.ts`, `media-store.ts`, `media-sniff.ts`,
  `media-worker.ts`; cifra v2 `mentoria-crypto.ts`) · banco `db/src/schema/mentoria.ts` + 0029–0034
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
- **MFA DESLIGADO** (temporário, 05/11/2026, pedido do Gabriel): `MFA_LIGADO = false` em
  `sh/enums.ts`. Login não pede código (o gancho do `twoFactor` em `api/auth/auth.ts` fica vazio), o
  Acompanhamento não exige, a tela `/conta/mfa` e os links somem; autenticadores cadastrados ficam
  guardados e os testes de MFA ligado são pulados. Religar depois: `true` e rodar as suítes.
- MFA (TOTP) **opcional** (28/10/2026, vale com `MFA_LIGADO`): cada um liga/desliga em `/conta/mfa`; quem ligou confirma o
  login, código enviado sozinho aos 6 dígitos (`lib/otp-input.ts`). Primeiro acesso só obriga trocar a senha.
- **Acompanhamento** (`ACOMPANHAMENTO`, 04/11/2026): só o módulo de mentorados; RLS por
  `mentoria_pode()` (papel cru, nunca `app_role()`), MFA obrigatório nas rotas `mentoria/*` para
  Diretoria e Acompanhamento, 404 para os demais. O cargo Acompanhamento não vê nada do comercial
  (05/11/2026): `PermissionsGuard` dá 404 em toda rota sem `@AllRoles()` (`api/auth/all-roles.decorator.ts`;
  hoje `me`, `events` e o módulo), e o web mostra só o item Acompanhamento (`hasCommercialAccess`,
  sidebar/Ctrl+K/Mais/rodapé). Telas comerciais ficam em `web/app/(app)/(comercial)/`, cujo layout
  manda o cargo ao módulo com carga completa (o layout de `(app)` não roda na navegação do
  navegador; redirect do servidor ali deixava o módulo em branco). Entrada única: login, troca de
  senha e MFA vão para `/`, que escolhe o destino pelo cargo. Rota nova que o cargo use leva
  `@AllRoles()`; o teste `acompanhamento-sem-comercial` varre todas. Texto sensível cifrado com AAD
  (`MENTORADO_ENCRYPTION_KEY`); mídia fora do banco em `MEDIA_DIR`; sem DELETE para `npac_app`
  (exclusão só pelas funções, que enfileiram a mídia). Filhos usam a `version` do pai (D5).
- **Siglas das mentorias** (Gabriel, 04/11/2026): RDV = Rico de Verdade · IDR = Introdução da
  Riqueza · PME = Plano Mensal de Enriquecimento · 2M = Marco e Mudança · 6M = sem definição ainda.
  Nas telas vale o texto literal do PDF, exceto IDR: "Introdução da Riqueza" (o PDF diz "à"; corrigido).
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
- **Etapa VENDA = venda ativa ou venda a registrar**: entra por `POST /finance/deals` ou pelo
  cadastro em Venda Fechada; sai pelo estorno. PATCH recusa entrar (409 `SALE_REQUIRED`) e sair com
  venda (409 `ACTIVE_SALE`). Selects usam `<StageOptions>` (Venda desabilitada; `allowSale` só no
  cadastro); ação em massa não oferece Venda.
- **Venda Fechada no cadastro** (NPAC-39, 05/11/2026): todos que cadastram (SDR e liderança; closer
  não cadastra) informam a reunião já realizada (`meeting`, até agora; criada `DONE` com `outcome_at`
  = horário, origem DIRETO: o SDR recebe por ela nesse dia) e o closer dela vira o do lead. "Registrar
  a venda agora" (`sale`, só `sale:register`; SDR → 403) usa `insertSale` de `finance.service.ts`:
  `closedOn` (nunca futuro) vira `deals.closed_at`, entrada recebida nesse dia, closer = o da reunião,
  idempotente por `requestKey` + hash do pedido. Sem a venda: **venda a registrar** (`saleToRegister`
  no DTO, `lead_sale_pending()` da 0038), selo na ficha/Pipeline e aviso `sale.pending` ao closer.
  Registrar depois mantém em Venda; o estorno dessa venda volta para EM_FOLLOW (`previous_stage_id`).
  Regra em `api/leads/leads.service.ts` (`checkSoldLead`/`registerSold`); tela `components/sold-fields.tsx`
  - `lib/sold-fields.ts`.
- **Campos por etapa** (NPAC-38, 05/11/2026, "1A 2A 3A"): Agendados pedem `meeting` (criada na
  mesma transação, origem pela etapa, `rearm()` depois do commit; reunião futura aberta dispensa),
  Agendou Pagamento pede data (`next_contact_at`) + produto + valor, Sem Perfil pede `lost_reason`
  (+ texto se Outro; limpa o próximo contato). 409 `MEETING_/PAYMENT_/REASON_REQUIRED` só quando a
  etapa muda; leads antigos ficam como estão. Sair da etapa ou registrar venda apaga pagamento e
  motivo. Closer grava esses campos só junto da troca (gatilho da 0037). Regra em `api/leads/stage-fields.ts`.
- Resultado de reunião só depois do horário (400 "A reunião ainda não aconteceu"). Resultados:
  `DONE`, `NO_SHOW`, `RESCHEDULED`. Valor por reunião realizada = `MEETING_VALUE_CENTS`
  (P0 900, P1 700, P2 500), pelo perfil **atual** do lead; no-show e remarcada não somam.
- **Perfil = faixa de renda** (Igor, 05/11/2026, "1B, 2B"): 5–8 mil P2, 8–15 mil P1, 15 mil+ P0
  (`TIER_BY_INCOME_BAND` em `sh/enums.ts` + gatilho `leads_tier_from_income`, 0036, que reescreve
  `tier` em todo INSERT e UPDATE de faixa/perfil). Sem troca à mão: cadastro ignora `tier`, PATCH
  recusa; lista e ação em massa só mostram. A 0036 recalculou os leads antigos. Faixa nova = as duas tabelas.
- **Etapas**: `pipeline_stages.key` é texto; `system` é coluna gerada (`key` ∈ `STAGE_KEYS`). A
  liderança cria (`C_` + 8 hex), renomeia, reordena e exclui; não exclui de sistema, com lead ativo
  ou referenciada por venda (`deals.previous_stage_id`, imutável). Validação: `stageKeySchema`.
- **Origem do lead** (lista do cliente, 05/11/2026): `LEAD_SOURCE_OPTIONS` + rótulos
  `LEAD_SOURCE_LABELS` em `sh/enums.ts`; cadastro exige uma delas. "Outro" pede texto em
  `source_other` (≤ 80, CHECK só com `OUTRO`; timeline grava como campo `source`; LGPD apaga).
  Instagram/WhatsApp são antigas: ficam nos leads existentes ("(antigo)"), filtros mostram, cadastro
  e troca recusam. Origem nova = valor no enum `lead_source` (migration) + rótulo.
- Hoje: atrasado = próximo contato < **agora**; a tela move vencidos no navegador (sem polling, que
  gravaria auditoria). Ação rápida `POST /leads/:id/quick-action` (Chamado/Remarcado/Próxima ação).
- Desativar usuário derruba sessões; leads dele vão por `POST /admin/users/:id/transfer-leads`.
- Fuso `America/Sao_Paulo`; `datetime-local` = Brasília (`brasiliaInput`); intervalos [início, fim);
  em `sql` cru, datas como ISO string.
- Métricas em SQL com CTEs que não multiplicam linhas; vendas contam por `deals`, não por etapa.
- Paginação no servidor; CSV recusa > 10 mil linhas; cabeçalhos do CSV com `csvHeaders` depois de
  gerar o arquivo (com `@Header` fixo, erro de validação virava 500). Leads e Relatórios exportam por
  período, filtro atual ou tudo (`period: 'ALL'` só no CSV). `POST /reports/export` = relatório do
  período em CSV (resumo + por SDR/closer/produto, sem contato), para todos; SDR sem venda. As
  exportações dos Relatórios leem o formulário na tela, não o último "Atualizar".
- Erros da API em português para o usuário final (`BadRequestException('…')`); o `clientApi` mostra a
  mensagem, as padrão do Nest viram texto genérico. `clientApi` aceita 204.

## Avisos e lembretes (NPAC-26, 04/11/2026)

- Chat: selo de não lidas (`chatUnread` em `/notifications`) e `(N)` no título, pelo SSE. Push sem
  texto: "Nova mensagem no Chat" (Geral → todos menos o autor) ou "de <nome>" (DM → destinatário).
- Lembretes só para o dono do lead (`leads.sdr_id`): `H1` (60 min) e `M15` (15 min) com
  "Confirmação enviada" (`POST /meetings/:id/confirm`, `meeting_confirmations` por horário, timeline
  `meeting.confirmed`); `M1` só aviso. Etapa vigente calculada no navegador (`sh/reminders.ts`).
  Liderança vê "1 h: não confirmada" na ficha. Remarcar recomeça; cancelada/resultado não avisa.
- Push dos lembretes: `ReminderScheduler` = um único timer para o próximo (`meeting_reminder_next`),
  rearmado ao subir a API e depois de criar/remarcar/cancelar/resultado/transferir. Disparo via
  `meeting_reminder_claim` (advisory lock + `meeting_reminders_sent`): uma vez por etapa, só a mais
  recente se a API ficou parada. Sem polling. Testes trocam `PUSH_SENDER` e `REMINDER_CLOCK`.
- Push: VAPID opcional no env (sem chaves = desligado). Inscrição por `push_subscribe` (o aparelho
  vai para quem logou por último); sair e desativar usuário apagam; 404/410 apaga.

## Banco

- Migration nova: `pnpm --filter @npac/db generate` (ou SQL manual) → `00NN_nome.sql` + snapshot +
  `_journal.json`. **Nunca reescreva migration aplicada**; crie sucessora.
- Journal: `idx` sequencial e `when` maior que o da última entrada. O migrator só aplica `when` acima
  do último aplicado: migration de branch antiga com `when` menor é **pulada em produção sem erro**.
  Ao trazer migrations do main, renumere as suas para depois e refaça `when`, snapshots e `prevId`
  (teste "idx e `when` crescem juntos" em `db/test/migrations.test.ts`).
- Drizzle: em select de uma tabela só, `${tabela.id}` sai sem o nome da tabela. Em subconsulta
  correlacionada escreva o nome inteiro (`where c.ficha_id = mentoria_fichas.id`): o `id` solto é
  lido da tabela de dentro e a contagem dá zero.
- RLS, grants, triggers e SECURITY DEFINER são SQL manual: revise além do schema. `npac_app` sem
  UPDATE numa tabela não pode `SELECT … FOR UPDATE` nela.
- Valor novo de enum não vale na mesma transação da migration (compare como texto).
- Aplicar no dev: `pnpm --filter @npac/db build && pnpm --filter @npac/db migrate`.
  psql: `docker exec npac-corporation-postgres-1 psql -U npac_owner -d npac`.
- Apagar lead/usuário à mão: FKs em `chat_reads`, `chat_*`, `payments`, `deals`, `lead_notes`,
  `lead_tasks`, `notifications`, `lead_timeline`, `meetings` (`meeting_confirmations` e
  `meeting_reminders_sent` em cascata), `lgpd_requests` (usuário: também `session`, `account`,
  `push_subscriptions`). `truncate` de `meetings` nos testes lista as duas tabelas de lembretes.

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
- JS de `/leads` < 150 KB gzip (teste; hoje ~149,4). Sem libs pesadas no cliente, nem zod; prefira server components.
- Capturas dos e2e: `apps/web/test-results/*.png`.

## Não commitar

`.env`, dumps, `test-results/`, logs, `node_modules`, `.claude/`. Commits sem linha de
atribuição.
