# Meu perfil (NPAC-53) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/conta/perfil` em que cada pessoa troca a própria foto, nome, e-mail (com código) e senha, e a foto
aparece em todo lugar que hoje mostra a inicial.

**Architecture:** Foto em `user_photos` (bytea, sem RLS, como `user`), versão em `user.image`, servida por
`GET /api/users/:id/photo?v=` com cache longo. Perfil, foto e e-mail em um módulo Nest novo `api/conta/*`
(`@AllRoles()`), auditado sem dado pessoal. O web lê `photo` de `/api/me` (a própria) e um mapa
`GET /api/team/photos` (as dos outros), sem mexer nos serviços de leads, finance e today (sessão de vendas).

**Tech Stack:** NestJS + Fastify (`@fastify/multipart`), Drizzle + Postgres 16, Better Auth 1.7.14, Next 16, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-meu-perfil-design.md` (aprovada em 18/11, "1A, 2A, 3A").
Protótipo: https://claude.ai/artifact/NP1nmGBCzto7wdRf1xuwKm

Status por tarefa: ⏳ pendente · 🔄 em andamento · ✅ feita.

| Tarefa | Status |
|---|---|
| 1 Banco 0069 | ⏳ |
| 2 API foto | ⏳ |
| 3 API perfil e nome | ⏳ |
| 4 API e-mail com código | ⏳ |
| 5 Web: tela, nome, senha, menu | ⏳ |
| 6 Web: foto e recorte | ⏳ |
| 7 Web: e-mail | ⏳ |
| 8 Foto nas outras telas | ⏳ |
| 9 Capturas, suítes, CLAUDE.md, PR | ⏳ |

## Global Constraints

- Branch `feat/NPAC-53-meu-perfil` → PR para `release/v0.18`, título `feat(NPAC-53): …` em minúsculas, squash.
- Migration `0069_meu_perfil`: `idx` 69, `when` maior que 1795017220745.
- Não editar `apps/api/src/leads/*`, `apps/api/src/finance/*`, `apps/api/src/today/*` (sessão de vendas).
- `user` não tem RLS: guarda = sessão + a própria pessoa; auditoria sem nome, e-mail ou foto.
- Foto: só JPEG, PNG ou WebP pelos bytes (`farejar`/`semMetadados` de `api/mentoria/media-sniff.ts`); até 200 KB
  (`FOTO_MAX_BYTES = 200 * 1024`); o navegador gera 256 × 256, WebP 0,85 (JPEG 0,85 se o navegador não gerar WebP).
- Nome: `trim`, 2 a 80 caracteres.
- Código do e-mail: 6 dígitos, vale 10 min (`EMAIL_CODE_TTL_MS = 10 * 60_000`), 5 tentativas
  (`EMAIL_CODE_MAX_TRIES = 5`), 3 envios por hora por conta (`EMAIL_CODE_MAX_PER_HOUR = 3`).
- Sem `SMTP_HOST` (`mail.enabled === false`): o perfil mostra "Para trocar o e-mail, peça à liderança. Ela muda no
  Admin." e os POST de e-mail dão 404 (2A).
- Textos fixos (spec, tabela Estados): "Digite o seu nome." · "Não deu para abrir essa imagem. Use JPG, PNG ou WebP." ·
  "Não foi possível trocar a senha. Confira a senha atual." · "Esse e-mail já está em uso." · "Esse já é o seu e-mail." ·
  "Código errado. Confira e tente de novo." · "Esse código venceu. Peça outro." · aviso de sucesso só "Salvo" (`showToast()`).
- JS de `/leads` < 150 KB gzip: recorte e janelinha do e-mail por `next/dynamic`, só no perfil; `Avatar` sem `'use client'`.
- Foto aparece em (3A): rodapé da sidebar, cartão do Mais (CRM e Acompanhamento), topo do Acompanhamento no celular,
  Equipe, feed da equipe, bolinha do closer no Hoje, Chat (lista e mensagens dos outros), Admin (linha do usuário),
  responsável em Mentorados e na Fila.

## Review Focus

- Foto grande do celular (5–12 MB, HEIC renomeado): o navegador reduz antes; HEIC que o navegador não abre mostra o erro
  da imagem, sem enviar nada. → teste e2e com arquivo de texto renomeado `.jpg` (Tarefa 6).
- Duas abas trocando o e-mail: o código novo apaga o anterior; confirmar o antigo dá "venceu". → teste da API (Tarefa 4).
- E-mail com maiúsculas e espaços ("  Ana@X.com ") conta como o mesmo endereço para "em uso" e "já é o seu". → teste (Tarefa 4).
- Conta desativada com foto: a foto continua servida para quem está logado (histórico do Chat), e some com o usuário
  apagado (cascade). → teste da API (Tarefa 2).
- Cabeçalho `Cache-Control` da foto não pode virar `no-store` pelo gancho global, e as outras rotas seguem `no-store`. →
  teste da API (Tarefa 2).

---

### Task 1: Banco — tabela `user_photos` (migration 0069)

**Files:**
- Create: `packages/db/drizzle/0069_meu_perfil.sql`, snapshot `packages/db/drizzle/meta/0069_snapshot.json`
- Modify: `packages/db/drizzle/meta/_journal.json`, `packages/db/src/schema/auth.ts` (tabela `userPhotos`)
- Test: `packages/db/test/meu-perfil.test.ts`

**Interfaces:**
- Produces: `userPhotos` = `user_photos(user_id text PK → user.id on delete cascade, bytes bytea not null,
  mime text not null check in ('image/jpeg','image/png','image/webp'), size int not null check (size between 1 and 204800),
  updated_at timestamptz not null default now())`; grants `select, insert, update, delete` a `npac_app`; sem RLS.
  `user.image` guarda a versão (texto curto) ou `null`.

- [ ] Teste `user_photos`: `npac_app` insere, lê, atualiza e apaga; `mime = 'image/svg+xml'` falha no CHECK;
  `size = 204801` falha; apagar o usuário apaga a foto.
- [ ] Rodar `pnpm --filter @npac/db test -- meu-perfil` → FAIL (tabela não existe).
- [ ] Migration SQL manual + schema Drizzle (`bytea` como `customType`, igual a `schema/forms.ts`) + journal e snapshot.
- [ ] `pnpm --filter @npac/db build && pnpm --filter @npac/db test` → PASS (incluindo "idx e `when` crescem juntos").
- [ ] Commit `feat(NPAC-53): tabela das fotos do perfil`.

### Task 2: API — foto do perfil

**Files:**
- Create: `apps/api/src/conta/conta.module.ts`, `apps/api/src/conta/foto.controller.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/app.setup.ts` (gancho `onSend`)
- Test: `apps/api/test/meu-perfil-foto.e2e.test.ts`

**Interfaces:**
- Consumes: `userPhotos` (Task 1), `farejar`, `semMetadados` (`api/mentoria/media-sniff.ts`), `AuditService.record`.
- Produces:
  - `PUT /api/me/photo` (multipart, 1 arquivo) → `200 { photo: string }` (URL `/api/users/<id>/photo?v=<versão>`).
  - `DELETE /api/me/photo` → `204`.
  - `GET /api/users/:id/photo` → bytes com `Content-Type` do farejo, `X-Content-Type-Options: nosniff`,
    `Content-Disposition: inline`, `Cache-Control: private, max-age=31536000, immutable`; sem foto → 404.
  - `GET /api/team/photos` → `{ photos: Record<string, string> }` (id → URL com versão), só quem tem foto.
  - `photoUrl(id: string, version: string | null): string | null` em `apps/api/src/conta/photo-url.ts`.
  - Auditoria `user.photo_set` / `user.photo_removed` (`entityType: 'user'`, `entityId: id`, `data: { mime, size }` só no set).

- [ ] Testes: PNG válido → 200 e `GET` devolve os mesmos bytes sem metadados; SVG e texto → 400 "Não deu para abrir essa
  imagem. Use JPG, PNG ou WebP."; 200 KB + 1 → 413; sem sessão → 401; `GET` de quem não tem foto → 404; cabeçalho de cache da
  foto = `private, max-age=31536000, immutable` e `GET /api/me` segue `no-store`; versão muda a cada envio; `DELETE` → foto 404
  e `user.image` nulo; foto de conta desativada ainda é servida; Acompanhamento (`carla`) consegue enviar e ler (`@AllRoles`);
  `GET /api/team/photos` só lista quem tem foto; auditoria registrada sem e-mail ou nome.
- [ ] Rodar o arquivo → FAIL.
- [ ] Implementar: o gancho global só põe `no-store` quando a rota não definiu `Cache-Control`; versão =
  `Date.now().toString(36)`; upsert por `user_id`; tudo em uma transação com a auditoria.
- [ ] Rodar o arquivo → PASS.
- [ ] Commit `feat(NPAC-53): api da foto do perfil`.

### Task 3: API — perfil e nome

**Files:**
- Create: `apps/api/src/conta/perfil.controller.ts`
- Modify: `apps/api/src/me/me.controller.ts`, `apps/api/src/auth/current-user.decorator.ts`,
  `apps/api/src/auth/session.guard.ts`, `apps/api/src/auth/auth.ts` (`disabledPaths`), `apps/api/src/admin/users.ts`,
  `packages/shared/src/schemas/account.ts` (`profileNameSchema`), `packages/shared/src/dto.ts` (`ProfileDTO`)
- Test: `apps/api/test/meu-perfil.e2e.test.ts`

**Interfaces:**
- Produces:
  - `SessionUser` ganha `image: string | null`, `email: string`, `username: string`.
  - `GET /api/me` ganha `photo: string | null`.
  - `GET /api/me/profile` → `ProfileDTO = { name: string; username: string; email: string; photo: string | null; mailEnabled: boolean }`.
  - `PATCH /api/me/profile { name }` → `ProfileDTO`; inválido → 400 "Digite o seu nome."; auditoria `user.name_changed`
    (sem `data`).
  - `GET /admin/users` ganha `photo: string | null` por usuário.
  - `/update-user` e `/change-email` do Better Auth em `disabledPaths`.

- [ ] Testes: `GET /me/profile` devolve usuário, e-mail e `mailEnabled` (true com `MemoryMailSender.enabled`, false sem);
  `PATCH` com "  Ana Souza  " grava "Ana Souza" e `/api/me` já devolve o nome novo; "" e " a " → 400 com o texto; 81
  caracteres → 400; `POST /api/auth/update-user` → 404; `/api/me` traz `photo`; `/admin/users` traz `photo`.
- [ ] Rodar → FAIL. Implementar. Rodar → PASS.
- [ ] Commit `feat(NPAC-53): perfil com troca de nome`.

### Task 4: API — e-mail com código

**Files:**
- Create: `apps/api/src/conta/email-change.ts` (regras + SQL), `apps/api/src/conta/email.controller.ts`
- Modify: `apps/api/src/mail/templates.ts` (`emailCodeMessage`, `emailChangedNotice`)
- Test: `apps/api/test/meu-perfil-email.e2e.test.ts`

**Interfaces:**
- Consumes: `MAIL_SENDER`, `normalizeEmail` (`sh/normalize.ts`), tabela `verification`.
- Produces:
  - `POST /api/me/email/code { email }` → 204 (código em `verification`, `identifier = 'npac-email:' + userId`, `value` =
    JSON `{ h: sha256(userId + ':' + código), e: email normalizado, n: tentativas }`, `expiresAt` +10 min; cada envio grava
    `npac-email-sent:<userId>` com validade de 1 h para o limite). Em uso → 409 "Esse e-mail já está em uso."; igual ao atual
    → 400 "Esse já é o seu e-mail."; 4º envio na hora → 429 "Muitos pedidos. Tente de novo mais tarde."; envio desligado → 404.
  - `POST /api/me/email/confirm { code }` → `200 { email }`; errado → 400 "Código errado. Confira e tente de novo."; vencido,
    5º erro ou sem código → 400 "Esse código venceu. Peça outro."; sucesso troca `user.email`, `email_verified = true`, apaga as
    linhas, avisa o endereço antigo e audita `user.email_changed`.
  - Pedido novo apaga o código anterior; tudo sob `pg_advisory_xact_lock(hashtext('npac-email:' || userId))`.
  - Textos dos e-mails (primeiro nome só): assunto "Seu código para trocar o e-mail", corpo com o código e "Vale por 10
    minutos."; aviso "O e-mail da sua conta foi trocado" com "Não foi você? Fale com a liderança.", sem o endereço novo.

- [ ] Testes: fluxo completo (código lido do `MemoryMailSender`) troca o e-mail e o antigo recebe o aviso; "  Ana@NPAC.com.br "
  = o atual → 400; e-mail de outro usuário em maiúsculas → 409, nada enviado; código errado → 400 errado, 5 erros → depois
  "venceu" mesmo com o código certo; código vencido (`expires_at` no passado) → "venceu"; segundo pedido invalida o primeiro;
  4º pedido na hora → 429; `mail.enabled = false` → 404; auditoria sem e-mail (`data` sem `@`).
- [ ] Rodar → FAIL. Implementar. Rodar → PASS.
- [ ] Commit `feat(NPAC-53): troca de e-mail com codigo`.

### Task 5: Web — tela Meu perfil, nome, senha e menu

**Files:**
- Create: `apps/web/app/(app)/conta/perfil/page.tsx`, `apps/web/components/conta/perfil.tsx` (cliente: nome e senha),
  `apps/web/components/avatar.tsx` (servidor: `Avatar`), `apps/web/lib/photo.ts` (`photoSrc`)
- Modify: `apps/web/app/(app)/layout.tsx` (rodapé: bloco inteiro é link para `/conta/perfil`, "Meu perfil" no lugar de
  "Trocar senha"), `apps/web/components/shell/conta-card.tsx` ("Meu perfil" + foto/nome clicáveis),
  `apps/web/components/shell/nav-menu.tsx` (Ctrl+K "Meu perfil"), `apps/web/app/(conta)/conta/senha/page.tsx` (sem troca
  obrigatória → `redirect('/conta/perfil')`), `apps/web/components/conta/change-password-form.tsx` (só primeiro acesso),
  `apps/web/lib/session.ts` (`Me.photo`), `e2e/login.spec.ts`, `e2e/sair.spec.ts`
- Test: `apps/web/e2e/meu-perfil.spec.ts`

**Interfaces:**
- Produces: `Avatar({ name, photo, size, className })` (foto ou inicial; `photo` = URL ou `null`; `alt=""`, decorativo),
  `photoSrc(url: string | null)`; página com seções Foto e nome, E-mail, Senha (recolhida, `aria-expanded`), Este aparelho;
  celular do cargo Acompanhamento com `<AbasMobile />` e "‹ Mais" para `/acompanhamento/mais` (CRM: `/mais`).

- [ ] e2e: rodapé da sidebar mostra "Meu perfil" e não "Trocar senha"; clicar no nome abre `/conta/perfil`; trocar o nome e
  sair do campo mostra "Salvo" e a sidebar mostra o nome novo depois de recarregar; nome vazio mostra "Digite o seu nome." e
  não salva; "Trocar senha" abre os 3 campos, senha atual errada mostra o erro, a certa troca e mostra "Salvo"; `/conta/senha`
  sem troca obrigatória vai para `/conta/perfil`; Mais (celular) tem "Meu perfil"; restaura nome e senha no fim.
- [ ] Rodar `pnpm --filter @npac/web e2e e2e/meu-perfil.spec.ts` → FAIL. Implementar. → PASS. Ajustar `login.spec` e `sair.spec`.
- [ ] Commit `feat(NPAC-53): tela meu perfil com nome e senha`.

### Task 6: Web — foto e recorte

**Files:**
- Create: `apps/web/components/conta/foto-recorte.tsx` (cliente, `next/dynamic`), `apps/web/lib/crop.ts`
  (`cropToBlob(img: HTMLImageElement, view: { x: number; y: number; scale: number }, box: number): Promise<Blob>`)
- Modify: `apps/web/components/conta/perfil.tsx`
- Test: `apps/web/e2e/meu-perfil.spec.ts`

**Interfaces:** janelinha `<dialog class="dlg">` "Ajustar foto": arrastar, setas movem 8 px, − / + e a barra dão zoom de 1×
a 4×, prévia 56/36/24, "Cancelar" e "Salvar foto"; `PUT /api/me/photo`; sem foto o botão é "Adicionar foto" e "Remover" some.

- [ ] e2e: enviar `e2e/fixtures/foto.png` → janelinha → "Salvar foto" → "Salvo" e a sidebar mostra `<img>` com `?v=`;
  arquivo de texto renomeado `.jpg` → "Não deu para abrir essa imagem. Use JPG, PNG ou WebP."; "Remover" volta à inicial e
  o botão vira "Adicionar foto"; setas do teclado mudam a posição (o PNG gerado difere).
- [ ] FAIL → implementar → PASS. Conferir `e2e` do limite de 150 KB de `/leads`.
- [ ] Commit `feat(NPAC-53): foto do perfil com recorte em circulo`.

### Task 7: Web — e-mail com código

**Files:**
- Create: `apps/web/components/conta/email-troca.tsx` (cliente, `next/dynamic`)
- Modify: `apps/web/components/conta/perfil.tsx`
- Test: `apps/web/e2e/meu-perfil-email.spec.ts`

**Interfaces:** passo 1 "Trocar e-mail" (linha "Hoje: …", campo "Novo e-mail", "Enviar código"); passo 2 "Confirme o novo
e-mail" com 6 caixas (`lib/otp-input.ts`), confirma sozinho no 6º número, "Reenviar" depois de 60 s, "Usar outro endereço";
sucesso fecha, "Salvo" e a linha mostra o endereço novo; `mailEnabled === false` → aviso da liderança, sem botão.

- [ ] e2e (caixa falsa do `playwright.config.ts`): fluxo completo troca o e-mail; código errado mostra o texto; e-mail de outro
  usuário mostra "Esse e-mail já está em uso."; restaura o e-mail no fim.
- [ ] FAIL → implementar → PASS.
- [ ] Commit `feat(NPAC-53): troca de e-mail com codigo no perfil`.

### Task 8: Foto nas outras telas

**Files:**
- Create: `apps/web/lib/team-photos.ts` (`getTeamPhotos(): Promise<Record<string, string>>`, `cache()` do React)
- Modify: `app/(app)/(comercial)/equipe/page.tsx`, `components/dashboard-team.tsx` (`TeamFeed` + `photos`),
  `components/reports.tsx` (repassa `photos`), páginas do Dashboard/Relatórios, `components/today.tsx` (bolinha do closer +
  `photos`; "Sua reunião" com foto = anel dourado de 2 px), `app/(app)/(comercial)/hoje/page.tsx`, `components/chat.tsx` +
  página, `components/admin.tsx`, `app/(app)/mais/page.tsx`, `app/(app)/acompanhamento/mais/page.tsx`,
  `app/(app)/acompanhamento/layout.tsx` + `components/acompanhamento/barra-modulo.tsx`,
  `components/acompanhamento/mentorados-lista.tsx`, `components/acompanhamento/fila.tsx` (+ páginas)
- Test: `apps/web/e2e/meu-perfil-fotos.spec.ts`

- [ ] e2e: depois que `igor` envia foto, ela aparece (`img[src*="/api/users/<id>/photo"]`) na Equipe, no Chat, no Admin
  (logado como `diretor`) e no feed da equipe; sem foto, a inicial continua.
- [ ] FAIL → implementar → PASS.
- [ ] Commit `feat(NPAC-53): foto da equipe em todas as telas`.

### Task 9: Capturas, suítes, CLAUDE.md e PR

- [ ] Capturas 375/768/1024/1440 de Meu perfil (claro e escuro) e de cada tela da Tarefa 8, por
  `CAPTURAS=<pasta> pnpm --filter @npac/web e2e e2e/capturas-perfil.spec.ts`; comparar com o protótipo e corrigir diferenças.
- [ ] `pnpm lint && pnpm typecheck`; `pnpm --filter @npac/api test`; `pnpm --filter @npac/db test`;
  `pnpm --filter @npac/shared test`; `pnpm --filter @npac/web e2e` → tudo verde.
- [ ] `CLAUDE.md`: mapa (`api/conta/*`, `components/conta/*`, `Avatar`), regras da foto, do código e da 0069; tirar "Trocar
  senha" do cartão do Mais.
- [ ] Push, PR para `release/v0.18`, linha 3 do Status em `docs/plans/pedidos-18-11.md`; CI inteiro verde; capturas ao Gabriel;
  squash só com o ok dele.
