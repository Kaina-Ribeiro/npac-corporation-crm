# Plano: 13 pedidos do Igor (10/11/2026)

Status: ⏳ pendente · 🔨 em andamento · ✅ feito. Uma sessão nova por bloco.
Respostas do Igor: **1A, 2A, 3A, 4C+D, 5 (criar só acima de 5 mil), 6A (dono = Igor)**.
Spec do Forms e do e-mail: `docs/superpowers/specs/2026-11-10-forms-email-design.md`.

## Antes de começar

- ✅ Docker Desktop ligado (Postgres dos testes).
- ✅ `release/v0.11` criada via `cut-release` em 10/11.
- Migrations a partir de `0042`, na ordem das fases. Conferir `idx` e `when` no journal.
- Sem push, PR, merge ou deploy sem o sim do Gabriel.

## Item 7: Descobrindo renda

✅ Já em produção (`v0.10.0-rc`, PR #60). Nada a fazer.

## Fase 1A: correções rápidas

Feito quando: testes focados + `pnpm lint && pnpm typecheck` passam.

- ✅ **Item 2, `sw.js`.** Copiar `apps/web/public` para `./apps/web/public` em
  `deploy/cubeship/web.Dockerfile`. Causa confirmada: `/sw.js` e `/icon.svg` dão 307 em produção.
  Conferir o `Dockerfile` da raiz. Validar depois do deploy: `/sw.js` responde 200 com JavaScript.
- ✅ **Item 10, busca do Chat.** RED: buscar "#Lead do" não acha. Tirar `#` inicial em `chat.tsx`,
  descartar resposta fora de ordem, mostrar "Nenhum lead encontrado" e o erro real.
- ✅ **Item 3, Meses → M.** Migration renomeia produtos ("Mentoria 2 Meses" → "Mentoria 2M"); ajustar
  `seed-products.ts` e `mock-prototype.ts`. Relatório por produto agrupa por `product_id` com o nome
  atual (`reports.service.ts`), porque `deals.product_name` é imutável.
- ✅ **Item 9, ficha.** Mover "Editar dados do lead" para antes de "Mover para" em `lead-detail.tsx`.
- ✅ **Item 12, Novo lead no Hoje.** Botão com a regra do Pipeline; closer não vê.

## Fase 1B: preferências e selo

Feito quando: e2e focados passam e há capturas em 375 / 768 / 1024 / 1440 px.

- ✅ **Item 8, colunas do Pipeline.** Cookie por pessoa em `Path=/pipeline`, só chaves de etapa,
  lido no servidor (padrão de `lib/dashboard-layout.ts`). Coluna nova aparece.
- ✅ **Item 11, filtro do Hoje.** Cookie por pessoa em `Path=/hoje`, só IDs. `hoje/page.tsx` aplica na
  busca inicial; `<select>` abrem com o valor salvo; ID que não existe mais é ignorado.
- ✅ **Item 1, selo do closer.** `today.service.ts` devolve o closer da reunião. Selo com a inicial
  e nome no `title`/`aria-label`, dourado se for da própria pessoa. Só para liderança com `canClose`.

## Fase 2: Atrasados (itens 5 e 6, resposta 1A)

Feito quando: testes da API e e2e do Hoje passam; capturas nos 4 tamanhos.

- ⏳ API: `/today/search` devolve também reuniões vencidas sem resultado e não canceladas (qualquer
  data) e tarefas vencidas, respeitando a RLS e os filtros, limite 100 cada.
- ⏳ Tela: lista única em Atrasados, por horário, com etiqueta Contato, Reunião ou Tarefa.
- ⏳ Ações: reunião com Realizada, No-show e Remarcar; tarefa com Concluir; contato como hoje.
- ⏳ Sem duplicar tarefa: a vencida sai do painel Tarefas. Reunião de hoje vencida fica também na agenda.
- ⏳ Relógio do navegador (`moveDue`) passa reunião e tarefa para Atrasados sem chamar a API.

## Fase 3: pagamento do SDR (item 13, respostas 2A e 3A)

Risco: permissões e dados. Revisor independente ao fechar. Feito quando: suítes de API e banco passam.

- ⏳ Banco: `payment_entry_paid` (boolean); `leads_payment_check` passa a aceitar produto sem valor;
  `closer_has_lead` inclui `leads.closer_id` só na etapa Agendou Pagamento; gatilho do closer deixa
  completar valor, entrada e data sem trocar a etapa; tipo `payment.pending` na timeline e nos avisos.
- ⏳ API (`stage-fields.ts`): SDR informa só produto, closer e "já pagou entrada"; valor ou data do
  SDR são recusados. Closer e liderança continuam com todos os campos.
- ⏳ Corte no servidor: SDR não recebe valor, entrada nem preço de produto.
- ⏳ Tela (`stage-fields.tsx`, cadastro, ficha, Pipeline e janelinha): SDR vê caixa, produto sem R$ e
  closer pré-preenchido pelo produto. Selo "Pagamento a completar" e formulário do closer na ficha.
- ⏳ Registro da venda parte do que foi informado; sair da etapa apaga tudo, inclusive o novo campo.

## Fase 4A: e-mail do lead

Risco: dados pessoais. Feito quando: testes de banco, API e e2e da spec (Parte A) passam.

- ⏳ Migration, schema, Zod, cifra, duplicidade, timeline, LGPD, CSV e busca.
- ⏳ Campo no cadastro e na ficha.

## Fase 4B: Forms

Risco: rota pública e dados pessoais. Revisor independente ao fechar. Feito quando: testes da spec
(Parte B) passam e uma resposta real aparece no sino.

- ⏳ Migration, tabela, RLS, `form_find_lead`, tipo novo e gatilho de avisos.
- ⏳ Rota `/webhooks/forms` com token, idempotência e regra dos 5 mil.
- ⏳ Sino, bloco "Formulários novos", card na ficha e push.
- ⏳ Apps Script (precisa do link do Forms) e checklist de configuração.

## Ao fechar cada fase

Atualizar este arquivo e o `CLAUDE.md` do projeto quando mudar regra ou arquitetura.
