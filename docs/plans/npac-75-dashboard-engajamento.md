# NPAC-75 — plano

Spec: `docs/superpowers/specs/2026-11-24-npac-75-dashboard-engajamento-design.md`. Branch
`feat/NPAC-75-dashboard-engajamento` a partir da `release/v0.23`.

| # | Tarefa | Status |
|---|---|---|
| 1 | Migration 0087: coluna, CHECK, `mentoria_ve_engajamento()`, área `ENGAJAMENTO` em `mentoria_edita`, gatilho de guarda, grant de UPDATE; schema Drizzle e snapshot | ⏳ |
| 2 | Teste do banco `db/test/mentoria-engajamento.test.ts` (Admin, Acompanhamento, carteira, Operação, Especialista) | ⏳ |
| 3 | Shared: `sh/mentoria/engajamento.ts` (enums, rótulos, `rotuloMentoria`, `montarEngajamento`) + teste; schema do PATCH; DTOs | ⏳ |
| 4 | API: PATCH da inscrição com `engajamento`; ficha com `engajamento` e `pode.verEngajamento`/`pode.engajamento`; painel com o bloco | ⏳ |
| 5 | API e2e `mentoria-v2-engajamento.e2e.test.ts` | ⏳ |
| 6 | Web: Dashboard (bloco, listas, tipos, celular), funil com subtítulo, nomes do menu/Mais/título; campo na ficha; rótulo do histórico | ⏳ |
| 7 | e2e Playwright `acompanhamento-engajamento.spec.ts` (+ iPhone) e ajustes dos e2e que procuram "Onboarding" | ⏳ |
| 8 | Lint, typecheck, suítes, limite de `/leads`; capturas 375/768/1024/1440 × protótipo | ⏳ |
| 9 | CLAUDE.md, PR, CI, merge, ITODEV, caixa | ⏳ |
