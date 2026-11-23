# Gestão do Acompanhamento, bloco 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a venda de RDV, 2M ou 6M registrada pelo closer cria a inscrição no Acompanhamento na mesma transação; a Maria
(cargo Envios) envia Caixa, presente, kit e certificado por uma aba própria.

**Architecture:** `insertSale` chama um serviço do módulo (`InscricaoDaVenda`) que cifra o contato do lead com a chave do
Acompanhamento e chama uma função `SECURITY DEFINER` do banco; estorno e situação do pagamento são SQL. O perfil `ENVIOS`
não lê nada do módulo pela RLS e usa duas funções `SECURITY DEFINER` (lista e escrita de envios).

**Tech Stack:** NestJS + Drizzle + Postgres 16 (RLS, `npac_app`), Next 16, Vitest, Playwright, pnpm/Turborepo.

**Spec:** `docs/superpowers/specs/2026-11-19-acompanhamento-gestao-bloco-1-design.md` (decisões G1–G10, M1–M9).

**Status:** escrito em 19/11/2026; migrations renumeradas em 22/11 (a 0076 é da aba Evolução, NPAC-57). Execução: uma sessão por parte (regra do Gabriel), em ordem; a Parte 2 só começa com
a Parte 1 mesclada na release aberta.

| Parte | O quê | Tarefas | PR | Status |
|---|---|---|---|---|
| 1 | Venda vira mentorado | 1.1–1.5 | `feat(NPAC-56): venda vira mentorado no acompanhamento` | ⏳ |
| 2 | Cargo Envios e aba Envios físicos | 2.1–2.5 | `feat(NPAC-56): cargo envios e aba envios fisicos` | ⏳ |

Branches: `feat/NPAC-56-venda-vira-mentorado` e `feat/NPAC-56-envios-fisicos`, a partir da `release/vX.Y` aberta
(hoje `release/v0.19`), conforme `RELEASING.md`.

## Global Constraints

- Migrations novas: `0077_venda_vira_mentorado.sql` (Parte 1) e `0078_envios_fisicos.sql` (Parte 2), com snapshot e
  `_journal.json` (`idx` e `when` crescentes; se outra migration entrar antes, renumerar). Nunca reescrever migration aplicada.
- Runtime `npac_app` sem BYPASSRLS; toda consulta em `withUser`; política de leitura no formato `(select f())` (teste
  `db/test/rls-por-consulta.test.ts`).
- Contato decifrado só em memória; nunca em log, URL, auditoria, histórico ou payload de push. Histórico: tipo e nomes de
  campos, nunca valores.
- Erros em português para o usuário final. Texto do erro da venda (G9), literal:
  `Não foi possível criar o mentorado no Acompanhamento. Tente de novo; se continuar, avise a liderança.`
- Rótulos literais: cargo **"Envios"**; Admin > Produtos coluna **"Vira mentorado"** (opções "RDV", "2M", "6M", "Não");
  Fila **"Nova inscrição"** e **"Venda estornada"**; aba **"Envios físicos"**; blocos **"A enviar"**, **"Em trânsito"**,
  **"Entregues"**; botões **"Marcar enviado"**, **"Marcar entregue"**, **"Novo envio"**; push da Maria **"Tem envio para hoje"**;
  selo da ficha **"Veio da venda de DD/MM"**; item da Fila com pessoa repetida **"Já tem inscrição: <mentoria>, <status>"**.
- Ação de um clique: `useOptimistic` + `startTransition` + `showToast()`.
- JS de `/leads` < 150 KB gzip (nada do módulo entra no bundle comercial).
- Invisível = 404. Rota que o cargo Envios usa leva o guarda do módulo e `@Perfis('ENVIOS', …)`.
- Fila: a regra de quem vê vive em `sh/mentoria/fila.ts` e na função SQL; mudou uma, mude a outra e o
  `db/test/fila-equivalencia.test.ts`.
- `CLAUDE.md` atualizado no PR de cada parte (fim do "CRM intocado", venda → inscrição, cargo Envios, comandos/seed).

