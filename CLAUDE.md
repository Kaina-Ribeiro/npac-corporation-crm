# NPAC CRM — guia para o Claude

CRM comercial da NPAC (SDRs, closers e liderança). Este arquivo é carregado em toda
conversa: **leia-o antes de explorar o repo** e só abra os arquivos que o mapa abaixo
indicar. Mantenha-o denso; ao mudar arquitetura, regra ou comando, atualize aqui.

## Como trabalhar com o usuário

- **Pergunta não é pedido.** "O que acha?", "dá pra…?", "faz sentido…?" → conversar:
  dar opinião, opções e recomendação, e esperar o "faz". Não editar código nem rodar nada.
- Português, respostas curtas, execução direta quando o pedido é explícito. Commits frequentes; push só se pedirem.
- Não abra subagentes sem pedido. Plano novo grande: apresentar antes de implementar.
- Sempre comparar com CRMs robustos (Linear, Attio): o produto precisa ser robusto.
- Bug: teste que falha primeiro (RED) → correção → teste focado → suíte ao fechar.
- Nunca imprima `.env`, senhas, chaves ou dados reais em ferramentas/logs/mensagens.

## Stack e mapa (onde está cada coisa)

Monorepo pnpm 12 + Turborepo, Node ≥22 (validado 24), Postgres 16 no Docker.
Pacotes: `@npac/web`, `@npac/api`, `@npac/db`, `@npac/shared`.

