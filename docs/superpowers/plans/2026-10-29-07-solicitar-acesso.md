# Solicitar acesso (cadastro com aprovação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem não tem conta pede acesso pela tela de login; a liderança aprova escolhendo o cargo, e só então a pessoa entra com a senha que ela mesma escolheu.

**Architecture:** O pedido fica numa tabela própria (`access_requests`), fora de `user`: conta pendente
não existe para o Better Auth, então não há como logar nem ver dados antes da aprovação. O
endpoint público é um plugin do Better Auth (`POST /api/auth/request-access`) para herdar o rate
limit em banco que o login já usa. Aprovar = criar `user` + `account` (com o hash guardado no
pedido) e apagar o pedido, na mesma transação, com a mesma regra de cargo do admin
(`guardLeadership`).

**Tech Stack:** NestJS + Better Auth (plugin com `createAuthEndpoint`), Drizzle/Postgres, argon2,
Next 16 (server components + um form client), Vitest e2e da API, Playwright.

**Spec:** decisão do usuário em 29/10/2026 nesta conversa: "uma conta diretor (com a senha correta)
que aprova a criação de contas — barato e dá liberdade pra eles testarem". Detalhes acordados:
pendente não entra nem vê nada; quem aprova escolhe o cargo; pedidos expiram; endpoint público
com limite e sem revelar quem tem conta.

## Global Constraints

- Login continua por usuário `[a-z0-9_.]{3,30}`, minúsculo. Senha mínima 3 (provisório, igual ao `auth.ts`).
- Aprovação: permissão `admin:manage` (Head e Diretoria). SDR/Closer: Head ou Diretoria aprovam; Head/Diretoria como cargo: só a Diretoria (`guardLeadership`, mensagens existentes).
- Pedido expira em **7 dias**: some da lista e é apagado.
- Rate limit do pedido: **3 por hora por IP** (`customRules` do Better Auth).
- A resposta do pedido é sempre a mesma (`{ ok: true }`, 200), com usuário livre, ocupado ou já pendente: não revela quem tem conta (mesma razão de `/is-username-available` estar desligado).
- Auditoria sem e-mail nem nome: `entityType: 'access_request'`, só id e campos. Nada de dado do pedido em logs ou URL.
- Erros da API em português, pensados para o usuário final.
- Recusar apaga o pedido (sem guardar dado pessoal de quem não entrou).
- Conta aprovada nasce com `mustChangePassword: false` (a senha já é da pessoa) e `active: true`.

## Review Focus

- Usuário já existente em `user`: o pedido responde 200 e não grava nada (teste na Task 2).
- Mesmo usuário pedido duas vezes: o segundo responde 200 e o primeiro fica (teste na Task 2).
- E-mail já usado por outra conta: aprovar devolve 409 "E-mail ou usuário já cadastrado" e o pedido fica para ser recusado (teste na Task 3).
- Head tentando aprovar como HEAD/DIRETOR: 403 com a mensagem do `guardLeadership`, e o pedido continua (teste na Task 3).
- Pedido com mais de 7 dias: não aparece na lista e não pode ser aprovado (404) (teste na Task 3).

---

### Task 1: Tabela `access_requests`

**Files:**
- Create: `packages/db/src/schema/access-requests.ts`
- Modify: `packages/db/src/schema/index.ts` (export)
- Create: `packages/db/drizzle/0023_access_requests.sql` + snapshot + `_journal.json` (via `pnpm --filter @npac/db generate`, depois acrescentar grants à mão)
- Test: `packages/db/test/access-requests.test.ts`

**Interfaces:**
- Produces: `accessRequests` (Drizzle) com colunas `id uuid pk default gen_random_uuid()`, `name text not null`, `username text not null unique`, `email text not null`, `passwordHash text not null` (`password_hash`), `createdAt timestamptz not null default now()`.