## Review Focus

1. **Venda refeita pelo mesmo `requestKey`** (o closer clica duas vezes): não cria segunda inscrição nem erro — teste na Tarefa 1.3.
2. **Falha da criação no meio** (ex.: chave do módulo ausente, CHECK do banco): nada da venda fica gravado — teste na Tarefa 1.3.
3. **Estorno de venda cuja inscrição já está Ativa, com reuniões e ações**: vira Cancelada e nada é apagado — teste na Tarefa 1.2.
4. **Parcela vencida hoje ainda não paga, e venda à vista (sem parcelas futuras)**: situação "Em atraso" só depois do
   vencimento; à vista = "Quitado" — teste na Tarefa 1.2.
5. **Maria tentando abrir uma ficha ou a lista de Mentorados pelo endereço**: 404, e a lista de envios não traz contato,
   valor nem textos do mentorado — teste na Tarefa 2.2.

---

## Parte 1 — Venda vira mentorado

### Tarefa 1.1: Produto "Vira mentorado" (banco + Admin > Produtos)

**Files:**
- Create: `packages/db/drizzle/0077_venda_vira_mentorado.sql` (+ snapshot, `_journal.json`) — esta tarefa abre a migration; 1.2 continua nela
- Modify: `packages/db/src/schema/finance.ts` (coluna `mentoria`), `apps/api/src/admin/catalog.ts` (create/update/list),
  componente de Admin > Produtos no web (o que hoje edita "Renda extra do SDR"), `packages/db/src/seed.ts`
- Test: `apps/api/test/admin.e2e.test.ts` (ou o arquivo que já testa `sdrBonusCents`), `packages/db/test/migrations.test.ts`

**Interfaces:**
- Produces: `products.mentoria: 'RDV' | '2M' | '6M' | null` (`CHECK in ('RDV','2M','6M')`); no schema Zod de produto,
  `mentoria: z.enum(['RDV','2M','6M']).nullable().optional()`.

- [ ] **Step 1: Teste** `it('produto guarda e devolve "Vira mentorado"')`: liderança cria produto com `mentoria: '2M'`,
  lista e recebe `mentoria === '2M'`; PATCH `mentoria: null` → `null`; `mentoria: 'X'` → 400. SDR não recebe o campo em
  `/finance/products` (já não recebe preço).
- [ ] **Step 2:** rodar `pnpm --filter @npac/api exec vitest run test/admin.e2e.test.ts -t "Vira mentorado"` → FAIL.
- [ ] **Step 3:** coluna + migration. A migration preenche como a 0066: `code`/`name` = `RDV`/"Mentoria RDV" → `RDV`;
  `MENTORIA_2M`/"Mentoria 2M" → `2M`; `MENTORIA_6M`/"Mentoria 6M" → `6M`. Seed igual. `catalog.ts` lê e grava; tela com o
  select "Vira mentorado".
- [ ] **Step 4:** `pnpm --filter @npac/db build && pnpm --filter @npac/db migrate`, rodar o teste → PASS; `pnpm --filter @npac/db test -t migrations` → PASS.
- [ ] **Step 5:** commit `feat(NPAC-56): produto marca qual mentoria vira`.

### Tarefa 1.2: Funções do banco — criar pela venda, estorno e situação do pagamento

**Files:**
- Modify: `packages/db/drizzle/0077_venda_vira_mentorado.sql`, `packages/db/src/schema/mentoria.ts` (`dealId`)
- Test: `packages/db/test/mentoria-venda.test.ts` (novo)

