# Plano — campos por etapa (NPAC-38)

Spec: `docs/superpowers/specs/2026-11-05-campos-por-etapa-design.md` (aprovada 05/11/2026, 1A 2A 3A).
Branch: `feat/NPAC-38-campos-por-etapa`, criada a partir de `feat/NPAC-37-perfil-pela-faixa` (mesmo
`lead-form.tsx` e migration 0036). Quando a NPAC-37 entrar na `release/v0.8`, rebase na release
(sem branch empilhada no fim).

⚠️ A branch local `feat/NPAC-36-ficha-linha-vertical` (outra sessão) mexe na ficha
(`lead-detail.tsx`). A fase 2 confere o estado dela antes de editar a ficha.

Uma sessão nova por fase; esta sessão só lê este arquivo e as notas.

## Fase 1 — banco e API

| # | Tarefa | Status |
|---|---|---|
| 1.1 | Migration 0037: `payment_product_id`, `payment_amount_cents`, enum `lead_lost_reason`, `lost_reason`, `lost_reason_other` (CHECK como `source_other`), `lgpd_anonymize` apaga o texto, gatilho do closer aceita os campos novos junto da etapa. Testes do banco primeiro. | ✅ |
| 1.2 | Shared: schemas de cadastro/PATCH com `meeting`, `paymentProductId`, `paymentAmountCents`, `lostReason`, `lostReasonOther`; rótulos dos motivos em `sh/enums.ts`. | ✅ |
| 1.3 | API: 409 `MEETING_REQUIRED` / `PAYMENT_REQUIRED` / `REASON_REQUIRED` só quando `stageKey` muda; cria a reunião na mesma transação (regras de `meetings.service.ts`, `rearm()` depois do commit); limpa os campos ao sair da etapa; Agendado com reunião futura aberta não pede de novo. | ✅ |
| 1.4 | DTO do lead traz os campos novos; registrar venda aceita vir pré-preenchido (produto e valor). | ✅ |
| 1.5 | e2e da API (RED antes): cada 409, transação desfeita se a reunião falha, closer marca Agendou Pagamento e Sem Perfil, campos limpos ao sair. Suítes db/api/shared + lint + typecheck. | ✅ |

Feita quando: `pnpm --filter @npac/db test`, `pnpm --filter @npac/api test`, `pnpm lint && pnpm typecheck` passam.

**Contrato para a fase 2** (fase 1 concluída em 05/11/2026):

- Corpo de `POST /leads` e `PATCH /leads/:id`: `meeting { scheduledAt, closerId }` (Agendados),
  `nextContactAt` + `paymentProductId` + `paymentAmountCents` (Agendou Pagamento), `lostReason`
  (`LOST_REASONS`, rótulos `LOST_REASON_LABELS`) + `lostReasonOther` (Sem Perfil). Origem da
  reunião vem da etapa (`MEETING_ORIGIN_BY_STAGE`).
- 409 `MEETING_REQUIRED` / `PAYMENT_REQUIRED` / `REASON_REQUIRED` só na troca de etapa (mensagem em
  português no corpo). Agendado com reunião futura aberta não pede outra. Dados de outra etapa são
  ignorados; ao sair da etapa, pagamento e motivo são apagados; Sem Perfil apaga o próximo contato.
- `LeadDTO` traz `paymentProductId`, `paymentAmountCents`, `lostReason`, `lostReasonOther` (o
  registro da venda pré-preenche com eles; registrar a venda os apaga).
- Closer: só junto da troca de etapa grava `nextContactAt`, pagamento e motivo; `meeting` → 403.
- Timeline ganhou os campos `payment` e `lostReason`: `web/lib/activity-text.ts` precisa dos rótulos.
- ⚠️ `apps/web/e2e/login.spec.ts:224` muda a etapa para `AGENDADO_FOLLOW` sem reunião: vai receber
  409 até a tela pedir a reunião (ajustar na 2.2/2.5).

## Fase 2 — telas

| # | Tarefa | Status |
|---|---|---|
| 2.1 | Componente único de campos por etapa (reunião+closer · pagamento+produto+valor · remarcar · motivo+texto do Outro · próximo contato). | ✅ |
| 2.2 | Cadastro (`lead-form.tsx`) e ficha (`lead-detail.tsx`, "Mover para") usando o componente. | ✅ |
| 2.3 | Janelinha no Pipeline (arrastar e seletor) e na célula da lista; cancelar devolve à etapa antiga. | ✅ |
| 2.4 | Ação em massa: sem Agendados e Agendou Pagamento; Sem Perfil pede motivo para todos. | ✅ |
| 2.5 | Playwright (cadastro em Agendado Direto cria reunião; Sem Perfil + Outro exige texto; janelinha do pipeline) + prints 375/768/1024/1440; `/leads` < 150 KB gzip. | ✅ |

Feita quando: `pnpm --filter @npac/web e2e` passa e os prints mostram os campos certos por etapa.

**Fase 2 concluída** (05/11/2026): `pnpm --filter @npac/web e2e` 141 passaram, 4 pulados (MFA
desligado); JS de `/leads` 149,4 KB gzip; `pnpm lint && pnpm typecheck` ok. Prints
`apps/web/test-results/etapa-{cadastro,ficha,janelinha}-{375,768,1024,1440}.png` e `etapa-massa-1440.png`.

- Componente `components/stage-fields.tsx` + leitura `lib/stage-fields.ts` (`readStageFields`); o que
  cada etapa pede em `lib/stage-kind.ts` (leve, a lista só importa este). Janelinha
  `components/stage-move-dialog.tsx`: na lista baixa sob demanda (`import()`), fora da primeira carga.
- Na edição de um lead que já está na etapa, os dados não são obrigatórios (3A); a reunião não aparece
  (fica na seção Reuniões). Closer não agenda: Agendado sem reunião marcada mostra o aviso e não salva.
- A ficha mostra o motivo (Sem Perfil) e o produto/valor combinados; "Registrar venda" abre com eles.
  Histórico da ficha cita os campos alterados ("Etapa alterada · motivo do Sem Perfil").
- Todos (inclusive SDR) recebem a lista de produtos na ficha e no cadastro (a rota já era aberta).
