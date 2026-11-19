# Plano: acesso por área (NPAC-54)

Spec: `docs/superpowers/specs/2026-11-19-acesso-por-area-design.md` (ler inteira antes de qualquer fase).
Release: a `release/vX.Y` aberta (em 19/11/2026, `release/v0.19`).

**Como executar:** uma sessão nova (Opus 5.5, esforço high) por fase, em ordem. Cada fase depende da
anterior já mesclada na release: **nunca duas fases ao mesmo tempo** (mexem nos mesmos arquivos e na
numeração das migrations). Cada fase é um PR `feat(NPAC-54): …` para a release, squash com o CI inteiro
verde. Ao fechar a fase, a sessão atualiza o status aqui e o `CLAUDE.md` no mesmo PR.

Legenda: ⏳ a fazer · 🔧 em andamento · ✅ feito · ❌ travado (dizer por quê na linha).

| Fase | O que entrega | Estimativa | Status |
|---|---|---|---|
| 1 | Banco: a tabela de membros vira a fonte do cargo, sem mudar nada na tela | 2–3 dias | 🔧 |
| 2 | Regra única de quem gerencia quem, na API e no banco | 2 dias | ⏳ |
| 3 | Telas: equipe por área (Admin do CRM e aba Perfis do módulo) | 2–3 dias | ⏳ |
| 4 | Pessoa em duas áreas | 2 dias | ⏳ |
| 5 | Limpeza da compatibilidade | 1 dia | ⏳ |

Estimativas são minhas (sem medição): 9–11 dias de sessão no total.

**Prod:** cada fase vai sozinha ao ITODEV pelo rc da release. Recomendação: levar a fase 1 a prod antes
das outras (não muda tela e tira o maior risco cedo). Prod sempre com o sim do Gabriel, depois do roteiro
completo no ITODEV (um login por cargo) e da contagem de contas por cargo antes e depois.

---

## Fase 1 — Banco: a tabela de membros vira a fonte

Branch `feat/NPAC-54-fase-1-membros`. Só `packages/db` (+ seed e testes). **Nenhuma mudança de
comportamento na API nem no web.** Spec: "Modelo" inteiro.

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 1.1 | Teste de equivalência **antes** de mexer (RED → base): grava, para cada conta do seed e uma desativada, o resultado de `app_role()`, `mentoria_perfil()`, `mentoria_admin()`, `mentoria_perfil_de()` com as funções de hoje | `db/test/areas-equivalencia.test.ts` existe e compara "versão de hoje" × "versão viva", no padrão de `fila-equivalencia.test.ts` | ⏳ |
| 1.2 | Migration: `area_membros`, `user.mestre`, CHECKs, RLS de leitura (formato "uma vez por consulta"), grants, carga inicial, invariantes (ao menos um vínculo; ao menos uma Diretoria ativa) | `pnpm --filter @npac/db migrate` aplica no dev; contagem de vínculos = contagem de contas por cargo; `migrations.test.ts` e `rls-por-consulta.test.ts` verdes | ⏳ |
| 1.3 | Funções trocam de fonte (tabela da spec) + funções novas `area_definir_membro`, `area_remover_membro`, `area_definir_mestre`, `area_gerencia`, ainda **com a regra de hoje** (Diretoria faz tudo; Admin do módulo troca perfil) | 1.1 verde; `rls.test.ts`, `mentoria-v2-*.test.ts`, `cargos.test.ts`, `access-requests.test.ts` verdes **sem edição das expectativas** | ⏳ |
| 1.4 | Compatibilidade: visão `mentoria_perfis`, `mentoria_definir_perfil` por cima da função nova, gatilho que traduz escrita direta em `user.role`, resumo `user.role` + caixas fixas; seed e testes que inseriam em `mentoria_perfis` passam à função | Teste novo: `update "user" set role=…`, `mentoria_definir_perfil(…)` e `select … from mentoria_perfis` funcionam; `seed.test.ts` e `seed-mentoria.test.ts` verdes | ⏳ |
| 1.5 | Teste-guarda "ninguém lê `user.role` nem a tabela antiga fora da lista de compatibilidade" + medição | Guarda verde; `pnpm perf:seed` + `scripts/perf/medir.sh` em `/api/leads` e Dashboard do SDR dentro de ±10% de `docs/plans/desempenho.md`; suítes `db`, `shared` e `api` verdes; `CLAUDE.md` (Banco e Papéis) atualizado | ⏳ |

