# NPAC-78: gravação da reunião pelo link do Drive — plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (nativo, nesta sessão). Steps com `- [ ]`.

**Goal:** colar o link do Google Drive da gravação na reunião do Acompanhamento e assistir ali mesmo.

**Architecture:** coluna cifrada `mentoria_reunioes.gravacao`, mais um campo no `PATCH mentoria/reunioes/:id`, e o card
"Gravação" com `<iframe>` de `drive.google.com/file/d/<id>/preview` (CSP `frame-src`). Função pura `idDoDrive` no shared,
usada pela validação (Zod) e pela tela.

**Tech Stack:** Drizzle + SQL manual, NestJS, Zod, Next 16, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-gravacao-reuniao-design.md`

**Status:** Task 1 ⏳ · Task 2 ⏳ · Task 3 ⏳ · Task 4 ⏳

## Global Constraints

- Mensagem de link inválido: "Cole o link da gravação no Google Drive".
- Dica: "Quem for assistir precisa ter acesso ao arquivo no Drive."
- Rótulos: card "Gravação", campo "Link da gravação (Google Drive)", link "Abrir no Drive", histórico "Gravação".
- Link nunca em log, CSV ou histórico (só o nome do campo).

## Review Focus

- Link com espaços, `?usp=sharing` ou `/view` no fim → aceito, mesmo id (teste em `idDoDrive`).
- Link de pasta (`/drive/folders/…`), `docs.google.com/document/…`, `http://`, `drive.google.com.evil.com` → 400 (teste).
- Apagar o campo (vazio) → `null`, card sem player (teste da API).
- Especialista que não conduz a reunião → 404 no PATCH (já coberto pela guarda; caso no teste).
- Anonimizar a inscrição → `gravacao` nula (teste da API).

---

### Task 1: regra pura e schema

**Files:** Modify `packages/shared/src/mentoria/reunioes.ts`, `packages/shared/src/schemas/mentoria.ts`,
`packages/shared/src/mentoria/dto.ts` (ReuniaoDTO ganha `gravacao: string | null`). Test
`packages/shared/test/mentoria-gravacao.test.ts`.

**Produces:** `idDoDrive(url: string): string | null`; `previewDoDrive(id: string): string`
(`https://drive.google.com/file/d/${id}/preview`); `AVISO_GRAVACAO`; `reuniaoPatchSchema.gravacao` (opcional, `null`
ou string ≤ 2000 com `idDoDrive` ≠ null).

- [ ] Teste (id de exemplo `1AbC_dEf-GhIjKlMnOp`): `…/file/d/<id>/view?usp=sharing` → id; `…/open?id=<id>` → id;
  espaços nas pontas aceitos; pasta, docs, `http://`, host `drive.google.com.evil.com`, id curto (< 10) → `null`.
  Schema: inválido falha com `AVISO_GRAVACAO`; `''` e `null` viram `null`.
- [ ] Rodar `pnpm --filter @npac/shared test` (falha), implementar (`new URL`, `protocol === 'https:'`, `hostname ===
  'drive.google.com'`, id `^[A-Za-z0-9_-]{10,}$`), rodar (passa), commit.

### Task 2: banco e API

**Files:** Create `packages/db/drizzle/0090_reuniao_gravacao.sql` (+ journal/snapshot), modify
`packages/db/src/schema/mentoria.ts`, `apps/api/src/mentoria/reunioes.service.ts`. Test
`apps/api/test/mentoria-v2-reunioes.e2e.test.ts`.

- [ ] Migration: `ALTER TABLE mentoria_reunioes ADD COLUMN gravacao text;` e `mentoria_anonimizar_inscricao` refeita
  igual à 0076 com `gravacao = NULL` no UPDATE de reuniões. `when` > 0089.
- [ ] Testes (RED): PATCH com link do Drive grava e `GET` devolve o mesmo link; inválido → 400 com a mensagem; `null`
  apaga; histórico tem `gravacao` em `campos` e não o link; Especialista sem a reunião → 404; anonimizar → `null`.
- [ ] Service: cifra com `aad('mentoria_reunioes', 'gravacao', id)` em `atualizar`, decifra em `abrir`. Rodar o teste
  focado (passa), commit.

### Task 3: tela

**Files:** Create `apps/web/components/acompanhamento/reuniao-gravacao.tsx`; modify `reuniao-registro.tsx` (card abaixo
de Registro, só `status === 'REALIZADA'`), `historico-lista.tsx` (rótulo "Gravação"), `apps/web/proxy.ts`
(`frame-src https://drive.google.com`), `acompanhamento/modulo.css` (player 16:9). Test
`apps/web/e2e/acompanhamento-v2-reunioes.spec.ts`.

- [ ] e2e (RED): reunião realizada → colar link → sai do campo → "Salvo" → `iframe[src*="/preview"]` visível e "Abrir no
  Drive"; link inválido mostra o aviso e não salva; reunião agendada não mostra o card.
- [ ] Componente com `CampoPr` (`inputMode="url"`, `conversao` que lança `AVISO_GRAVACAO`, `aoSalvar={atualizar}`);
  player `<iframe title="Gravação da reunião" allow="autoplay; fullscreen" allowFullScreen loading="lazy">`. Só leitura
  para quem não edita (sem campo, com player). Rodar e2e (passa), commit.

### Task 4: fechar

- [ ] `CLAUDE.md` (linha no Acompanhamento: reuniões), caixa `docs/pedidos/caixa.md` (NPAC-78).
- [ ] `pnpm lint && pnpm typecheck`, suítes shared/db, teste focado da API, e2e de reuniões; capturas 375/768/1024/1440.
- [ ] PR `feat(NPAC-78): gravacao da reuniao pelo link do drive` na release aberta; CI verde; ITODEV.
