# Plano — NPAC-77 versão no rodapé e janela de novidades

Spec: `docs/superpowers/specs/2026-11-25-npac-77-versao-e-novidades-design.md` · Decisões 1A, 2A, 3A, 4A
(Gabriel, 25/11/2026) · Canvas https://claude.ai/artifact/EhkXTCT3axduWVY8o9Tum6 · Mock
`docs/prototipos/novidades/index.html`.

Branch `feat/NPAC-77-versao-novidades` a partir da `release/vX.Y` aberta (abrir com `cut-release` se não houver).
Um PR por fase, `feat(NPAC-77): …`.

## Fase 1 — número e "já vi" (base)

| # | Tarefa | Status |
|---|---|---|
| T1 | Descobrir como a tag chega à API (Cubeship expõe a ref? senão adaptador do kit grava `APP_VERSION`; senão `git describe`). Registrar a escolha na spec. | ✅ opção 2, kit PR #17 (release do kit espera o sim) |
| T2 | `sh/novidades.ts`: tipos, `versaoNaTela`, `novidadeVisivel`, `naoVistas`, entradas de 23–25/11 + `npac-77-versao`; testes (casos por cargo, ids únicos, datas em ordem, sem contato nos textos). | ✅ |
| T3 | Migration `user.novidades_vista` + `GET /api/me` (`versao`, `novidadesVista`, preenche a mais nova se vazia) + `POST /api/me/novidades/vista` (`@AllRoles`, só avança); e2e da API. | ✅ 0088 |
| T4 | Rodapé A na sidebar (some recolhida) e linha no cartão da conta do `/mais` e `/acompanhamento/mais`; ponto dourado com não vista. | ✅ capturas em `docs/capturas/npac-77/` |

Pronto quando: o rodapé mostra o número do ITODEV (rc sem `-rc`) e "dev" local; a API guarda e só avança o "já vi".

## Fase 2 — a janela

| # | Tarefa | Status |
|---|---|---|
| T5 | Componente da janela (`next/dynamic`): novas por data, "Precisa de você" no topo, histórico, links que fecham e navegam, folha no celular, `closeWithMotion`. | ⏳ |
| T6 | Abrir sozinha ao carregar com não vista (fora de login, senha obrigatória e impressão); marcar visto em Entendi/X/Esc/fora/link. | ⏳ |
| T7 | e2e por cargo (Eduarda, Igor, Sônia, Diretoria): vê só o dela, não reabre em outro "aparelho", versão sem nada não abre; `/leads` dentro do teto de JS. | ⏳ |
| T8 | Capturas 375/768/1024/1440 claro e escuro, lado a lado com o mock. | ⏳ |

## Fase 3 — processo

| # | Tarefa | Status |
|---|---|---|
| T9 | Seção "Novidades para a equipe" no modelo de PR; regra no `CLAUDE.md` (mapa, Web, e como escrever uma entrada). | ⏳ |
| T10 | ITODEV: roteiro por cargo (login → janela → Entendi → outro navegador não abre), senhas de volta a 1234. | ⏳ |