**Pronto quando (fase):** suíte da API e e2e do web passam sem nenhuma edição fora de `packages/db`
e do seed; no ITODEV, um login por cargo vê exatamente o que via.

## Fase 2 — Regra única, na API e no banco

Branch `feat/NPAC-54-fase-2-regra`. Spec: "Regra única", "API", "Fechamento do achado".

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 2.1 | `packages/shared/src/areas.ts`: tipos, `podeGerenciar` e o arquivo de casos (todas as linhas da tabela da spec + os anti-objetivos) | `pnpm --filter @npac/shared test` verde com a tabela de casos; export `@npac/shared/areas` sem zod | ⏳ |
| 2.2 | Gêmea em SQL dentro de `area_definir_membro`, `area_remover_membro`, `area_definir_mestre`, `area_gerencia`; `push_purge_user` usa `area_gerencia`; selo de Admin só pela Diretoria | O mesmo arquivo de casos roda em `db/test` contra o SQL e dá o mesmo resultado | ⏳ |
| 2.3 | `admin/users` e `admin/access-requests`: sai `guardLeadership`, entra a regra; `@AllRoles()` + guarda "Mestre ou Head de alguma área"; lista e pedidos filtrados por área; escrita de cargo só por `area_definir_membro` | e2e novo por ator (Diretoria, Head do Comercial, Head do Acompanhamento): convida, aprova, troca cargo, redefine senha, desativa; 404 e 403 da regra; `admin.e2e`, `cargos.e2e`, `access-requests.e2e` atuais verdes | ⏳ |
| 2.4 | `/api/me` com `mestre` e `areas`; `PUT /mentoria/perfis` recusa mudar `admin` sem ser Diretoria; leitores do cargo no código passam a olhar o vínculo | e2e: Admin do módulo tenta dar e tirar o selo de outro → 403; `acompanhamento-sem-comercial` verde com o caso "sem Head recebe 404 em `admin/*`" | ⏳ |
| 2.5 | Auditoria das ações novas, `CLAUDE.md` e status | `pnpm lint && pnpm typecheck`; suítes `shared`, `db`, `api` verdes | ⏳ |

**Pronto quando (fase):** pela API, a `duda` cria uma conta de Operação e aprova um pedido do
Acompanhamento; a `ana` não enxerga contas do Acompanhamento; ninguém além da Diretoria dá Head.

## Fase 3 — Telas: equipe por área

Branch `feat/NPAC-54-fase-3-telas`. Spec: "Telas". **Antes de codar:** confirmar com o Gabriel os textos
novos listados no fim da seção "Telas" (M3, M6) e mostrar 2–3 opções em imagem da aba Perfis.

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 3.1 | Textos e desenho aprovados pelo Gabriel (aba Perfis e Admin → Usuários da Diretoria) | Resposta dele registrada na spec | ⏳ |
| 3.2 | Módulo → Configurações → Perfis: Convidar, Pedidos de acesso, cargo, Redefinir senha, Desativar; sai a nota "Conta nova: a Diretoria cria…" | Playwright: `duda` convida uma Operação, que entra direto no módulo; `duda` aprova um pedido; `duda` não vê o interruptor de Admin | ⏳ |
| 3.3 | Admin → Usuários: Head do Comercial só vê o Comercial; Diretoria com filtro por área e cargos por área | Playwright: `ana` não vê contas do Acompanhamento; `diretor` filtra por área; `e2e/admin.spec.ts` verde | ⏳ |
| 3.4 | Verificação visual e de peso | Capturas 375 / 768 / 1024 / 1440 das duas telas, sem rolagem lateral nem texto cortado; JS de `/leads` < 150 KB; cada tela que usa `cargo-field` reconferida | ⏳ |
| 3.5 | Roteiro no ITODEV por cargo (login → onde cai → cliques no menu) + `CLAUDE.md` e status | Lista do que passou, com URL e login por cargo, entregue ao Gabriel | ⏳ |

**Pronto quando (fase):** a Eduarda consegue, no ITODEV, fazer sozinha as 3 contas que pediu.