| Preciso de…                                         | Arquivo                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Papéis, labels, `isLeader`, enums                   | `packages/shared/src/enums.ts`                                                            |
| Matriz papel → ação (`can`)                         | `packages/shared/src/permissions.ts`                                                      |
| Schemas Zod de lead                                 | `packages/shared/src/schemas/lead.ts`, `lead-update.ts`                                   |
| DTOs compartilhados                                 | `packages/shared/src/dto.ts`, `finance.ts`, `today.ts`                                    |
| Dinheiro / datas de Brasília                        | `packages/shared/src/money.ts`, `dates.ts`                                                |
| Schema do banco (Drizzle)                           | `packages/db/src/schema/*.ts`                                                             |
| Migrations (SQL + RLS manual)                       | `packages/db/drizzle/00NN_*.sql` + `meta/`                                                |
| `withUser`, `leadContactTaken`                      | `packages/db/src/with-user.ts`                                                            |
| Seed (usuários, produtos, playbook)                 | `packages/db/src/seed*.ts`                                                                |
| Better Auth (username, TOTP, auditoria, rate limit) | `apps/api/src/auth/auth.ts`                                                               |
| Sessão, troca de senha obrigatória                  | `apps/api/src/auth/session.guard.ts`                                                      |
| `@Can`, `@Public`, `@AllowIncomplete`               | `apps/api/src/auth/*.decorator.ts`                                                        |
| Env validado (Zod)                                  | `apps/api/src/config/env.ts`                                                              |
| Leads: rotas / leitura / escrita                    | `apps/api/src/leads/leads.controller.ts`, `leads.service.ts`, `lead-mutations.service.ts` |
| Filtros e SQL de leads                              | `apps/api/src/leads/leads.repository.ts`                                                  |
| Timeline + auditoria na transação                   | `apps/api/src/leads/activity.ts` (`recordActivity`)                                       |
| Notas/tarefas do lead                               | `apps/api/src/leads/lead-activity.*`                                                      |
| Reuniões                                            | `apps/api/src/meetings/*` (`cancel.ts` = SQL restrito)                                    |
| Vendas, parcelas, estorno                           | `apps/api/src/finance/finance.service.ts`                                                 |
| Relatórios, dashboard, CSV, feed                    | `apps/api/src/finance/reports.service.ts`                                                 |
| Hoje + tarefas pessoais                             | `apps/api/src/today/*`                                                                    |
| Avisos (inbox) / filtros salvos                     | `apps/api/src/notifications/notifications.ts`, `views.ts`                                 |
| Chat, handoff, equipe, playbook                     | `apps/api/src/collab/*`                                                                   |
| Admin usuários/catálogo/LGPD                        | `apps/api/src/admin/users.ts`, `catalog.ts`, `lgpd.ts`                                    |
| Pedido de acesso (público / aprovação)              | `apps/api/src/auth/request-access.ts` / `admin/access-requests.ts`                        |
| SSE (tempo real)                                    | `apps/api/src/events/events.controller.ts`                                                |
| Import do Firebase                                  | `apps/api/src/import/*`                                                                   |
| Dados do protótipo no dev                           | `apps/api/src/dev/mock-prototype.ts`                                                      |
| Layout do app / sidebar / bottom nav                | `apps/web/app/(app)/layout.tsx`, `components/shell/*`                                     |
| Login / senha / MFA                                 | `components/login/login-form.tsx`, `components/conta/*`, `app/(conta)/*`                  |
| Chamadas à API (server / client)                    | `apps/web/lib/api.ts` / `lib/client-api.ts`                                               |
| Sessão no web (`getSession`, `pendingStep`)         | `apps/web/lib/session.ts`                                                                 |
| UI base (`Field`, `button`, `StageOptions`)         | `apps/web/components/crm-ui.tsx`                                                          |
| Tag colorida de cargo + `ROLE_LABEL`                | `apps/web/components/role-tag.tsx` (CSS `.role-*` em `globals.css`)                       |
| Tokens visuais, `.tier-*`, `.role-*`                | `apps/web/app/globals.css`                                                                |
| Lista de leads (inline, massa, filtros salvos)      | `components/leads-browser.tsx`, `lead-filters.tsx`                                        |
| Ficha do lead / venda                               | `components/lead-detail.tsx`, `sale-flow.tsx`, `finance-panel.tsx`                        |
| Pipeline / Hoje / Relatórios / Dashboard            | `components/pipeline.tsx`, `today.tsx`, `reports.tsx`, `dashboard-*.tsx`                  |
| Cards do dashboard reordenáveis (ordem / molas)     | `components/dashboard-board.tsx`, `lib/dashboard-layout.ts` / `lib/board-motion.ts`       |
| Ctrl+K / avisos / textos de atividade               | `components/shell/command-palette.tsx`, `components/inbox.tsx`, `lib/activity-text.ts`    |
| Spec do produto / deploy                            | `docs/spec.md`, `docs/deploy.md` (Oracle) / `docs/deploy-cubeship.md` (VPS com Cubeship); planos em `docs/superpowers/plans/`                     |

Next 16 tem APIs novas/incompatíveis: em dúvida, ver `apps/web/node_modules/next/dist/docs/`.
Valor exportado de módulo `'use client'` não é legível num server component: constantes
compartilhadas ficam em arquivo sem `'use client'` (ex.: `lib/last-user.ts`, `role-tag.tsx`).

## Papéis e acesso

- Hierarquia: **DIRETOR** (label "Diretoria") > **HEAD** > SDR / CLOSER. `LEADER_ROLES` =
  DIRETOR+HEAD; use `isLeader(role)`, nunca `role === 'HEAD'`.
- Só a Diretoria dá/tira cargo de liderança e administra contas de Head/Diretoria
  (`guardLeadership` em `admin/users.ts`). Head gerencia SDR/closer.
- Na RLS, `app_role()` devolve `'HEAD'` para DIRETOR (migration 0021): políticas não mudam.
- HEAD/DIRETOR veem tudo; SDR vê os próprios leads; CLOSER vê leads com reunião não
  cancelada dele. Invisível e inexistente respondem **404** (nunca 403).