**Interfaces:**
- Produces (SQL, `SECURITY DEFINER`, owner `npac_owner`, `search_path = public, pg_temp`, EXECUTE só para `npac_app`):
  - `mentoria_inscricao_da_venda(p_deal uuid, p_inscricao uuid, p_pessoa uuid, p_nome text, p_nome_norm text,
    p_whatsapp text, p_whatsapp_idx text, p_email text, p_email_idx text, p_instagram text) returns uuid` — recusa
    (`22023`) venda inexistente, estornada, com inscrição já ligada, ou de produto com `mentoria` nulo; cria inscrição
    (`ONBOARDING`, `INDIVIDUAL`, `mentoria` do produto, `deal_id`, `responsavel_id` nulo, `data_compra` = dia de Brasília de
    `closed_at`, `valor_centavos` = `total_cents`, `forma_pagamento` = 'Cartão'|'Pix'|'Boleto'|'Parcial' pelo `method`,
    `criado_por` = `app_user_id()`), pessoa ordem 1 com os valores já cifrados, as 6 etapas `PENDENTE` (mesma lista de
    `ETAPAS` de `sh/mentoria/onboarding.ts`), histórico `inscricao.criada_pela_venda` sem campos e uma linha em `audit_log`
    (ação `mentoria.inscricao_da_venda`, entidade = inscrição; mesmas colunas que `api/leads/activity.ts` grava, sem nome nem e-mail).
  - Gatilho `AFTER UPDATE OF reversed_at ON deals` (quando passa de nulo a valor): a inscrição com aquele `deal_id` e status
    ≠ `CANCELADO` vai para `CANCELADO` (`version + 1`), histórico `inscricao.cancelada_pelo_estorno` e `audit_log`
    (ação `mentoria.cancelada_pelo_estorno`).
  - `mentoria_status_financeiro(p_inscricao uuid) returns text` — sem `deal_id`: a coluna `status_financeiro`; com:
    `QUITADO` se todas as parcelas pagas, `EM_ATRASO` se alguma sem `paid_at` com `due_at < now()`, senão `EM_DIA`.
    Só devolve para quem vê a inscrição (`mentoria_ve`), senão nulo.
  - `mentoria_inscricoes.deal_id uuid references deals(id)`, índice único parcial `where deal_id is not null`.
  - Gatilho/guarda: UPDATE de `status_financeiro` em inscrição com `deal_id` recusado (`22023`, "A situação do pagamento
    vem das parcelas do comercial").

- [ ] **Step 1: Testes** em `mentoria-venda.test.ts`, com fixtures de owner (lead, produto `mentoria='RDV'`, deal):
  - `it('cria inscrição, pessoa e 6 etapas a partir da venda')` → status `ONBOARDING`, `deal_id` certo, `responsavel_id` nulo, 6 etapas.
  - `it('recusa venda estornada, já ligada e produto sem mentoria')` → três `rejects.toThrow`.
  - `it('estorno cancela a inscrição e mantém reuniões e ações')` → status `CANCELADO`, contagem de reuniões igual antes e depois.
  - `it('situação do pagamento segue as parcelas')` → à vista `QUITADO`; parcela futura `EM_DIA`; parcela com `due_at` no passado sem `paid_at` `EM_ATRASO`; inscrição sem venda devolve a coluna.
  - `it('closer executa a função mas não lê a inscrição')` → `withUser(closer)` select em `mentoria_inscricoes` = 0 linhas.
  - `it('recusa editar situação do pagamento de inscrição com venda')`.
  - `it('grava auditoria da criação e do cancelamento sem nome nem e-mail')` → 2 linhas em `audit_log`, nenhuma coluna contém o nome do lead.
- [ ] **Step 2:** `pnpm --filter @npac/db test -t "mentoria-venda"` → FAIL.
- [ ] **Step 3:** escrever as funções e o gatilho na 0077; `dealId` no schema.
- [ ] **Step 4:** migrar e rodar → PASS; `pnpm --filter @npac/db test` inteiro (inclui `rls-por-consulta`) → PASS.
- [ ] **Step 5:** commit `feat(NPAC-56): banco cria a inscricao pela venda e cancela no estorno`.

### Tarefa 1.3: API — `insertSale` cria a inscrição

**Files:**
- Create: `apps/api/src/mentoria/venda/inscricao-da-venda.ts`
- Modify: `apps/api/src/finance/finance.service.ts` (`insertSale`, `FinanceService`, `reverse`), `apps/api/src/leads/leads.service.ts`
  (chamada de `insertSale`), `apps/api/src/finance/finance.module.ts`, `apps/api/src/leads/leads.module.ts`,
  `apps/api/src/mentoria/mentoria.module.ts` (exportar o serviço)
- Test: `apps/api/test/mentoria-v2-venda.e2e.test.ts` (novo)

**Interfaces:**
- Consumes: `mentoria_inscricao_da_venda(...)` (1.2); `FieldCrypto.decrypt` (lead); `MentoriaCrypto`, `aad`,
  `normalizePhoneBR`, `nomeNormalizado` (já existem).
- Produces:
  - `@Injectable() class InscricaoDaVenda { criar(tx: Tx, dealId: string, leadId: string): Promise<string | null> }` —
    `null` quando o produto da venda não tem `mentoria`; lê `leads.name`, `phone_enc`, `email_enc`, `instagram` na `tx`;
    gera os ids, cifra (`aad('mentoria_pessoas','whatsapp'|'email', pessoaId)`), chama a função. Qualquer erro vira
    `ConflictException(<texto da Global Constraints>)`.
  - `insertSale(tx, u, lead, input, hash, closedAt?, inscricao?: InscricaoDaVenda)` — último parâmetro novo; quando
    presente, chama `inscricao.criar(tx, d.id, lead.id)` depois das parcelas e devolve `{ id, stageId, inscricaoId }`.
    `FinanceService.register` e o cadastro em Venda Fechada (`leads.service.ts`) passam o serviço.
  - Depois do commit, quem chamou faz `void avisosScheduler.rearm()` (`AvisosScheduler`, o mesmo que o interceptor
    `AvisosRearme` do módulo chama) quando `inscricaoId` veio; `reverse` também rearma.

- [ ] **Step 1: Testes** em `mentoria-v2-venda.e2e.test.ts`:
  - `it('venda de RDV pelo closer cria a inscrição com o contato do lead')` → `duda` lê a ficha: nome, WhatsApp e e-mail do lead, mentoria `RDV`, valor = total, `Veio da venda` (campo `dealId` no DTO).
  - `it('venda de produto sem mentoria não cria inscrição')`.
  - `it('mesmo requestKey duas vezes cria uma inscrição só')`.
  - `it('falha na criação desfaz a venda')` → `vi.spyOn(InscricaoDaVenda.prototype,'criar').mockRejectedValue(...)`: resposta 409 com o texto literal e `deals` sem linha para o lead.
  - `it('cadastro em Venda Fechada com a venda registrada cria a inscrição')`.
  - `it('estorno deixa a inscrição Cancelada')`.
  - `it('closer recebe 404 na ficha que a venda criou')`.
  - `it('nenhum log com o telefone do lead')` → espião no logger, nenhuma chamada contém os dígitos.
- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-venda.e2e.test.ts` → FAIL.
- [ ] **Step 3:** implementar o serviço, o parâmetro de `insertSale` e as injeções; `dealId` no DTO da ficha
  (`sh/mentoria/dto.ts`, `ficha.service.ts`); situação do pagamento lida por `mentoria_status_financeiro(i.id)` na ficha e
  em Mentorados; PATCH de `statusFinanceiro` com venda → 400 (vem do `22023`).
- [ ] **Step 4:** rodar o arquivo → PASS; `pnpm --filter @npac/api exec vitest run test/finance.e2e.test.ts test/reports.e2e.test.ts` → PASS (nada mudou no comercial).
- [ ] **Step 5:** commit `feat(NPAC-56): venda registrada cria o mentorado`.

### Tarefa 1.4: Fila — "Nova inscrição" e "Venda estornada"

**Files:**
- Modify: `packages/shared/src/mentoria/fila.ts`, `packages/db/drizzle/0077_venda_vira_mentorado.sql` (redefine
  `mentoria_fila(agora)` a partir da versão da 0075), `apps/api/src/mentoria/fila.service.ts`,
  `apps/web/components/acompanhamento/fila.tsx`
- Test: `packages/shared/test/mentoria-fila.test.ts` (ou o teste existente de `itemEhMeu`), `packages/db/test/fila-equivalencia.test.ts`,
  `apps/api/test/mentoria-v2-venda.e2e.test.ts`

**Interfaces:**
- Produces: `FILA_TIPOS` + `'NOVA_INSCRICAO'`, `'VENDA_ESTORNADA'`; rótulos "Nova inscrição" e "Venda estornada"; grupo
  `ONBOARDING` recebe `NOVA_INSCRICAO`, grupo `COBRANCA` não muda; `VENDA_ESTORNADA` em `FILA_FEITO_MANUAL`.
  `const SO_ADMIN: readonly FilaTipo[] = ['NOVA_INSCRICAO']` — em `itemEhMeu`, esses itens são meus só com `eu.admin`.
  - `NOVA_INSCRICAO`: inscrição com `deal_id`, `responsavel_id` nulo, status ≠ `CANCELADO`; `responsavelPerfil 'ACOMPANHAMENTO'`,
    `responsavelId` nulo, chave `nova-inscricao:<inscricao>`, vence na criação. Sai sozinho ao ganhar responsável.
  - `VENDA_ESTORNADA`: inscrição `CANCELADO` com histórico `inscricao.cancelada_pelo_estorno`; pessoa = responsável (ou
    nula → perfil ACOMPANHAMENTO), chave `venda-estornada:<inscricao>`; sai com "Visto" (`mentoria_fila_feitos`).
  - Push: os dois entram no aviso do `avisos.scheduler.ts` como os demais itens (payload sem nome, `AVISO_PAYLOAD`).
  - Painel do item `NOVA_INSCRICAO`: seletor de responsável (mesma lista e regra de `GET mentoria/responsaveis`) que faz o
    PATCH da inscrição; texto "Já tem inscrição: <mentoria>, <status>" quando outra inscrição tem o mesmo `whatsapp_idx`
    ou `email_idx` (M3; a API calcula, a tela só mostra).
- [ ] **Step 1: Testes:** `itemEhMeu` — `NOVA_INSCRICAO` é de `duda` (admin), não de `carla`/perfil Acompanhamento sem
  admin; equivalência da Fila com os dois tipos; e2e da API: depois da venda, `GET mentoria/fila` da `duda` tem
  `NOVA_INSCRICAO`; definir responsável → some; estorno → `VENDA_ESTORNADA` para a responsável; "Visto" → some.
- [ ] **Step 2:** rodar os três → FAIL.
- [ ] **Step 3:** implementar (TS, SQL e tela).
- [ ] **Step 4:** rodar → PASS; `pnpm --filter @npac/shared test` e `pnpm --filter @npac/db test -t fila` → PASS.
- [ ] **Step 5:** commit `feat(NPAC-56): fila mostra nova inscricao e venda estornada`.

### Tarefa 1.5: Ficha, e2e, docs e fechamento da Parte 1

**Files:**
- Modify: `apps/web/components/acompanhamento/ficha.tsx` (selo "Veio da venda de DD/MM"; situação do pagamento só leitura
  com `dealId`), `CLAUDE.md`, este plano (status)
- Test: `apps/web/e2e/acompanhamento-venda.spec.ts` (novo)

- [ ] **Step 1: e2e** `test('venda do closer vira nova inscrição na fila da duda')`: login `sonia` → ficha de um lead em
  Agendou Pagamento → registrar venda do produto RDV → login `duda` → Fila mostra "Nova inscrição" com o nome → escolher
  responsável → item some → ficha mostra "Veio da venda de" e a situação do pagamento sem campo de edição.
- [ ] **Step 2:** `pnpm --filter @npac/web e2e e2e/acompanhamento-venda.spec.ts` → FAIL; implementar a ficha → PASS.
- [ ] **Step 3:** `CLAUDE.md`: tirar qualquer menção a "CRM intocado", registrar venda → inscrição (G2–G6, M1–M3, M7–M8),
  migration 0077, novos tipos da Fila; status da Parte 1 aqui.
- [ ] **Step 4:** `pnpm lint && pnpm typecheck`, `pnpm --filter @npac/api test`, `pnpm --filter @npac/db test`,
  `pnpm --filter @npac/shared test` → tudo verde (saída longa em arquivo, só as falhas no contexto).
- [ ] **Step 5:** commit, push, PR para a release aberta; esperar CI completo (verify e e2e) antes do squash-merge; testar no
  ITODEV com `sonia` e `duda` e mostrar o resultado ao Gabriel. Produção só com o sim dele.

---

## Parte 2 — Cargo Envios e aba Envios físicos

Antes da Tarefa 2.4: protótipo da aba (375 e 1440, claro e escuro) aprovado pelo Gabriel.

### Tarefa 2.1: Perfil e cargo `ENVIOS`

**Files:**
- Create: `packages/db/drizzle/0078_envios_fisicos.sql` (+ snapshot, journal)
- Modify: `packages/shared/src/mentoria/enums.ts` (`PERFIS`), `packages/shared/src/cargos.ts` (`CARGOS`, `CARGO_INFO`),
  `packages/db/src/schema/areas.ts` (CHECK `area_membros_acompanhamento`), funções que listam os cargos do Acompanhamento
  na 0072 (`area_definir_membro` e a tradução de `user.role`), `apps/web/components/cargo-field.tsx` (se a lista não vier de
  `CARGOS_POR_AREA`), `packages/db/src/seed.ts` (conta `maria`, cargo Envios, `@npac.com.br`, senha do dev)
- Test: `packages/db/test/areas-regra.test.ts`, `packages/shared/test/cargos.test.ts`, `apps/api/test/admin.e2e.test.ts`

**Interfaces:**
- Produces: `Perfil` inclui `'ENVIOS'`; `CARGO_INFO.ENVIOS = { label: 'Envios', area: 'ACOMPANHAMENTO', perfil: 'ENVIOS', … }`
  com dica "Envia caixas, presentes, kits e certificados."; `mentoria_ve_todas()` e as demais funções de leitura **não**
  mudam (Envios não vê nada pela RLS, como o Mentor).
- [ ] **Step 1: Testes:** Head do Acompanhamento (`duda`) convida com cargo Envios → 201; Head comercial → 404/403 como os
  outros cargos do módulo; `area_membros` aceita `cargo='ENVIOS'`; `maria` em `withUser` lê 0 inscrições.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** rodar → PASS (inclui `areas-equivalencia`).
- [ ] **Step 5:** commit `feat(NPAC-56): cargo envios no acompanhamento`.

### Tarefa 2.2: Funções e API dos envios

**Files:**
- Modify: `packages/db/drizzle/0078_envios_fisicos.sql`
- Create: `apps/api/src/mentoria/envios.controller.ts`, `apps/api/src/mentoria/envios.service.ts`
- Modify: `apps/api/src/mentoria/onboarding.service.ts` (a escrita da Caixa passa a usar `EnviosService.marcar`),
  `apps/api/src/mentoria/mentoria.module.ts`, `apps/api/src/mentoria/perfil.guard.ts` (Envios só nas rotas marcadas)
- Test: `packages/db/test/mentoria-envios.test.ts`, `apps/api/test/mentoria-v2-envios.e2e.test.ts`

**Interfaces:**
- Produces (SQL, `SECURITY DEFINER`):
  - `mentoria_envios_a_enviar(p_agora timestamptz) returns table(envio_id uuid, inscricao_id uuid, tipo text,
    status text, nome1 text, nome2 text, endereco text, cep text, foto_midia_id uuid, enviado_em date, rastreio text,
    version int)` — para Admin, Acompanhamento, Operação e Envios; inscrições `ONBOARDING`/`ATIVO`/`PAUSADO`. "A enviar":
    Caixa com `formulario_preenchido_em` e sem envio `ENVIADO`/`ENTREGUE` (cria a linha `PREPARANDO` se não existir);
    presente com `foto_familia_midia_id` (M5); kit e certificado em `PREPARANDO`. "Em trânsito": `ENVIADO`. `foto_midia_id`
    só em presente. `endereco` sai cifrado (a API decifra com `aad('mentoria_enderecos','endereco', inscricaoId)`).
  - `mentoria_envio_marcar(p_envio uuid, p_version int, p_status text, p_data date, p_rastreio text) returns int` (nova
    versão; `P0409` em conflito) — mesmas regras de CHECK da tabela; Envios só em inscrição das situações acima.
  - Leitura da mídia: a foto do presente fica liberada para Envios só enquanto o envio do presente não é `ENTREGUE`
    (ajustar a política/a função de `mentoria_midia_leitura` — a única exceção do teste `rls-por-consulta`).
- Produces (API, guarda do `MentoriaController`):
  - `GET mentoria/envios` `@Perfis('ACOMPANHAMENTO','OPERACAO','ENVIOS')` → `{ aEnviar: EnvioDTO[]; emTransito: EnvioDTO[]; entregues: EnvioDTO[] }`
    (entregues dos últimos 30 dias; para Envios, `entregues` vazio além dos 30 dias também).
  - `POST mentoria/envios` `@Perfis('ACOMPANHAMENTO','OPERACAO')` `{ inscricaoId, tipo: 'KIT'|'CERTIFICADO' }`.
  - `PATCH mentoria/envios/:id` `@Perfis('ACOMPANHAMENTO','OPERACAO','ENVIOS')` `{ version, status: 'ENVIADO'|'ENTREGUE', data, rastreio? }`.
  - `EnviosService.marcar(tx, envioId, body)`: única escrita de envio; Caixa `ENTREGUE` conclui a etapa CAIXA do
    onboarding como hoje.
  - `EnvioDTO = { id, inscricaoId, tipo, status, nomes: string[], endereco: string | null, cep: string | null,
    fotoMidiaId: string | null, enviadoEm: string | null, rastreio: string | null, version: number }` em `sh/mentoria/dto.ts`.
- [ ] **Step 1: Testes:** banco — Envios lista só os três tipos de pendência e nada de inscrição cancelada; Caixa entra com
  o formulário marcado (G8); presente só com foto. API — `maria`: `GET mentoria/envios` 200 sem campos de contato/valor
  (`expect(Object.keys(dto)).toEqual([...])`); `GET mentoria/inscricoes`, `/fila`, `/ficha/:id`, `/reunioes` → 404;
  Caixa marcada entregue pela aba conclui a etapa CAIXA; kit criado pela `duda` aparece para a `maria`; `PATCH` com
  versão velha → 409.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** rodar → PASS; `test/mentoria-v2-onboarding.e2e.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(NPAC-56): api dos envios fisicos`.

### Tarefa 2.3: Fila e push dos envios (M4, M6)

**Files:**
- Modify: `packages/db/drizzle/0078_envios_fisicos.sql` (`mentoria_fila`: `ENVIAR_CAIXA` vai a `ENVIOS` quando houver
  alguém ativo com esse cargo, senão `OPERACAO`), `packages/shared/src/mentoria/fila.ts` (`responsavelPerfil` aceita
  `'ENVIOS'`), `apps/api/src/mentoria/avisos.scheduler.ts`
- Test: `packages/db/test/fila-equivalencia.test.ts`, `apps/api/test/mentoria-v2-avisos.e2e.test.ts`

**Interfaces:**
- Produces: push diário às 8h de Brasília para cada pessoa ativa do cargo Envios quando `mentoria_envios_a_enviar` tem
  "A enviar", payload `{ title: 'Tem envio para hoje', … }` sem nome; um por pessoa por dia (mesma tabela de enviados do módulo).
- [ ] **Step 1: Testes:** com `maria` ativa, `ENVIAR_CAIXA` tem `responsavelPerfil 'ENVIOS'`; sem ela, `'OPERACAO'`;
  `REMINDER`/`MENTORIA_CLOCK` às 8h → um push para a `maria` com o texto literal; segundo disparo no mesmo dia → nenhum.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** commit `feat(NPAC-56): fila e push dos envios`.

### Tarefa 2.4: Aba Envios físicos (web)

**Files:**
- Create: `apps/web/app/(app)/acompanhamento/envios/page.tsx`, `apps/web/components/acompanhamento/envios.tsx`
- Modify: `apps/web/app/(app)/acompanhamento/em-breve/[aba]/page.tsx` (tirar `envios` de `ABAS`; `envios` → redirect),
  `apps/web/components/shell/nav-menu.tsx` (item "Envios físicos" sai do "Em breve"; cargo Envios vê só ele),
  `apps/web/app/(app)/layout.tsx` (perfil `ENVIOS` não cai em `SemAcesso`), `apps/web/app/page.tsx` (destino do cargo
  Envios = `/acompanhamento/envios`), `apps/web/app/(app)/acompanhamento/modulo.css`
- Test: `apps/web/e2e/acompanhamento-envios.spec.ts` (novo)

- [ ] **Step 1: e2e** `test('maria envia e entrega a caixa')`: login `maria` → cai em "Envios físicos" → menu só com ela
  (e Mais com o cartão da conta) → card da Caixa com nome e endereço → "Marcar enviado" com rastreio → vai para "Em
  trânsito" → "Marcar entregue" → login `duda` → ficha mostra a etapa Caixa concluída. `test('maria não abre a ficha')`:
  `goto('/acompanhamento/ficha/<id>')` → 404. `test('duda cria um kit')`: "Novo envio" → kit aparece em "A enviar".
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar pelo protótipo aprovado (cards, "A enviar" no topo, filtro por
  tipo, `useOptimistic` + `showToast()`). **Step 4:** rodar → PASS; capturas 375/768/1024/1440, claro e escuro, comparadas
  ao protótipo.
- [ ] **Step 5:** commit `feat(NPAC-56): aba envios fisicos`.

### Tarefa 2.5: Docs e fechamento da Parte 2

- [ ] **Step 1:** `CLAUDE.md` (cargo Envios, perfil sem leitura pela RLS, funções de envio, push das 8h, seed `maria`,
  migration 0078); status da Parte 2 aqui.
- [ ] **Step 2:** `pnpm lint && pnpm typecheck` e as suítes da API, do banco, do shared e o e2e do módulo → verde.
- [ ] **Step 3:** commit, push, PR para a release aberta, CI completo antes do squash-merge; ITODEV com `maria` (criar a
  conta lá pelo convite da `duda`) e `duda`, varredura por cargo (`apps/web/scripts/varredura-por-cargo.mjs maria`).
  Mandar ao Gabriel o link, o login e o que clicar. Produção só com o sim dele.

---

## Brief para a sessão de cada parte

```
Goal: <Parte N do plano docs/plans/acompanhamento-gestao-bloco-1.md> pronta e mesclada na release aberta.
Where: npac-corporation, branch feat/NPAC-56-<nome> a partir da release/vX.Y aberta; spec
  docs/superpowers/specs/2026-11-19-acompanhamento-gestao-bloco-1-design.md; plano acima, Parte N.
Decided: G1–G10 e M1–M9 da spec; ligação junto da venda (G9); Maria = cargo Envios sem leitura pela RLS;
  kit e certificado à mão; mentorado fora deste bloco.
Done when: as tarefas da Parte N com os testes verdes, CI completo verde, PR mesclado, ITODEV conferido
  com as contas do roteiro e o status atualizado neste plano.
Limits: push/PR/merge pelas regras do Gabriel (merge só com CI completo), prod só com o sim dele;
  sem outras sessões; relatório final em até 5 linhas.
```