- [ ] **Step 1: Teste que falha** — como `npac_app`: `insert` e `select` e `delete` em `access_requests` funcionam; `update` é negado (`permission denied`); dois inserts com o mesmo `username` → erro `23505`.
- [ ] **Step 2:** `pnpm --filter @npac/db test -- access-requests` → FAIL (tabela não existe).
- [ ] **Step 3:** schema + migration. Sem RLS (como `user`: só a API lê, guardada por `admin:manage`). SQL manual ao fim da migration: `GRANT SELECT, INSERT, DELETE ON access_requests TO npac_app;`
- [ ] **Step 4:** `pnpm --filter @npac/db build && pnpm --filter @npac/db migrate && pnpm --filter @npac/db test` → PASS.
- [ ] **Step 5:** commit `feat(db): access_requests table for sign-up requests`.

### Task 2: Endpoint público `POST /api/auth/request-access`

**Files:**
- Create: `apps/api/src/auth/request-access.ts` (plugin Better Auth)
- Modify: `apps/api/src/auth/auth.ts` (registrar o plugin e a regra de rate limit)
- Test: `apps/api/test/access-requests.e2e.test.ts`

**Interfaces:**
- Consumes: `accessRequests` (Task 1).
- Produces: `requestAccessPlugin(db: Db, audit: AuditService): BetterAuthPlugin` com endpoint `/request-access` (POST, sem sessão). Corpo validado por Zod `.strict()`: `name` (trim, 1–120), `username` (mesmo schema de `invite` em `admin/users.ts` — extrair para `packages/shared` como `usernameSchema` e usar nos dois), `email` (`z.email()`, trim, minúsculo, ≤200), `password` (string, 3–128). Resposta `{ ok: true }`.
- Constante exportada `ACCESS_REQUEST_TTL_DAYS = 7` em `request-access.ts`.

- [ ] **Step 1: Testes que falham** em `access-requests.e2e.test.ts` (`describe('pedido de acesso')`):
  - `cria pedido pendente que não consegue logar`: POST com `{ name: 'Nova Pessoa', username: 'nova.pessoa', email: 'nova@novo.test', password: '123' }` → 200 `{ ok: true }`; linha em `access_requests` com `password_hash` ≠ `'123'`; `h.signIn` com `nova.pessoa`/`123` falha (401).
  - `usuário existente responde igual e não grava`: POST com `username: 'ale'` → 200 `{ ok: true }`; `access_requests` vazio.
  - `pedido repetido mantém o primeiro`: dois POST com `nova.pessoa` (nomes diferentes) → os dois 200; uma linha, com o primeiro nome.
  - `valida campos`: `username: 'Com Espaço'` → 400; campo extra → 400.
  - `limita a 3 por hora por IP`: 4º POST → 429.
  - `audita sem dados pessoais`: `audit_log` tem `action = 'access_request.create'`, `entity_type = 'access_request'`, e o `data` não contém o e-mail nem o nome.
  - `beforeEach`: `truncate access_requests` + `resetAuthState()`; `afterAll` limpa `%@novo.test`.
- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/access-requests.e2e.test.ts` → FAIL (404).
- [ ] **Step 3:** plugin com `createAuthEndpoint` (`better-auth/api`). Fluxo: apagar pedidos com mais de `ACCESS_REQUEST_TTL_DAYS`; se `username` existe em `user`, responder `{ ok: true }` sem gravar; senão `hash(password)` (argon2) e `insert … on conflict (username) do nothing`; auditar só quando gravou. Em `auth.ts`: plugin depois de `username(...)`; `customRules['/request-access'] = { window: 3600, max: 3 }`.
- [ ] **Step 4:** teste focado → PASS; `pnpm --filter @npac/api test` → PASS.
- [ ] **Step 5:** commit `feat(api): public access request endpoint with rate limit`.

### Task 3: Aprovar e recusar no admin

**Files:**
- Create: `apps/api/src/admin/access-requests.ts` (service + controller, mesmo estilo de `admin/users.ts`)
- Modify: `apps/api/src/admin/users.ts` (exportar `guardLeadership` como função reutilizável ou tornar o método público), módulo do admin (registrar controller)
- Test: `apps/api/test/access-requests.e2e.test.ts` (novo `describe('aprovação')`)

**Interfaces:**
- Consumes: `accessRequests`, `ACCESS_REQUEST_TTL_DAYS`.
- Produces (todas com `@Can('admin:manage')`):
  - `GET /api/admin/access-requests` → `{ id, name, username, email, createdAt }[]` (só não expirados, mais antigos primeiro).
  - `POST /api/admin/access-requests/:id/approve` corpo `{ role: Role, canProspect: boolean, canClose: boolean }` (strict) → `{ id: string }` (id do novo usuário).
  - `DELETE /api/admin/access-requests/:id` → 204.

- [ ] **Step 1: Testes que falham** (pedido criado pelo endpoint da Task 2 em cada teste):
  - `SDR não vê nem aprova pedidos`: GET com sessão do ale → 403.
  - `liderança aprova como SDR e a pessoa entra com a própria senha`: ronaldo (HEAD) aprova `{ role: 'SDR', canProspect: true, canClose: false }` → 200; `h.signIn('nova.pessoa', '123')` funciona; `/api/me` → `role: 'SDR'`, sem exigir troca de senha; pedido sumiu.
  - `Head não aprova cargo de liderança`: ronaldo aprova `role: 'HEAD'` → 403 "Só a Diretoria pode dar cargo de Head ou Diretoria"; pedido continua.
  - `Diretoria aprova como Head`: ana com `role = 'DIRETOR'` (como em `admin.e2e.test.ts`) → 200.
  - `e-mail já usado`: pedido com `email: 'ale@npac.com.br'` → aprovar 409 "E-mail ou usuário já cadastrado"; pedido continua.
  - `recusar apaga`: DELETE → 204; GET não lista; aprovar depois → 404.
  - `expirado some`: `update access_requests set created_at = now() - interval '8 days'` → GET vazio; aprovar → 404.
  - `auditoria`: `admin.access_request.approve` com `data.fields = ['role','canProspect','canClose']`; `admin.access_request.reject`; nenhum com e-mail.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** service. `approve`: `guardLeadership(actor, null, role)`; transação: `select … for update` do pedido não expirado (404 se não houver), insert em `user` (`displayUsername: username`, `mustChangePassword: false`) e `account` (`providerId: 'credential'`, `password: passwordHash`) como em `invite`, `delete` do pedido; `23505` → mesmo `ConflictException` de `invite`.
- [ ] **Step 4:** teste focado → PASS; suíte da API → PASS.
- [ ] **Step 5:** commit `feat(api): leaders approve or reject access requests`.

### Task 4: Tela "Solicitar acesso"

**Files:**
- Create: `apps/web/app/(auth)/login/solicitar/page.tsx` (mesmo fundo/cartão do login; redireciona para `/dashboard` se já logado)
- Create: `apps/web/components/login/request-access-form.tsx` (`'use client'`)
- Modify: `apps/web/components/login/login-form.tsx` (link "Solicitar acesso" abaixo da nota)
- Modify: `apps/web/app/(auth)/login/page.tsx` (extrair o fundo/cartão para `components/login/auth-shell.tsx` e usar nas duas páginas)
- Test: `apps/web/e2e/access-request.spec.ts`

**Interfaces:**
- Consumes: `POST /api/auth/request-access`.
- Produces: rota `/login/solicitar`.

- [ ] **Step 1: e2e que falha** `pede acesso, Diretoria aprova e a pessoa entra`:
  login → link "Solicitar acesso" → preenche Nome, Usuário, E-mail, Senha, Confirme a senha → botão "Pedir acesso" → vê "Pedido enviado. A liderança vai analisar e você entra com essa senha." → login como a pessoa falha com "Usuário ou senha inválidos". O teste termina aí; a aprovação pela tela entra na Task 5. Limpeza em `afterAll`: `access_requests` e `%@novo.test`.
- [ ] **Step 2:** `pnpm --filter @npac/web e2e e2e/access-request.spec.ts` → FAIL.
- [ ] **Step 3:** form com os mesmos estilos de `login-form.tsx` (`field`, `btn-dark`, labels). Valida no cliente: senhas iguais ("As senhas não conferem"), usuário no formato (mensagem do schema). Envia com `fetch('/api/auth/request-access', { method: 'POST', … })`; 429 → "Muitas tentativas. Tente de novo mais tarde."; outros erros → "Não foi possível enviar. Tente de novo.". Nada vai para URL nem localStorage.
- [ ] **Step 4:** e2e → PASS; `pnpm lint && pnpm typecheck`.
- [ ] **Step 5:** commit `feat(web): request access page`.

### Task 5: Pedidos no Admin + contador na sidebar

**Files:**
- Create: `apps/web/components/access-requests.tsx`
- Modify: `apps/web/app/(app)/admin/page.tsx` (busca `GET /admin/access-requests` e renderiza acima dos usuários)
- Modify: `apps/web/app/(app)/layout.tsx` + `components/shell/*` (contador no item Admin, só para liderança)
- Test: `apps/web/e2e/access-request.spec.ts` (completa o teste da Task 4)

**Interfaces:**
- Consumes: endpoints da Task 3; `ROLE_LABEL` de `components/role-tag.tsx`; `isLeader`.
- Produces: `<AccessRequests requests={…} actorRole={Role} />`.

- [ ] **Step 1: estender o e2e**: depois do login negado, entra a ana (Diretoria via `owner` no `beforeAll`, restaurada no `afterAll`) → item "Admin" mostra contador `1` → seção "Pedidos de acesso" lista "Nova Pessoa · nova.pessoa" → escolhe cargo "SDR" → "Aprovar" → linha some e o usuário aparece na lista de usuários → sai → a pessoa entra com a senha que escolheu e cai no `/dashboard`. Segundo teste: "Recusar" pede confirmação e a linha some.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** linha por pedido: nome, usuário, "há N dias", select de cargo (SDR/Closer; Head/Diretoria só se `actorRole === 'DIRETOR'`), `canProspect`/`canClose` derivados do cargo (SDR → prospecta; Closer → fecha; liderança → os dois), botões "Aprovar" e "Recusar" (confirmação), via `clientApi` + `router.refresh()`. Seção some quando não há pedidos. Contador: número de pedidos no item Admin (sidebar e "Mais"), buscado no layout só se `isLeader`.
- [ ] **Step 4:** e2e → PASS; `pnpm lint && pnpm typecheck`; orçamento de JS de `/leads` continua < 150 KB (`e2e/login.spec.ts`).
- [ ] **Step 5:** commit `feat(web): approve access requests from Admin`.

### Task 6: Fim da dica "a senha de todos é 123"

**Files:**
- Modify: `apps/web/components/login/login-form.tsx`, `apps/web/app/(auth)/login/page.tsx`, `apps/web/playwright.config.ts`, `apps/web/e2e/login.spec.ts`, `docs/deploy-cubeship.md`
- Modify: `CLAUDE.md` (seção Papéis e acesso: cadastro com aprovação; mapa: `admin/access-requests.ts`, `auth/request-access.ts`), `docs/spec.md`

Com cada pessoa escolhendo a senha e a Diretoria com senha própria, a dica deixa de ser verdade.

- [ ] **Step 1:** trocar o teste da dica por: `"Esqueci minha senha" orienta a pedir redefinição à liderança` (botão abre o texto "Peça para a liderança redefinir a sua senha em Admin.").
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** remover `testHint`/`LOGIN_TEST_HINT` (página, form, playwright, deploy doc); o botão mostra o texto novo sempre.
- [ ] **Step 4:** `pnpm --filter @npac/web e2e e2e/login.spec.ts e2e/access-request.spec.ts` → PASS; `pnpm lint && pnpm typecheck`.
- [ ] **Step 5:** commit `feat(web): forgot password points to leadership; drop the test password hint`.

### Fechamento

- [ ] Suítes: `pnpm --filter @npac/db test`, `pnpm --filter @npac/api test`, `pnpm --filter @npac/web e2e`.
- [ ] Conferir no `npac-dev`: pedir acesso, aprovar logado como Diretoria, entrar com a conta nova (captura).
