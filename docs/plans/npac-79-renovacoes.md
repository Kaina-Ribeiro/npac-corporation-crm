# Plano NPAC-79 — Renovações (gestão do Acompanhamento, bloco 2)

Spec: `docs/superpowers/specs/2026-11-26-renovacoes-design.md`. Respostas da Eduarda: 1A, 2C, 3B, 4B, 5A, 6A, 7A, 8A.
Branch de cada parte a partir da `release/*` aberta; PR `feat(NPAC-79): …`; migration nova depois da última da release.

Status: spec aprovada (26/11/2026, G1–G6 como recomendados). Parte 1 🚧, Parte 2 ⏳, Parte 3 ⏳ (Eduarda).

## Parte 1 — banco e API 🚧

1. Migration: tabela `mentoria_renovacoes` (RLS de leitura no formato `(select …)`, `npac_app` só SELECT), área
   `RENOVACAO` em `mentoria_edita` (Admin, Acompanhamento com carteira), coluna `concluida_em` + gatilho, guarda que
   recusa status RENOVADO manual, `mentoria_gerar_acoes` com "a partir do mês", `mentoria_renovar`,
   `mentoria_renovacao_desfazer` (só Admin), leitura `mentoria_renovacoes_painel(hoje)` (lista + números, SECURITY
   INVOKER, `SET jit = off`).
2. Shared: tipos e regras puras (situação da conversa, mês "N de M", rótulos) em `sh/mentoria/renovacoes.ts`.
3. API `renovacoes.controller.ts`: `GET mentoria/renovacoes`, `POST inscricoes/:id/renovacoes`,
   `DELETE inscricoes/:id/renovacoes/ultima`; ficha traz `renovacoes` e `pode.renovar`/`pode.desfazerRenovacao`.
4. Testes: `db/test/mentoria-renovacoes.test.ts`, `rls-por-consulta`, `api/test/mentoria-v2-renovacoes.e2e.test.ts`.

Feita quando: as suítes do db e da API passam e a ficha devolve o término novo e as ações do novo ano.

## Parte 2 — telas ⏳

1. Aba `/acompanhamento/renovacoes` (números, lista, filtros lembrados em `AC_PREFS`), menu/Ctrl+K/Mais, redireciona o
   "Em breve".
2. Ficha: "Registrar renovação" (janelinha), selo "Renovado em DD/MM", "Mês 14 de 24", faixa do ano atual, "Desfazer".
3. Select de status sem "Renovado".
4. e2e `acompanhamento-renovacoes.spec.ts` (Duda, carteira, Operação) e capturas 375/768/1024/1440, claro e escuro.
5. CLAUDE.md atualizado.

Feita quando: e2e verde, capturas conferidas, roteiro no ITODEV com Admin, Acompanhamento e Operação.

## Parte 3 — PMEs do 2º ano ⏳ (depende da Eduarda)

Mensagem pronta (mandar quando a Parte 2 estiver no ITODEV, ou antes se o Gabriel quiser):

```
Duda, mais duas sobre a renovação, para o 2º ano:

*1. Depois de renovar, a pessoa continua recebendo PME todo mês?*
A) Sim, segue do 13º ao 24º PME (você cadastra os novos em Configurações > PMEs)
B) Sim, mas recomeça do 1º PME
C) Não recebe PME no 2º ano

*2. As ações de cada mês do 2º ano (o plano):*
A) Você cadastra os meses 13 a 24 em Configurações > Plano-modelo, quando quiser ⭐
B) Repete o plano do 1º ano
```