- Flags `canProspect`/`canClose` são dados; autorização nunca depende de nomes de pessoas.
- Login por **usuário** (`/sign-in/username`, `[a-z0-9_.]{3,30}`, minúsculo); login por
  e-mail e `/is-username-available` desligados. Senha mínima 3 (provisório, decisão do usuário em
  29/10/2026: no dev todas as senhas são `123`; as regras voltam no fim).
- **Pedido de acesso** (decisão do usuário em 29/10/2026): `/login/solicitar` grava em
  `access_requests` (fora de `user`: pendente não loga). Head/Diretoria aprovam em Admin escolhendo o
  cargo (`guardLeadership`); recusar apaga; expira em 7 dias; 3 pedidos/hora por IP; a resposta não
  revela se o usuário existe. "Esqueci minha senha" orienta a pedir redefinição à liderança.
- MFA (TOTP) **opcional** para todos (decisão do usuário em 28/10/2026): cada um ativa ou
  desativa em `/conta/mfa` (link "Autenticador" na sidebar e em Mais); quem ativou confirma
  o login com o código, que é enviado sozinho ao completar 6 dígitos (`lib/otp-input.ts`).
  Primeiro acesso só obriga trocar a senha.
- Último usuário do aparelho: cookie `npac_last_user` com `Path=/login` (nunca localStorage).
- Ordem dos cards do dashboard: cookie por pessoa `npac_dash_<hash do id>` com `Path=/dashboard`,
  só IDs de cards; o servidor lê e já renderiza na ordem (sem tabela de preferências).

## Segurança e privacidade (não negociável)

- Runtime usa `npac_app` (sem BYPASSRLS). Owner só para migrations/seed/fixtures.
- Toda consulta de domínio dentro de `withUser(db, u.id, tx => …)`: a autorização de
  linha é RLS no SQL, nunca filtro em JS. `SELECT … FOR UPDATE` também passa pela RLS.
- Admin de usuários não tem RLS (Better Auth lê `user`): guarda = `admin:manage` + auditoria.
  Mas leads continuam com RLS: ler/alterar leads no admin também via `withUser`.
- Contato/termo de busca/conteúdo pessoal nunca em URL, logs, analytics ou localStorage
  (há e2e que barra `@` e dígitos longos no localStorage). Buscas/relatórios por POST.
- Telefone: E.164 BR, AES-256-GCM + blind index HMAC. Renda só em faixas ≥ R$ 5 mil.
- Timeline append-only: tipo, IDs e nomes de campos, **nunca valores**. Auditoria sem e-mail.
- Respostas da API têm `Cache-Control: no-store`. SSE só manda `{ type }`, sem PII.
- Chat: DM privada por RLS mesmo para liderança; mensagens append-only.
- LGPD: eliminação só via `lgpd_anonymize_lead`; não crie outro caminho que apague fatos financeiros.
- CSV com contato só liderança, auditado, com neutralização de fórmulas.

## Regras de escrita e negócio

- PATCH exige `version` (otimista, 409 `VERSION_CONFLICT`). Campos permitidos explícitos.
- Duplicidade de contato: advisory locks em ordem determinística; resposta não revela dono.
- Mudança + `recordActivity` (timeline + audit) na **mesma transação**.
- Dinheiro em centavos inteiros (`@npac/shared/money`), nunca `parseFloat * 100`.
- Venda: uma ativa por lead; `requestKey` idempotente + hash do payload; entrada + parcelas
  = total, parcelas futuras; só liderança estorna; lead com venda ativa não é excluído.
- **Etapa VENDA acompanha a venda**: só entra por `POST /finance/deals` e só sai pelo
  estorno. PATCH recusa entrar (409 `SALE_REQUIRED`) e sair com venda ativa (409 `ACTIVE_SALE`).
  Selects usam `<StageOptions>` (Venda desabilitada); ação em massa não oferece Venda.
- Resultado de reunião só depois do horário marcado (400 "A reunião ainda não aconteceu").
- Desativar usuário derruba sessões; leads dele passam por `POST /admin/users/:id/transfer-leads`.
- Fuso de negócio `America/Sao_Paulo`; `datetime-local` = Brasília (`brasiliaInput`).
  Intervalos [início, fim). Em `sql` cru, datas como ISO string.
