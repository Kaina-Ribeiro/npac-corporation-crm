# Acompanhamento v2, Fase 2 (cobrança) — Plano

> **Para quem executa:** use superpowers:executing-plans (ou subagent-driven-development, se o Gabriel pedir).
> Antes de cada parte, escreva o passo a passo detalhado dela (superpowers:writing-plans) numa seção
> "Parte N — tarefas" deste arquivo e só então implemente.

**Goal:** ciclo semanal de cobrança do PDF (PMEs e ciclos, metas, tarefas, check-in lançado pela equipe,
semáforo, Fila e aba 7), sem esperar as 3 respostas em aberto da Eduarda.

**Spec:** `docs/superpowers/specs/2026-11-11-acompanhamento-v2-fase-2-design.md` (ler inteiro). Base: design
da Fase 1 (`docs/superpowers/plans/2026-11-10-acompanhamento-v2-design.md`) e o plano da Fase 1
(`docs/superpowers/plans/2026-11-10-acompanhamento-v2-fase-1.md`, seção "Global Constraints", que vale aqui).

## Como executar

- **Uma sessão nova por parte** (Opus 5.5, esforço high). A sessão lê este plano, a spec e `CLAUDE.md`,
  e atualiza a coluna Status ao terminar.
- **Branch por parte:** `feat/NPAC-43-fase-2-parte-N-nome`, a partir da `release/vX.Y` aberta (hoje
  `origin/release/v0.14`), depois que a parte anterior entrou nela. Sem branches empilhadas. PR
  `feat(NPAC-43): resumo` em minúsculas, squash. Push, PR, Auto-fix e merge com CI verde seguem as regras
  do Gabriel (sim permanente); produção precisa do OK dele.
- Migration nova com número e `when` depois da última **no momento da execução** (hoje a última é `0056`).
- Dev pelo painel (`preview_start`), banco de teste próprio se o `npac` local estiver adiantado.

| Parte | Entrega | Status |
|---|---|---|
| 1 | Catálogo de PMEs, ciclos e tarefas do ciclo (envio, extras, encerramento, status derivado) + Configurações > PMEs + card "PME atual" na ficha | ⏳ |
| 2 | Metas, tarefas da reunião (até 3, prazo), cobrança da reunião anterior, % do PME (tarefas e metas) | ⏳ |
| 3 | Check-ins lançados pela equipe, semáforo (função, histórico semanal, sequência), colunas em Mentorados | ⏳ |
| 4 | Fila (COBRANCA, SEMAFORO, ENVIAR_PME, PME_ATRASADO, FIM_PME espera o ciclo), push, aba 7 "PMEs e ciclos", CSV, fechamento | ⏳ |
| 5 | Depois da Eduarda: P1, P2, P3 da spec §9 (pequenas) | aguardando respostas |

## Parte 1 — PMEs e ciclos

Feito quando:
- Migration com `mentoria_pmes`, `mentoria_ciclos`, `mentoria_tarefas` (RLS, grants, sem DELETE, gatilho
  de encerramento, índice de um ciclo aberto, gatilho das 3 tarefas por reunião já pronto para a parte 2),
  `mentoria_ciclo_status` em SQL; catálogo com os números 1 e 2 do PDF (extras e o ritual do 1º).
- API: catálogo (`GET`/`PATCH` Admin), envio do PME (Admin, ACOMPANHAMENTO, OPERACAO), registro de ciclo
  anterior ao sistema, tarefas do ciclo (marcar resultado, motivo, comprovante), corrigir data de envio.
- Web: Configurações > PMEs; ficha > Jornada com o card "PME atual", ciclos e tarefas do ciclo.
- Testes da spec §8 que cabem na parte (db + api + Playwright da ficha e de Configurações), capturas nos
  4 tamanhos, suítes do CRM verdes, `CLAUDE.md` atualizado. PR aberto na `release/v0.14`.

## Parte 2 — Metas e tarefas da reunião

Feito quando: `mentoria_metas`; registro da reunião com "Cobrança da reunião anterior", "Metas definidas ou
ajustadas" e "Tarefas da semana" (até 3, prazo obrigatório, 400 na 4ª); Especialista só nas próprias
reuniões; % do PME (tarefas e metas) em SQL e nas duas barras do card; seções Metas e Tarefas na ficha.

## Parte 3 — Check-in e semáforo

Feito quando: `mentoria_checkins` e `mentoria_semaforo_historico`; lançar check-in na ficha (enviado,
respondeu, avanço, travou, próximo passo); `mentoria_semaforo(inscricao, dia)` com os 6 motivos;
histórico gravado na virada da semana pelo timer único e completado ao subir a API (idempotente);
sequência de semanas; Mentorados com PME atual, semáforo e % do PME, filtro por semáforo.

## Parte 4 — Fila, avisos e aba 7

Feito quando: tipos COBRANCA, SEMAFORO, ENVIAR_PME, PME_ATRASADO em `mentoria_fila` + `sh/mentoria/fila.ts`
(quem vê, rótulos, filtro); degraus de atraso gravam contato; ação FIM_PME espera o ciclo (mês 2 com teto de
15 dias); push conforme a spec §6; aba 7 "PMEs e ciclos" no lugar do "em breve"; CSV com PME atual, status
do ciclo e semáforo; spec §8 inteira verde; `CLAUDE.md` e este plano fechados.

## Parte 5 — Respostas da Eduarda

Aplicar P1, P2 e P3 conforme a spec §9 quando ela responder. Cada uma é pequena e isolada.
