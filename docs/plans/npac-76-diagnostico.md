# NPAC-76 — plano

Design: `docs/superpowers/specs/2026-11-24-npac-76-diagnostico-design.md`. Branch `feat/NPAC-76-diagnostico` → `release/v0.23`.

| # | Tarefa | Status |
|---|---|---|
| 1 | Migration 0086: colunas novas, gatilho do total das dívidas, GRANT, cópia do total antigo para Dívida 1; teste no `packages/db` | ✅ (5c47fb4) |
| 2 | Shared: `momentoSchema` e `MomentoDTO` com os campos novos; rótulos | ✅ (5c47fb4) |
| 3 | API: `montar` e `salvarMomento` cifram/decifram os campos novos; teste e2e (salvar, travar, total, permissões, LGPD) | ✅ (5c47fb4) |
| 4 | Web: aba Pessoas com Diagnóstico + Contato e entrega; aba Momento inicial sai; `?aba=momento` → pessoas | ✅ |
| 5 | Evolução e PDF: rótulos e link | ✅ |
| 6 | e2e e capturas 375/768/1024/1440; CLAUDE.md; PR; ITODEV por cargo | 🚧 e2e focado e capturas ok; PR e ITODEV |

Notas (24/11): migration 0086 provada numa cópia do banco de dev (só `divida_1_centavos` mudou, versão e datas iguais);
`packages/db` 46/46 e `mentoria-v2-base.e2e` 39/39. Estilos da ficha em `app/(app)/acompanhamento/modulo.css`
(`.pr`, `.pv`, `.props`, `.mo-h`, `.locked`, `.tx`, `.kp`); campos salvam ao sair por `CampoPr`/`useCampo` (`campo.tsx`),
fila por chave `momento:<id>` e `pessoa:<inscricao>:<pessoa>` (`lib/acompanhamento-saver.ts`).