- Métricas em SQL com CTEs que não multiplicam linhas; vendas contam por `deals`, não por etapa.
- Paginação no servidor; CSV recusa > 10 mil linhas.
- Erros da API em português (`BadRequestException('…')`): o `clientApi` mostra a mensagem;
  mensagens padrão do Nest viram texto genérico. Escreva mensagens pensando no usuário final.

## Banco e migrations

- Nova migration: `pnpm --filter @npac/db generate` (ou SQL manual) → `00NN_nome.sql` +
  snapshot + `_journal.json`. **Nunca reescreva migration aplicada**; crie sucessora.
- RLS, grants, triggers e funções SECURITY DEFINER são SQL manual: revise-os além do schema.
- Valor novo de enum não pode ser usado na mesma transação da migration (compare como texto).
- Aplicar no dev: `pnpm --filter @npac/db build && pnpm --filter @npac/db migrate`.
- psql no dev: `docker exec npac-corporation-postgres-1 psql -U npac_owner -d npac`.
- Apagar lead/usuário à mão: lembrar das FKs (`chat_reads`, `chat_*`, `payments`, `deals`,
  `lead_notes`, `lead_tasks`, `notifications`, `lead_timeline`, `meetings`, `lgpd_requests`).

## Comandos

```sh
docker compose up -d                      # Postgres local
pnpm dev                                  # api :4000 + web :3000 (turbo)
pnpm lint && pnpm typecheck               # rápido, rode antes de commitar
pnpm --filter @npac/api test              # vitest e2e da API (~1 min, banco npac_test*)
pnpm --filter @npac/db test               # RLS/migrations/seed
pnpm --filter @npac/shared test
pnpm --filter @npac/api exec vitest run test/leads.e2e.test.ts -t "nome"   # focado
pnpm --filter @npac/web e2e               # Playwright (~1–2 min)
pnpm --filter @npac/web e2e e2e/admin.spec.ts                            # um arquivo
pnpm exec prettier --write <arquivos>     # formatar só o que mudou
```

- **Dev sobe pelo painel do app**: `preview_start` com `npac-dev` (`.claude/launch.json`), nunca
  `pnpm dev` em segundo plano (os dois disputam a porta 3000). e2e e dev também disputam portas
  e `.next`: antes do e2e, `preview_stop` e mate 3000/4000; depois, `rm -rf apps/web/.next` e
  `preview_start` de novo. e2e usa API 4100/web 3100 e banco `npac_e2e`; se outro projeto
  ocupar a 3100, rode com `E2E_WEB_PORT=3200`.
- Testes só recriam bancos `npac_test*`/`npac_e2e*`. Não aponte teste para outro banco.
- API e e2e compartilham estado de usuários: teste que mexe em MFA/senha/papel restaura no fim.
- `truncate leads` em teste precisa incluir as tabelas com FK (lista acima).
- e2e loga com `email.split('@')[0]` como usuário. Seeds: ana/ronaldo (HEAD), ale/murilo/igor
  (SDR), sonia (CLOSER), todos `@npac.com.br`.
- Playwright: use `filter({ visible: true })`/`exact: true` contra colisões (layout mobile
  oculto duplica controles); nada de `networkidle` (SSE é permanente).
- Orçamento de JS de `/leads` < 150 KB gzip (há teste). ~129 KB são React/Next; o código
  nosso é ~19 KB. Evite libs pesadas no cliente; prefira server components.
- Screenshots dos e2e ficam em `apps/web/test-results/*.png`, úteis para conferir UI.

## Não commitar

`.env`, dumps, `test-results/`, logs, `node_modules`, `.claude/`. Commits terminam com a
linha `Co-Authored-By` indicada pelo ambiente.