## Fase 4 — Pessoa em duas áreas

Branch `feat/NPAC-54-fase-4-duas-areas`. Spec: "API" (rotas por área), "Telas" item 3.

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 4.1 | `PUT` e `DELETE admin/users/:id/areas/:area` (só Diretoria); `PATCH` em conta com duas áreas responde 400 | e2e: Diretoria põe a `sonia` como Especialista e tira; Head recebe 404/403 | ⏳ |
| 4.2 | Guardas: `MentoriaGuard` pelo vínculo; `PerfilGuard` com `membro`; MFA do módulo pelo vínculo | e2e novo `duas-areas`: a `sonia` usa as rotas do comercial como Closer e as do módulo como Especialista (só as reuniões que conduz); `acompanhamento-sem-comercial` verde | ⏳ |
| 4.3 | Web: menu, `/`, `not-found`, Mais e `modules.mentoria` pelo vínculo; "Adicionar a outra área" no Admin da Diretoria | Playwright: `sonia` entra por `/login` e vê os dois menus; entra por `/login/acompanhamento` e cai no módulo | ⏳ |
| 4.4 | Head de cada área vê a pessoa com `outraArea`; senha e desativar bloqueados com a frase da spec | Playwright + capturas 375 / 768 / 1024 / 1440 | ⏳ |
| 4.5 | Roteiro no ITODEV + `CLAUDE.md` e status | Lista do que passou entregue ao Gabriel | ⏳ |

**Pronto quando (fase):** uma conta com as duas áreas trabalha nas duas com um login, e nenhum Head
alcança a outra área por ela.

## Fase 5 — Limpeza da compatibilidade

Branch `chore/NPAC-54-fase-5-limpeza`. **Só depois** de as fases 1–4 estarem em prod e de uma release
inteira sem rollback. Spec: "Compatibilidade".

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 5.1 | Testes e seeds deixam de escrever `user.role` direto (10 arquivos, 22 pontos em 19/11) e passam a um helper que chama `area_definir_membro` | `grep` por `set role` nos testes vazio; suítes verdes | ⏳ |
| 5.2 | Migration: sai o gatilho que traduz escrita em `user.role` (escrita direta passa a dar erro), sai a visão `mentoria_perfis` e `mentoria_definir_perfil` | Teste-guarda da fase 1 sem lista de compatibilidade; `migrations.test.ts` verde | ⏳ |
| 5.3 | `CLAUDE.md`, status e nota de que `user.role` é resumo (M7) | Suítes `db`, `api`, `shared` e e2e do web verdes | ⏳ |

---

## Pendências com o Gabriel (não travam as fases 1 e 2)

- Conferir as decisões M1–M9 da spec.
- Textos novos de tela (antes da fase 3).
- Religar MFA para Diretoria e Heads e ter duas contas de Diretoria (recomendação, fora deste plano).
- Com a Eduarda: 1A/1B (Maria) e 2A/2B (segunda Maria); até a fase 3 chegar a prod, quem cria as contas
  é o Gabriel (Admin → Convidar → Cargo).

## Brief de cada sessão (copiar e trocar a fase)

```
Goal: executar a Fase N do plano de acesso por área (NPAC-54) e deixá-la mesclada na release aberta.
Where: repo npac-corporation, branch a partir da release/vX.Y aberta; plano docs/plans/acesso-por-area.md
  (Fase N); spec docs/superpowers/specs/2026-11-19-acesso-por-area-design.md.
Decided:
  - A tabela area_membros é a fonte do cargo; user.role é só resumo calculado.
  - Nenhuma política de RLS é reescrita; as funções trocam de fonte com o mesmo resultado.
  - Regra única de quem gerencia quem (tabela da spec); só a Diretoria dá e tira Head.
  - Nomes na tela não mudam; texto novo de tela só com o sim do Gabriel.
  - Só as tarefas da Fase N; o que for de outra fase vira nota no plano.
Done when: os "pronto quando" da Fase N passam, com o comando e a saída no relatório.
Limits: push/PR/merge pelas regras de Git (squash só com o CI inteiro verde); prod precisa do sim do
  Gabriel; sem outras sessões; relatório final em até 5 linhas.
```
