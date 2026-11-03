# Auditoria do projeto — 03/11/2026

Leitura completa de `packages/shared`, `packages/db` (schema + 24 migrations), `apps/api` e `apps/web`
(telas, shell, login, conta). Suítes rodadas depois: API 131/131, db 69/69, shared 90/90, lint e
typecheck limpos. Três achados foram confirmados com um teste e2e temporário (apagado em seguida).

## Confirmados por teste — corrigidos em 03/11/2026

Correções: migration `0024_deals_follow_lead.sql` (`deals_read` segue a visibilidade do lead),
`saleRequired()` também na criação do lead + `<StageOptions>` no formulário, `findById` com
`deleted_at IS NULL`. Testes: `rls.test.ts` "venda e parcelas seguem o SDR atual",
`finance.e2e` "venda acompanha o lead quando o SDR muda", `leads.e2e` "lead não nasce em Venda"
e "lead excluído não abre nem para a liderança".

### 1. Lead transferido com venda ativa perde os invariantes de venda — ALTA
- **Onde:** `apps/api/src/leads/lead-mutations.service.ts:107` (`guardSaleStage`), `finance.service.ts`
  (`register`, `list`), política `deals_read` em `packages/db/drizzle/0011_finance.sql:67`.
- **Causa:** os checks "existe venda ativa?" rodam sob a RLS de `deals`, que para SDR exige
  `sdr_id = eu`. Depois de `PATCH sdrId` ou `transfer-leads`, o novo SDR vê o lead mas não a venda.
- **Efeito observado:** novo SDR move o lead de VENDA para EM_FOLLOW (200); `GET /finance/leads/:id`
  devolve `[]` e o botão "Registrar venda" volta; as cobranças somem do Hoje dos dois SDRs.
- **Correção na raiz:** `deals_read` seguir a visibilidade do lead (`lead_id IN (SELECT id FROM leads)`),
  como já fazem `payments_read` e as tabelas de atividade. Alternativa: checks de invariante em função
  SECURITY DEFINER (padrão `lead_contact_taken`). Nova migration 0024; nunca editar a 0011.

### 2. `POST /leads` aceita `stageKey: 'VENDA'` sem venda — MÉDIA
- **Onde:** `apps/api/src/leads/leads.service.ts:117`; formulário `apps/web/components/lead-form.tsx:151`.
- **Efeito:** lead nasce em VENDA sem deal; funil e "Vendas" (por deals) divergem.
- **Correção:** recusar VENDA na criação (409 `SALE_REQUIRED`, mesmo texto do PATCH) e usar
  `<StageOptions>` no formulário (regra do CLAUDE.md).

### 3. `GET /leads/:id` devolve lead excluído para a liderança — MÉDIA (privacidade)
- **Onde:** `apps/api/src/leads/leads.repository.ts:102` (`findById` sem `deleted_at IS NULL`).
- **Efeito:** 200 com telefone decifrado + audit `lead.view`, enquanto `/activity`, reuniões e finance
  dão 404; a página web cai em not-found. Lead excluído continua legível até a anonimização (180 dias).
- **Correção:** `findById` com `isNull(leads.deletedAt)` (mesmo critério do `lockLead`).

## Fluxos corrigidos no segundo bloco (03/11/2026)

4. **Admin sem UI para `canProspect`/`canClose`** — cada linha da equipe ganhou as caixas
   "Prospecta" e "Fecha" (`admin.tsx`, PATCH que a API já aceitava). Playwright `admin.spec.ts`.
5. **Filtro salvo com `period=RANGE` sem datas** — `viewInput` recusa (400 "Intervalo inválido",
   mesma regra da lista); `/leads?view=<id>` com filtro antigo inválido abre a lista sem ele em vez
   de quebrar (`leads/page.tsx`). Teste `views.e2e` "intervalo salvo exige datas válidas".
6. **Reunião com resultado** — não remarca, não troca closer nem cancela (409 "A reunião já tem
   resultado"); só a liderança corrige o resultado. Ficha esconde esses controles
   (`lead-detail.tsx`). Teste `meetings.e2e` "reunião com resultado não remarca…".

## Fluxos corrigidos no terceiro bloco (03/11/2026)

7. **Tarefa da ficha é de quem trabalha o lead** — a liderança cria para o SDR do lead por padrão
   (ou escolhe "Eu" no select "Responsável"); `assigneeId` fora de {SDR do lead, quem cria} → 400.
   A lista mostra para quem é. Teste `today.e2e` "tarefa que a liderança cria na ficha…".
8. **Pedido de acesso com e-mail já cadastrado** — tratado como usuário existente: resposta neutra e
   nada gravado (`request-access.ts`). Teste `access-requests.e2e` "e-mail já cadastrado responde igual".
11. **SDR com `canProspect=false`** — `POST /leads` → 403 "Seu usuário não prospecta"; botão "Novo lead"
   e `/leads/new` seguem a flag, não o cargo. Teste `leads.e2e` "SDR que não prospecta não cadastra lead".

## Fluxos quebrados ou incompletos (não testados em runtime, lidos no código)

9. **Hoje da liderança lista tarefas pessoais de todo mundo** (`today.service.ts:105` + RLS 0010).
10. **Handoff diz "a agendar" assim que a reunião começa** (`handoff.ts:48`, exige `scheduled_at > now()`).
12. **Equipe: vendas de quem prospecta e fecha usam `max`, não soma** (`collab/team.ts:51`).
13. **Sessão expira 30 dias após o login mesmo com uso diário** (`auth.ts:135`) — plausível, não
    verificado: o `SessionGuard` não repassa o cookie renovado ao navegador.

## Custo e ruído (efficiency)

14. **Dashboard refaz o relatório inteiro (10 consultas + audit `report.view`) a cada evento SSE**, e o
    SSE dispara para chat, lidos e avisos (`reports.tsx:161`).
15. **`ready` do SSE é tratado como `invalidate`**: toda tela faz o fetch duas vezes ao abrir e grava
    auditoria em dobro (`live-updates.tsx:10`).
16. **SSE varre leads/tarefas inteiras a cada 2 s por aba** (`events.controller.ts:26`); disputa o pool
    de 10 conexões com as 8 transações paralelas do pipeline.
17. **Auditoria `lead.list` por tecla** na paleta Ctrl+K e na menção do chat, 8× por abertura do
    pipeline (`leads.service.ts:150`).
18. **`usePending` chama `/api/notifications` 2–3× por página** (`inbox.tsx:33`).
19. **`receivedCents` repete o CTE `paid`** (`reports.service.ts:136`).
20. **`finance.list` faz N+1 em `payments`** (`finance.service.ts:58`).

## O que está bem (não precisa mexer)

RLS cobre leads, reuniões, atividade, chat, finanças e avisos com triggers de coluna; dinheiro em
centavos com checagem de saldo no COMMIT; idempotência por `requestKey` + hash; contato cifrado com
blind index e buscas por POST; auditoria sem PII; pedidos de acesso com resposta neutra e rate limit;
Diretoria tratada como HEAD na RLS sem duplicar políticas.
