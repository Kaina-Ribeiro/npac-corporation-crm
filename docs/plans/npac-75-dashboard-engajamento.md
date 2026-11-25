# NPAC-75 — plano

Spec: `docs/superpowers/specs/2026-11-24-npac-75-dashboard-engajamento-design.md`. Branch
`feat/NPAC-75-dashboard-engajamento` a partir da `release/v0.23`.

| # | Tarefa | Status |
|---|---|---|
| 1 | Migration 0087: coluna, CHECK, `mentoria_ve_engajamento()`, área `ENGAJAMENTO` em `mentoria_edita`, gatilho de guarda, grant de UPDATE; schema Drizzle e snapshot | ✅ |
| 2 | Teste do banco `db/test/mentoria-engajamento.test.ts` (Admin, Acompanhamento, carteira, Operação, Especialista) | ✅ |
| 3 | Shared: `sh/mentoria/engajamento.ts` (enums, rótulos, `rotuloMentoria`, `montarEngajamento`) + teste; schema do PATCH; DTOs | ✅ |
| 4 | API: PATCH da inscrição com `engajamento`; ficha com `engajamento` e `pode.verEngajamento`/`pode.engajamento`; painel com o bloco | ✅ |
| 5 | API e2e `mentoria-v2-engajamento.e2e.test.ts` | ✅ |
| 6 | Web: Dashboard (bloco, listas, tipos, celular), funil com subtítulo, nomes do menu/Mais/título; campo na ficha; rótulo do histórico | ✅ |
| 7 | e2e Playwright `acompanhamento-engajamento.spec.ts` (+ iPhone) e ajustes dos e2e que procuram "Onboarding" | ✅ |
| 8 | Lint, typecheck, suítes, limite de `/leads`; capturas 375/768/1024/1440 × protótipo | ✅ |
| 9 | CLAUDE.md ✅; PR, CI, merge, ITODEV, caixa | ⏳ |

Notas:
- Endereço mantido em `/acompanhamento/onboarding` (cookies, links, e2e). Barra do celular sem mudança (Dashboard pelo Mais).
- `/leads` mede 153.596 bytes gzip (limite 153.600), igual com o engajamento dentro ou fora do barril
  `@npac/shared/mentoria`: o teto já vinha da release. Mesmo assim o cliente importa por `@npac/shared/engajamento`.
- Capturas do build em 375/768/1024/1440 em `docs/acompanhamento/prototipo/npac-75/build-*.png`. Diferenças corrigidas:
  etiqueta do cabeçalho quebrada (classe `.eg` colidia com o bloco), cartões 3+2 / 4+1 em 768 e 1024 (agora container
  query: Total em faixa + 4 grupos; 5 lado a lado a partir de 900 px de bloco), variante faltando na linha do funil.
  Mantidas de propósito: avatares no estilo do app (o protótipo usa pastéis).
