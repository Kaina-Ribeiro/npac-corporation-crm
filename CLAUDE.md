# NPAC CRM — guia para o Claude

CRM comercial da NPAC (SDRs, closers, liderança). Leia antes de explorar e abra só o que o mapa
indicar. Mantenha denso; ao mudar arquitetura, regra ou comando, atualize aqui.

## Como trabalhar

- **Pergunta não é pedido** ("o que acha?", "dá pra…?", "faz sentido…?"): opinar, dar opções e
  recomendação, esperar o "faz". Sem editar nem rodar nada.
- Português, respostas curtas, execução direta quando o pedido é explícito. Commits frequentes; push só se pedirem.
- Branch, PR, tag e release seguem `RELEASING.md` (release-kit): branch `tipo/NPAC-N-nome` a partir da
  `release/vX.Y` aberta, PR `tipo(NPAC-N): resumo` em minúsculas, squash. Tags só pela automação.
- Sem subagentes sem pedido. Plano novo grande: apresentar antes de implementar.
- Régua: CRMs robustos (Linear, Attio).
- Bug: teste que falha (RED) → correção → teste focado → suíte ao fechar.
- Segredos (senhas, chaves, `.env`): pode gerar e definir pelas ferramentas (Cubeship, shell) quando o
  pedido envolver infra; não os repita em mensagens sem necessidade. Dados reais de clientes nunca
  em ferramentas, logs ou mensagens.

## Mapa

pnpm 12 + Turborepo, Node ≥22, Postgres 16 no Docker. Prefixos: `api/` = `apps/api/src`,
`web/` = `apps/web`, `db/` = `packages/db`, `sh/` = `packages/shared/src`.

- **Shared:** papéis/`isLeader`/enums `sh/enums.ts` · cargos e resolvedor `sh/cargos.ts` · `can` `sh/permissions.ts` · Zod de lead
  `sh/schemas/lead.ts`, `lead-update.ts` · usuário/pedido de acesso `sh/schemas/account.ts` ·
  DTOs `sh/dto.ts`, `finance.ts`, `today.ts` · dinheiro/datas BR `sh/money.ts`, `dates.ts`
  · filtros lembrados `sh/screen-prefs.ts` (`@npac/shared/screen-prefs`)
- **Banco:** schema `db/src/schema/*.ts` · migrations `db/drizzle/00NN_*.sql` + `meta/` ·
  `withUser`, `leadContactTaken` `db/src/with-user.ts` · seed `db/src/seed*.ts`
- **Auth:** Better Auth (username, TOTP, auditoria, rate limit) `api/auth/auth.ts` · sessão e
  troca obrigatória `api/auth/session.guard.ts` · `@Can`/`@Public`/`@AllowIncomplete`
  `api/auth/*.decorator.ts` · pedido de acesso público `api/auth/request-access.ts` · env Zod `api/config/env.ts`
- **Leads:** rotas/leitura/escrita `api/leads/leads.controller.ts`, `leads.service.ts`,
  `lead-mutations.service.ts` · filtros/SQL `leads.repository.ts` · timeline+audit
  `activity.ts` (`recordActivity`) · notas/tarefas `lead-activity.*`
- **Resto da API:** reuniões `api/meetings/*` (`cancel.ts` = SQL restrito) · vendas/parcelas/estorno
  `api/finance/finance.service.ts` · relatórios/dashboard/CSV/feed `api/finance/reports.service.ts` ·
  Hoje `api/today/*` · avisos/filtros salvos `api/notifications/notifications.ts`, `views.ts` ·
  chat/handoff/equipe/playbook `api/collab/*` · admin `api/admin/users.ts`, `catalog.ts`, `lgpd.ts`,
  `access-requests.ts` · SSE `api/events/events.controller.ts` + contador `revision.service.ts` · import Firebase `api/import/*` ·
  push (Web Push) e despertador dos lembretes `api/push/*` ·
  mock do protótipo `api/dev/mock-prototype.ts`
- **Web:** layout/sidebar/bottom nav `web/app/(app)/layout.tsx`, `web/components/shell/*` (menu da
  sidebar e do Ctrl+K, grupos e sub-itens do Acompanhamento: `shell/nav-menu.tsx`, só servidor, para
  não pesar no JS; `nav-items.tsx` também fica no servidor, a barra inferior é componente de servidor) · classes de botão `lib/button.ts` · dropdown (todos os `<select>`) com o visual do CRM só por CSS
  (`appearance: base-select` + `::picker(select)` no fim de `globals.css`; Safari fica com o do
  sistema; Lightning CSS não aceita pseudo-classe depois de `::picker`, use `select:open::picker(select)`) · login,
  pedir acesso `web/components/login/*` · senha/MFA `components/conta/*`, `app/(conta)/*` · API
  server/client `web/lib/api.ts` / `lib/client-api.ts` · filtros lembrados `lib/screen-prefs.ts`,
  `lib/use-latest-prefs.ts`, memória da busca `lib/screen-memory.ts` · sessão (`getSession`, `pendingStep`)
  `web/lib/session.ts` · UI base (`Field`, `button`, `StageOptions`) `components/crm-ui.tsx` ·
  cargo (`ROLE_LABEL`, `RoleTag`, `CargoTag`) `components/role-tag.tsx` · campo Cargo (select agrupado,
  dica, caixas/selo) `components/cargo-field.tsx` · tokens/`.tier-*`/`.role-*` `web/app/globals.css`
- **Telas:** leads `components/leads-browser.tsx`, `lead-filters.tsx` · ficha/venda `lead-detail.tsx`,
  `sale-flow.tsx`, `finance-panel.tsx` · `pipeline.tsx`, `today.tsx`, `reports.tsx`, `dashboard-*.tsx`
  (cards reordenáveis: `dashboard-board.tsx`, `lib/dashboard-layout.ts`, `lib/board-motion.ts`) ·
  admin `admin.tsx`, `access-requests.tsx` · Ctrl+K `shell/command-palette.tsx` · avisos `inbox.tsx` ·
  textos de atividade `lib/activity-text.ts` · campos por etapa `stage-fields.tsx` (+ `lib/stage-fields.ts`,
  `lib/stage-kind.ts`) e janelinha `stage-move-dialog.tsx` (Pipeline, lista, massa) · editor de colunas `pipeline-columns-editor.tsx` · ação
  rápida do Hoje `today-quick-action.tsx` · closer completa o pagamento `payment-complete.tsx` · menu de CSV `csv-export.tsx` (API: `api/common/csv.ts`) ·
  avisos compartilhados (selo do chat, `(N)` na aba, lembretes) `lib/alerts.ts`, `meeting-reminder.tsx` ·
  push no aparelho `lib/push.ts`, `public/sw.js`, `/conta/avisos`
- **Acompanhamento (mentorados), v2 em 5 partes** (plano `docs/superpowers/plans/2026-11-10-acompanhamento-v2-fase-1.md`, protótipo `docs/acompanhamento/prototipo/canvas/`):
  API `api/mentoria/*` (guarda 404 + MFA: `MentoriaController` em `mentoria.guard.ts`; perfil `perfil.guard.ts`,
  `perfis.*`; inscrição e ficha `inscricoes.*`, `ficha.service.ts`, `historico.ts`; mídia `midia.controller.ts`,
  `media-store.ts`, `media-sniff.ts`, `media-worker.ts`; cifra `mentoria-crypto.ts`; onboarding e Caixa `onboarding.*`
  (regras puras `sh/mentoria/onboarding.ts`; CAIXA e IDR são derivadas, gatilhos da 0048); importação `importacao/*`, junção das
  fontes `sh/mentoria/importacao.ts`, planilha lida por título em `ler-planilha.ts`, CPF descartado ali; `importacao_chave` impede
  reimportar quem foi renomeado); reuniões e contatos `reunioes.*`, `contatos.controller.ts` (0052: estados e
  remarcar/excluir no banco; IDR realizada → `data_idr`/início de Brasília + ATIVO + ações em `iniciarPelaIdr`;
  reunião realizada conclui a ação do mesmo `reuniao_tipo`; Especialista vê só inscrições/reuniões que conduz,
  nunca IDR); Fila do dia `fila.*` (0053: `mentoria_fila(agora)` calcula na leitura, SECURITY INVOKER;
  quem vê cada item `sh/mentoria/fila.ts` `itemVisivel`; `mentoria_fila_feitos` conclui o que não tem estado;
  relógio `MENTORIA_CLOCK` em `relogio.ts`); mensagens-modelo `mensagens.controller.ts` + `sh/mentoria/mensagens.ts`
  (0054; `{nome}`/`{nomes}`, WhatsApp copia e abre `wa.me/<número>` sem texto); push da Fila `avisos.scheduler.ts`
  (0055: um timer, `mentoria_aviso_proximo`/`_reclamar`, `mentoria_avisos_enviados`; `AvisosRearme` no
  `MentoriaController` rearma depois de toda escrita do módulo); CSV `exportacao.controller.ts`; excluir,
  anonimizar e transferir carteira `carteira.controller.ts` (0056); **Fase 2** (cobrança, plano
  `docs/superpowers/plans/2026-11-11-acompanhamento-v2-fase-2.md`, spec `docs/superpowers/specs/2026-11-11-acompanhamento-v2-fase-2-design.md`),
  Parte 1 (0057): catálogo `mentoria_pmes` em Configurações > PMEs (`pmes.controller.ts`, só Admin; a migration traz o 1º e o 2º do PDF),
  ciclos e tarefas do ciclo `ciclos.*` + `sh/mentoria/pmes.ts`, card "PME atual" na Jornada (`components/acompanhamento/pme-atual.tsx`);
  Parte 2 (0058): metas `metas.*` + `sh/mentoria/metas.ts`, tarefas da reunião (`POST reunioes/:id/tarefas`, `DELETE tarefas/:id` em
  `ciclos.*`), cobrança e blocos do registro (`components/acompanhamento/tarefas-reuniao.tsx`, `metas.tsx`), % do PME em SQL
  (`mentoria_pct_tarefas`; barra por meta); 0059 tira a segunda chance do status do ciclo
  · banco `db/src/schema/mentoria.ts`
  - 0044–0045 (`mentoria_perfil()`, `mentoria_admin()`, `mentoria_ve()`, `mentoria_edita()`, funções `mentoria_*`) ·
    seed `db/src/seed-mentoria.ts` · lógica pura `sh/mentoria/*` (cliente: `@npac/shared/mentoria`, sem zod) ·
    telas `web/app/(app)/acompanhamento/*` (`fila` é a entrada, `mentorados`, `mentorados/nova`, `ficha/[id]`, `configuracoes`, `mais`,
    `reunioes`, `reunioes/[id]`, `reunioes/nova`, `em-breve/[aba]`), `web/components/acompanhamento/*`, CSS só do módulo sob `.ac` em `acompanhamento/modulo.css`,
    fila de salvamento `sh/mentoria/field-queue.ts` + `web/lib/acompanhamento-saver.ts`, perfil no servidor
    `web/lib/acompanhamento.ts` (`lerEu`) · backup cifrado `infra/backup/*` (age)
- **Docs:** `docs/spec.md`; deploy `docs/deploy.md` (Oracle), `docs/deploy-cubeship.md` (o `web` do
  ITODEV só fala com a API dele pela build arg `API_INTERNAL_URL`; sem ela cai na API de produção:
  conferir com o `curl` da seção 4 antes de testar); planos `docs/superpowers/plans/`; releases `RELEASING.md`

**Navegação e carregamento** (desempenho, Fase 2, 12/11/2026): o menu usa o `prefetch` padrão do Next
(rota dinâmica sem `loading.tsx` não pré-carrega a página); `semPrefetch` (Ficha e itens "Em breve")
vira `prefetch={false}`; link de linha ou card de lista leva `prefetch={false}`. Nunca `prefetch`
completo (renderizava telas inteiras e gravava auditoria em segundo plano) nem `router.refresh()` ao
montar (o clique já traz o dado fresco); `router.refresh()` só depois de ação. **Sem `loading.tsx`**:
com ele a carga direta começa a ser enviada antes da página, e `notFound()` sai 200 e `redirect()` vira
redirecionamento no navegador (quebra o 404 de quem não vê). O esqueleto (`components/shell/page-skeleton.tsx`)
vem escondido na casca (`main` e `.ac`) e o `NavProgress` marca `data-nav-pending` no `<html>` no clique
de link para outra tela (CSS `.nav-skeleton` em `globals.css`); sai quando a URL muda. Erro de tela:
`app/(app)/error.tsx`, "Não foi possível carregar." + "Tentar de novo" (`retry()`, que rebusca;
`reset()` não). `BottomNav` é componente de servidor (ícones fora do JS). Prova: `e2e/navegacao-leve.spec.ts`.

**Canal ao vivo** (desempenho, Fase 3, D2, 12/11/2026): contador global `app_revision` (0062, uma linha). Gatilho
adiado para o commit (`CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED`, por linha, soma 1 por transação; UPDATE que
não muda nada não soma) em `leads`, `lead_tasks`, `lead_timeline`, `chat_*` e `notifications`. `RevisionService` lê `n`
com um temporizador de 2 s por processo (não por aba) e qualquer escrita vira `invalidate` para todas as abas; a sessão é
conferida ao abrir e a cada 10 s (`heartbeat`). Tabela nova que deva avisar a tela: o mesmo gatilho na migration. Não
grave em tabela vigiada ao recarregar (laço de avisos); se precisar, só quando o valor muda.
**Relatório** (`reports.service.ts`): resposta travada byte a byte por `test/reports-legacy.ts` (cópia congelada) em
`reports.e2e.test.ts`; mexeu na busca, esse teste diz se algum número mudou (mudança de número pedida: altere a
cópia no mesmo PR). `GET /team` usa `peopleOfMonth(tx)` (só por
SDR e por closer). Índices só com plano que os use (`explain` no `npac_e2e_perf`): 0063.

Next 16 tem APIs incompatíveis: em dúvida, `web/node_modules/next/dist/docs/`. Valor exportado de
módulo `'use client'` não é legível em server component: constantes compartilhadas ficam em arquivo
sem `'use client'` (ex.: `lib/last-user.ts`, `role-tag.tsx`).

## Papéis e acesso

- **DIRETOR** ("Diretoria") > **HEAD** > SDR / CLOSER. `isLeader(role)` (`LEADER_ROLES` = DIRETOR+HEAD), nunca `role === 'HEAD'`.
- Só a Diretoria dá/tira liderança e administra contas de Head/Diretoria (`guardLeadership` em
  `admin/users.ts`); Head gerencia SDR/closer. Na RLS, `app_role()` devolve `'HEAD'` para DIRETOR (0021).
- **Cargo em um passo** (11/11/2026, spec `docs/superpowers/specs/2026-11-11-cargos-design.md`): no
  Admin, um campo "Cargo" agrupado (Comercial: SDR, Closer, Head, Diretoria; Acompanhamento:
  Acompanhamento, Operação, Especialista, Mentor). Rótulos, dicas e o mapa cargo ↔ (`role`, perfil) em
  `sh/cargos.ts` (`@npac/shared/cargos`, sem zod); regra pura `resolverCargo`, aplicada por
  `api/admin/cargo.ts` em convite, aprovação de pedido e PATCH (mesmo schema `sh/schemas/account.ts`).
  Cargo do Acompanhamento grava `role = ACOMPANHAMENTO` + perfil (`mentoria_definir_perfil`) na mesma
  transação; sem perfil, 400. Sair do cargo apaga o perfil. "Atua como SDR/Closer" (`can_prospect`/
  `can_close`) só para Head/Diretoria (sem vir, mantêm o que tinham); SDR `t/f`, Closer `f/t`,
  Acompanhamento `f/f`, fixos pelo cargo (caixa contrária: 400) e por `CHECK user_cargo_caixas` (0049).
  `GET /admin/users` traz `perfil`/`moduloAdmin` só para a Diretoria. A aba Perfis do módulo só troca
  perfil (`PUT /mentoria/perfis` recusa `null`); "Peça ao Admin" fica para conta antiga sem perfil
  (selo "falta perfil" no Admin). O selo aparece como "Admin do Acompanhamento".
- Liderança vê tudo; SDR, os próprios leads; CLOSER, leads com reunião não cancelada dele ou
  que o SDR lhe passou em Agendou Pagamento (`leads.closer_id`).
  Invisível e inexistente → **404**, nunca 403. `canProspect`/`canClose` são dados; nada depende de nomes.
- **SDR não recebe R$ de venda** (pedido do cliente, 04/11/2026): `/reports/search`, `/reports/summary`
  e `/team` cortam no servidor (`dropSales`), o lead vem sem valor e entrada (`toDTO`) e
  `/finance/products` sem preço; o Dashboard do SDR mostra comparecimento. Closer igual a
  antes; liderança vê venda + comparecimento, com filtro por SDR. Vendas e pagamentos (ficha,
  cobranças do Hoje, `sale:register`) são do closer e da liderança; o SDR só marca o resultado da reunião.
- Login por **usuário** (`/sign-in/username`, `[a-z0-9_.]{3,30}`, minúsculo); login por e-mail e
  `/is-username-available` desligados. Senha mínima 3 (provisório, decisão de 29/10/2026: no dev
  todas são `123`; as regras voltam no fim).
- **Pedido de acesso** (29/10/2026): `/login/solicitar` grava em `access_requests`, fora de `user`
  (pendente não loga). Head/Diretoria aprovam no Admin escolhendo o cargo (`guardLeadership`);
  recusar apaga; expira em 7 dias; 3/hora por IP; resposta igual exista ou não o usuário (hash
  sempre, para o tempo não revelar). "Esqueci minha senha" manda pedir redefinição à liderança;
  Diretoria trancada: `reset-password-cli.js <usuário> [--mfa]` no shell da api (`db/src/reset-password.ts`).
- **Limite de tentativas de login DESLIGADO** (temporário, 04/11/2026: travava os acessos):
  `customRules[SIGN_IN] = false` em `api/auth/auth.ts`; antes era 5/min por IP. O pedido de
  acesso (3/h) e o TOTP (3/10 s, padrão do plugin) continuam limitados. Religar depois.
- **MFA DESLIGADO** (temporário, 05/11/2026, pedido do Gabriel): `MFA_LIGADO = false` em
  `sh/enums.ts`. Login não pede código (o gancho do `twoFactor` em `api/auth/auth.ts` fica vazio), o
  Acompanhamento não exige, a tela `/conta/mfa` e os links somem; autenticadores cadastrados ficam
  guardados e os testes de MFA ligado são pulados. Religar depois: `true` e rodar as suítes.
- MFA (TOTP) **opcional** (28/10/2026, vale com `MFA_LIGADO`): cada um liga/desliga em `/conta/mfa`; quem ligou confirma o
  login, código enviado sozinho aos 6 dígitos (`lib/otp-input.ts`). Primeiro acesso só obriga trocar a senha.
- **Acompanhamento** (`ACOMPANHAMENTO`, 04/11/2026): só o módulo de mentorados; dentro dele, o **perfil**
  (`mentoria_perfis`: Acompanhamento, Operação, Especialista, Mentor) e o selo de Admin decidem o resto, por RLS
  (`mentoria_ve`, `mentoria_edita`; Diretoria é Admin sem linha). Cargo sem perfil vê "Peça ao Admin" e Mentor vê
  "Seu painel chega em breve", sem menu (`components/acompanhamento/sem-acesso.tsx`, no layout de `(app)`); API 404 em tudo menos
  `mentoria/eu`. MFA obrigatório nas rotas `mentoria/*` para Diretoria e Acompanhamento, 404 para os demais. O cargo não vê nada do comercial
  (05/11/2026): `PermissionsGuard` dá 404 em toda rota sem `@AllRoles()` (`api/auth/all-roles.decorator.ts`;
  hoje `me`, `events`, `push` e o módulo), e o web mostra só as abas do módulo (`hasCommercialAccess`,
  sidebar/Ctrl+K/Mais/rodapé). Telas comerciais ficam em `web/app/(app)/(comercial)/`, cujo layout
  manda o cargo ao módulo com carga completa (o layout de `(app)` não roda na navegação do
  navegador; redirect do servidor ali deixava o módulo em branco). Entrada única: login, troca de
  senha e MFA vão para `/`, que escolhe o destino pelo cargo. Rota nova que o cargo use leva
  `@AllRoles()`; o teste `acompanhamento-sem-comercial` varre todas. Texto sensível cifrado com AAD
  (`MENTORADO_ENCRYPTION_KEY`); mídia fora do banco em `MEDIA_DIR`; sem DELETE para `npac_app`
  (exclusão só pelas funções, que enfileiram a mídia). Push (D12, 11/11/2026): `PushController` tem `@AllRoles()`
  e o link "Avisos neste aparelho" aparece para o cargo; o push da Fila não leva nome (`AVISO_PAYLOAD`), vai a
  quem responde pelo item ou a todos do perfil, um por pessoa a cada disparo; pausado, cancelado e o que veio antes
  do sistema não avisam. Fila: só ONBOARDING e ATIVO; "hoje" e 8h de Brasília; responsável desativado ou sem
  perfil cai no perfil (`mentoria_perfil_de`). Responsável pela inscrição (11/11/2026): só perfil Acompanhamento
  ativo, como quem recebe carteira (400 no cadastro e na troca); `GET mentoria/responsaveis` traz também quem saiu
  e ainda responde por inscrições (`elegivel`, `ativo`, `carteira`), para a ficha mostrar, o filtro achar e o
  Admin transferir. CSV do módulo: Admin e perfil Acompanhamento, auditado
  (`mentoria.csv`), contato só para Admin, nunca dor, sonho, meta, anotações ou textos de reunião. Excluir e
  anonimizar (LGPD) só Admin, pela ficha; anonimizar mantém inscrição, reuniões e ações para as contagens.
  Salvar ao sair do campo: em 409 a fila reaplica se o outro não mexeu naquele campo; se mexeu, avisa e mantém o dele (`resolverConflito`).
  **PMEs e ciclos** (Fase 2, Parte 1, 11/11/2026): cada PME dura 30 dias do envio (`prazo` e `data_cobranca` são colunas
  geradas); o envio (`POST inscricoes/:id/ciclos`, Admin, Acompanhamento e Operação, área `PME` de `mentoria_edita`) cria o
  ciclo do número seguinte (1 a 12) com uma tarefa EXTRA por atividade do catálogo e uma ENCERRAMENTO (texto cifrado; sem texto
  no catálogo, "Encerramento do Nº PME"); só ATIVO, antes do término; ciclo aberto vira `nao_concluido_em`; o 1º preenche
  `pme1_enviado_em`, e o "Enviado" do 1º PME na Fila também abre o ciclo 1. Status derivado em `mentoria_ciclo_status(concluido,
nao_concluido, prazo, hoje)`: aberto = em andamento com "N dias de atraso" (do `MENTORIA_CLOCK`); não concluído só com o
  seguinte enviado (0059: a segunda chance, S1, está pendente com a Eduarda). Encerramento FEITA fecha o ciclo por gatilho; voltar reabre (recusa se o seguinte já saiu). Ciclo anterior ao sistema
  (`ciclos/anterior`) sem tarefas, fecha à mão (área `TAREFA`). Marcar tarefa (resultado, motivo só em parcial/não feita,
  comprovante foto/vídeo/PDF em `tarefa-comprovante/:id/midia`): Admin e Acompanhamento; Especialista só as REUNIAO das próprias
  reuniões (`mentoria_ve_tarefa`/`mentoria_edita_tarefa`); Operação envia mas não marca. Até 3 tarefas por reunião (gatilho, para a
  Parte 2). Pausa não estica o prazo do PME (pergunta aberta à Eduarda).
  **Metas e tarefas da reunião** (Fase 2, Parte 2, 12/11/2026): metas (`mentoria_metas`, casal ou de uma pessoa, pilar, alvo/atual
  `numeric`, unidade, prazo, descrição cifrada) leem Admin, Acompanhamento e Operação (`mentoria_ve_meta`); escrevem Admin e
  Acompanhamento (área `META`); a **Especialista não vê metas**. Meta nasce no ciclo aberto (se houver). **Sem status da meta (S3) e
  sem exclusão de meta ou tarefa**: esperam decisão do Gabriel (pendências no plano da Fase 2, Parte 2). Registro da reunião:
  "Cobrança da reunião anterior" (tarefas REUNIAO da última reunião REALIZADA antes desta, entre as que quem abre vê), "Tarefas da
  semana" (até 3, prazo obrigatório, meta opcional, entra no ciclo aberto) e "Metas definidas ou ajustadas"; os textos da Fase 1
  continuam. Só a tarefa REUNIAO muda texto, prazo e meta; reunião com tarefa/meta não se exclui (a FK apagaria as tarefas).
  Vínculos (ciclo, reunião, pessoa, meta) da mesma inscrição por gatilho. % do PME (E5, `mentoria_pct_tarefas`, `SECURITY
DEFINER`, a Especialista vê o número inteiro): só tarefas FEITA ÷ total do ciclo (PARCIAL não conta). Metas não viram número
  único (pendente com a Eduarda): cada meta com alvo tem a própria barra (`pct` na leitura); sem alvo (S4), nenhum %. Ficha >
  Jornada: card do PME (extras e encerramento + barra de tarefas), Tarefas (as da reunião por PME) e Metas.
- **Siglas das mentorias** (Gabriel, 04/11/2026): RDV = Rico de Verdade · IDR = Introdução da
  Riqueza · PME = Plano Mensal de Enriquecimento · 2M = Marco e Mudança · 6M = sem definição ainda.
  Nas telas vale o texto literal do PDF, exceto IDR: "Introdução da Riqueza" (o PDF diz "à"; corrigido).
- Cookies em vez de localStorage: último usuário `npac_last_user` (`Path=/login`); ordem dos cards
  `npac_dash_<hash do id>` (`Path=/dashboard`, só IDs, o servidor já renderiza na ordem); colunas
  ocultas `npac_pipe_<hash>` (`Path=/pipeline`) e filtro do Hoje `npac_hoje_<hash>` (`Path=/hoje`),
  helpers em `lib/user-cookie.ts`.
- **Filtros lembrados** (NPAC-46, 11/11/2026, Gabriel "A, no aparelho"): cada tela grava filtro, aba e
  período em `npac_f_<tela>_<hash>` só no `Path` da tela (`PREFS` em `lib/screen-prefs.ts`; `rememberPrefs`
  não grava > 1 KB); valor `chave=valor&…` validado na leitura por `sh/screen-prefs.ts` (sem zod): ID de quem
  saiu, etapa/produto excluído e intervalo sem as duas datas caem. O servidor lê o cookie e já busca filtrado;
  a tela, ao montar, reaplica o cookie se ele for mais novo (voltar do navegador). URL com parâmetro
  (`/leads?view=`) vence e vira o lembrado; filtro que a API recusa (400) abre sem ele e apaga o cookie.
  Comercial: Leads (filtro salvo ou filtros), Pipeline (+ coluna do celular), Dashboard (período, SDR),
  Relatórios, Admin (aba), Chat (conversa). **Busca por texto e página só na memória da aba**
  (`lib/screen-memory.ts`, por pessoa): voltam ao trocar de tela, somem no F5; nunca em cookie, URL ou
  storage. Seleção em massa não é lembrada. **Filtros aplicam ao mudar** (sem "Aplicar filtros",
  "Filtrar Hoje", "Buscar" do Pipeline, "Atualizar relatório"); o texto da busca segue no Enter; "Limpar
  filtros" aparece com filtro ativo. `CsvExport` de `/leads` vem sob demanda (`next/dynamic`) pelo limite
  de 150 KB.
  **Acompanhamento** (PR 2): mapa à parte `AC_PREFS` em `lib/acompanhamento-prefs.ts` (cookies `npac_f_ac_*`,
  fora de `PREFS` para não pesar em `/leads`), com as regras de Fila (`ver` Minha/Equipe, grupo), Mentorados
  (mês, status, responsável, completar; "Limpar filtros"), Onboarding (etapa, painel) e Ficha (aba para qualquer
  ficha, filtro do histórico; `?aba=` do link vence e vira a lembrada; mês do plano só na memória, por ficha).
  Reuniões, Plano e Configurações guardam a **última URL por aba** (`lib/acompanhamento-abas.ts` no servidor,
  `components/acompanhamento/lembrar-url.tsx` no navegador): URL com chave da tela vence; sem nenhuma (menu),
  abre a última aba com os filtros dela; links das abas levam a consulta salva de cada uma; semana (`dia`) e
  mês do Controle (`mes`) só no mesmo dia de Brasília. O valor vai codificado (o `cookies()` do Next decodifica).
  **Leitura no navegador** (`readPreference` em `lib/read-preference.ts`): o JS só enxerga cookies do caminho
  em que a página foi _carregada_; depois de navegar pelo menu, o cookie da tela fica invisível ao `document.cookie`
  (mas vai nas requisições). Por isso `savePreference` espelha o valor na memória da aba e `readPreference(nome,
valorDoServidor)` lê memória → `document.cookie` → valor do servidor. Toda reconciliação passa o valor do servidor.

## Segurança e privacidade (não negociável)

- Runtime usa `npac_app` (sem BYPASSRLS); owner só em migrations/seed/fixtures.
- Consulta de domínio sempre em `withUser(db, u.id, tx => …)`: autorização de linha é RLS no SQL,
  nunca filtro em JS (`FOR UPDATE` também passa pela RLS).
- Usuários e pedidos de acesso não têm RLS (Better Auth lê `user`): guarda = `admin:manage` + auditoria.
  Leads no admin continuam via `withUser`.
- Contato, termo de busca e conteúdo pessoal nunca em URL, logs, analytics ou localStorage (há e2e
  que barra `@` e dígitos longos). Buscas/relatórios por POST. Exceção pedida pelo cliente (04/11):
  o link do Google Agenda leva nome do lead, perfil, sigla de quem agendou e o handoff; nunca
  telefone, Instagram ou e-mail.
- Telefone E.164 BR, AES-256-GCM + blind index HMAC. Renda só em faixas ≥ R$ 5 mil ou "Descobrindo renda".
- E-mail do lead (NPAC-42, opcional, não conta para "informe telefone ou Instagram"): igual ao telefone,
  `email_enc` + `email_bidx` (0044) sobre `normalizeEmail` (`trim` + minúsculas, `sh/normalize.ts`). Busca só
  pelo endereço inteiro: `parseSearch` trata como e-mail texto com `@` no meio, sem espaço nem `/`.
  Na ficha é texto, sem `mailto:`.
- Timeline append-only: tipo, IDs e nomes de campos, **nunca valores**. Auditoria sem e-mail nem nome.
- API com `Cache-Control: no-store`. SSE só manda `{ type }`.
- Chat: DM privada por RLS mesmo para liderança; mensagens append-only.
- LGPD: eliminação só via `lgpd_anonymize_lead`; nada de outro caminho que apague fato financeiro.
- CSV com contato: só liderança, auditado, fórmulas neutralizadas.

## Regras de escrita e negócio

- PATCH exige `version` (409 `VERSION_CONFLICT`); campos permitidos explícitos.
- Duplicidade de contato (telefone, Instagram e e-mail, `lead_contact_taken`): advisory locks em ordem
  determinística; resposta não revela o dono.
- Mudança + `recordActivity` na **mesma transação**.
- Dinheiro em centavos inteiros (`sh/money.ts`), nunca `parseFloat * 100`.
- Venda: uma ativa por lead; `requestKey` idempotente + hash do payload; entrada + parcelas = total,
  parcelas futuras; só liderança estorna; lead com venda ativa não é excluído.
- **Etapa VENDA = venda ativa ou venda a registrar**: entra por `POST /finance/deals` ou pelo
  cadastro em Venda Fechada; sai pelo estorno. PATCH recusa entrar (409 `SALE_REQUIRED`) e sair com
  venda (409 `ACTIVE_SALE`). Selects usam `<StageOptions>` (Venda desabilitada; `allowSale` só no
  cadastro); ação em massa não oferece Venda.
- **Venda Fechada no cadastro** (NPAC-39, 05/11/2026): todos que cadastram (SDR e liderança; closer
  não cadastra) informam a reunião já realizada (`meeting`, até agora; criada `DONE` com `outcome_at`
  = horário, origem DIRETO: o SDR recebe por ela nesse dia) e o closer dela vira o do lead. "Registrar
  a venda agora" (`sale`, só `sale:register`; SDR → 403) usa `insertSale` de `finance.service.ts`:
  `closedOn` (nunca futuro) vira `deals.closed_at`, entrada recebida nesse dia, closer = o da reunião,
  idempotente por `requestKey` + hash do pedido. Sem a venda: **venda a registrar** (`saleToRegister`
  no DTO, `lead_sale_pending()` da 0038), selo na ficha/Pipeline e aviso `sale.pending` ao closer.
  Registrar depois mantém em Venda; o estorno dessa venda volta para EM_FOLLOW (`previous_stage_id`).
  Regra em `api/leads/leads.service.ts` (`checkSoldLead`/`registerSold`); tela `components/sold-fields.tsx`
  - `lib/sold-fields.ts`. **Produto vendido** (NPAC-41, Igor 06/11/2026, "2A"): obrigatório, do closer
    da reunião (409 `PRODUCT_REQUIRED`); SDR vê só o nome, sem R$. Sem a venda fica em
    `leads.sold_product_id` (0039): "Produto: X" na ficha e pré-preenche o registro; apagado ao
    registrar ou sair da Venda (o gatilho deixa o closer zerá-lo sem trocar a etapa).
- **Campos por etapa** (NPAC-38, 05/11/2026, "1A 2A 3A"): Agendados pedem `meeting` (criada na
  mesma transação, origem pela etapa, `rearm()` depois do commit; reunião futura aberta dispensa),
  Agendou Pagamento pede data (`next_contact_at`) + produto + valor, Sem Perfil pede `lost_reason`
  (+ texto se Outro; limpa o próximo contato). 409 `MEETING_/PAYMENT_/REASON_REQUIRED` só quando a
  etapa muda; leads antigos ficam como estão. Sair da etapa ou registrar venda apaga pagamento e
  motivo. Closer grava esses campos só junto da troca (gatilho da 0037, refeito na 0039). Regra em `api/leads/stage-fields.ts`.
  **Pagamento parcial** (NPAC-41, "1A"): caixa "Já pagou uma entrada" → `payment_entry_cents`
  (0 < entrada < valor, CHECK + 400); a data vira a do restante. Não cria venda nem entra nos
  relatórios até o closer registrar; o registro abre em Parcial com entrada + restante na data.
  **Pagamento do SDR** (item 13, Igor 10/11/2026, "2A, 3A", 0043): o papel SDR informa só produto,
  closer (`paymentCloserId` → `leads.closer_id`, ativo e `canClose`) e "já pagou" (`payment_entry_paid`);
  valor, entrada ou data dele dão 403 e `next_contact_at` fica nulo (a ação rápida também recusa, o
  lead sai do Hoje e do sino do SDR, e a data nessa etapa não vai no DTO dele). Sair da etapa ou
  registrar a venda apaga também a data combinada. **Pagamento a completar** = etapa + produto + sem valor (`paymentToComplete`):
  selo na ficha e no Pipeline, aviso `payment.pending` ao closer. O closer do lead (ou a liderança)
  completa na ficha (`payment-complete.tsx`), sem trocar a etapa, só enquanto não há valor; depois
  disso o SDR não mexe mais. `closer_has_lead` vale também para `leads.closer_id` nessa etapa e, com
  venda ativa dele, depois dela. Closer sem reunião que tira o lead da etapa o perde: a timeline
  grava antes do UPDATE (`lead-mutations.service.ts`).
- Ficha: botões WhatsApp (`wa.me`, conversa) e Instagram (perfil, `instagram.com/<usuario>/`, NPAC-41 "3B").
- Resultado de reunião só depois do horário (400 "A reunião ainda não aconteceu"). Resultados:
  `DONE`, `NO_SHOW`, `RESCHEDULED`. Valor por reunião realizada = `MEETING_VALUE_CENTS`
  (P0 900, P1 700, P2 500, DESCOBRINDO 0), pelo perfil **atual** do lead; no-show e remarcada não somam.
- **Perfil = faixa de renda** (Igor, 05/11/2026, "1B, 2B"): 5–8 mil P2, 8–15 mil P1, 15 mil+ P0
  (`TIER_BY_INCOME_BAND` em `sh/enums.ts` + gatilho `leads_tier_from_income`, 0036, que reescreve
  `tier` em todo INSERT e UPDATE de faixa/perfil). Sem troca à mão: cadastro ignora `tier`, PATCH
  recusa; lista e ação em massa só mostram. A 0036 recalculou os leads antigos. Faixa nova = as duas tabelas.
  **Descobrindo renda** (Igor, 10/11/2026, "1C"): faixa e perfil `DESCOBRINDO` (0040, último nas
  listas); telas mostram o perfil por `TIER_LABELS`, nunca a chave crua. Reunião vale R$ 0 (Igor: "só vai
  para a reunião quando descobrimos a renda"); trocar a faixa recalcula; relatórios contam `descobrindo` ao lado de p0–p2.
  O lead fica **só em Criando Relacionamento** (SONDAGEM, etapa de descobrir os dados): cadastro,
  PATCH (etapa ou faixa), reunião e venda dão 409 `INCOME_REQUIRED` (`assertIncomeStage`/`assertIncomeKnown`
  em `api/leads/stage-fields.ts`); gatilhos da 0041 garantem no banco; telas travam via `StageOptions incomeUnknown`.
- **Etapas**: `pipeline_stages.key` é texto; `system` é coluna gerada (`key` ∈ `STAGE_KEYS`). A
  liderança cria (`C_` + 8 hex), renomeia, reordena e exclui; não exclui de sistema, com lead ativo
  ou referenciada por venda (`deals.previous_stage_id`, imutável). Validação: `stageKeySchema`.
- **Origem do lead** (lista do cliente, 05/11/2026): `LEAD_SOURCE_OPTIONS` + rótulos
  `LEAD_SOURCE_LABELS` em `sh/enums.ts`; cadastro exige uma delas. "Outro" pede texto em
  `source_other` (≤ 80, CHECK só com `OUTRO`; timeline grava como campo `source`; LGPD apaga).
  Instagram/WhatsApp são antigas: ficam nos leads existentes ("(antigo)"), filtros mostram, cadastro
  e troca recusam. Origem nova = valor no enum `lead_source` (migration) + rótulo.
- Hoje: Atrasados (Igor, 10/11/2026, "1A") = lista única por horário com contatos (próximo contato <
  **agora**), reuniões passadas sem resultado (qualquer data e etapa, `overdueMeetings`) e tarefas
  vencidas (`overdueTasks`, que saem do painel Tarefas); reunião de hoje vencida segue também na
  agenda; cobranças têm bloco próprio. `moveDue` passa o que vence no navegador (sem polling, que
  gravaria auditoria). Ação rápida `POST /leads/:id/quick-action` (Chamado/Remarcado/Próxima ação).
- Desativar usuário derruba sessões; leads dele vão por `POST /admin/users/:id/transfer-leads`.
- Fuso `America/Sao_Paulo`; `datetime-local` = Brasília (`brasiliaInput`); intervalos [início, fim);
  em `sql` cru, datas como ISO string.
- Métricas em SQL com CTEs que não multiplicam linhas; vendas contam por `deals`, não por etapa.
  Relatório por produto usa o nome atual do catálogo (`deals.product_name` guarda o da época).
- Paginação no servidor; CSV recusa > 10 mil linhas; cabeçalhos do CSV com `csvHeaders` depois de
  gerar o arquivo (com `@Header` fixo, erro de validação virava 500). Leads e Relatórios exportam por
  período, filtro atual ou tudo (`period: 'ALL'` só no CSV). `POST /reports/export` = relatório do
  período em CSV (resumo + por SDR/closer/produto, sem contato), para todos; SDR sem venda. As
  exportações dos Relatórios leem o formulário na tela, não o último "Atualizar".
- Erros da API em português para o usuário final (`BadRequestException('…')`); o `clientApi` mostra a
  mensagem, as padrão do Nest viram texto genérico. `clientApi` aceita 204.

## Avisos e lembretes (NPAC-26, 04/11/2026)

- Chat: selo de não lidas (`chatUnread` em `/notifications`) e `(N)` no título, pelo SSE. Push sem
  texto: "Nova mensagem no Chat" (Geral → todos menos o autor) ou "de <nome>" (DM → destinatário).
- Lembretes só para o dono do lead (`leads.sdr_id`): `H1` (60 min) e `M15` (15 min) com
  "Confirmação enviada" (`POST /meetings/:id/confirm`, `meeting_confirmations` por horário, timeline
  `meeting.confirmed`); `M1` só aviso. Etapa vigente calculada no navegador (`sh/reminders.ts`).
  Liderança vê "1 h: não confirmada" na ficha. Remarcar recomeça; cancelada/resultado não avisa.
- Push dos lembretes: `ReminderScheduler` = um único timer para o próximo (`meeting_reminder_next`),
  rearmado ao subir a API e depois de criar/remarcar/cancelar/resultado/transferir. Disparo via
  `meeting_reminder_claim` (advisory lock + `meeting_reminders_sent`): uma vez por etapa, só a mais
  recente se a API ficou parada. Sem polling. Testes trocam `PUSH_SENDER` e `REMINDER_CLOCK`.
- Push: VAPID opcional no env (sem chaves = desligado). Inscrição por `push_subscribe` (o aparelho
  vai para quem logou por último); sair e desativar usuário apagam; 404/410 apaga.

## Google Forms (NPAC-42, 10/11/2026)

- `POST /webhooks/forms` (`api/forms/*`, `@Public`, cabeçalho `x-forms-token`): sem
  `FORMS_WEBHOOK_TOKEN` ou com token errado, 404. Apps Script e passo a passo em `docs/integracao-forms/`.
- Acha o lead por telefone, Instagram e e-mail (`form_find_lead`); não altera o lead nem troca o dono.
  Sem lead: cria só com faixa do CRM (acima de 5 mil) e telefone ou Instagram, dono =
  `FORMS_OWNER_USERNAME`, origem `FORMULARIO`, etapa Criando Relacionamento; senão descarta, sem guardar.
- `form_responses`: respostas cifradas, gravação só por `form_response_record` (timeline
  `form.received` + auditoria), LGPD zera. Aviso ao dono e à liderança, sem excluir o autor; bloco
  "Formulários novos" no Hoje e card na ficha. `truncate leads` nos testes inclui `form_responses`.

## Banco

- Migration nova: `pnpm --filter @npac/db generate` (ou SQL manual) → `00NN_nome.sql` + snapshot +
  `_journal.json`. **Nunca reescreva migration aplicada**; crie sucessora.
- Journal: `idx` sequencial e `when` maior que o da última entrada. O migrator só aplica `when` acima
  do último aplicado: migration de branch antiga com `when` menor é **pulada em produção sem erro**.
  Ao trazer migrations do main, renumere as suas para depois e refaça `when`, snapshots e `prevId`
  (teste "idx e `when` crescem juntos" em `db/test/migrations.test.ts`).
- Drizzle: em select de uma tabela só, `${tabela.id}` sai sem o nome da tabela. Em subconsulta
  correlacionada escreva o nome inteiro (`where c.ficha_id = mentoria_fichas.id`): o `id` solto é
  lido da tabela de dentro e a contagem dá zero.
- RLS, grants, triggers e SECURITY DEFINER são SQL manual: revise além do schema. `npac_app` sem
  UPDATE numa tabela não pode `SELECT … FOR UPDATE` nela.
- **Política de leitura sem função por linha** (desempenho, Fase 1, 0060–0061): no `USING` de
  SELECT/ALL (e de `leads_update`), toda função vai dentro de `(select f())`, calculada uma vez por
  consulta; o que depende da linha compara com uma lista: `id = any ((select closer_lead_ids())::uuid[])`
  (comercial), `(select mentoria_ve_todas()) or inscricao_id = any ((select mentoria_ids_especialista())::uuid[])`
  (Acompanhamento). Nunca `closer_has_lead(id)`/`mentoria_ve(inscricao_id)` direto: com 20 mil leads o
  Dashboard do SDR levava 20 s. O teste-guarda de `db/test/rls-por-consulta.test.ts` varre `pg_policies`
  (única exceção: `mentoria_midia_leitura`). INSERT/UPDATE com `mentoria_edita*` seguem por linha.
  Tabela nova do módulo: política de leitura nesse formato e caso no teste de equivalência.
- Valor novo de enum não vale na mesma transação da migration (compare como texto).
- Aplicar no dev: `pnpm --filter @npac/db build && pnpm --filter @npac/db migrate`.
  psql: `docker exec npac-corporation-postgres-1 psql -U npac_owner -d npac`.
- Apagar lead/usuário à mão: FKs em `form_responses`, `chat_reads`, `chat_*`, `payments`, `deals`, `lead_notes`,
  `lead_tasks`, `notifications`, `lead_timeline`, `meetings` (`meeting_confirmations` e
  `meeting_reminders_sent` em cascata), `lgpd_requests` (usuário: também `session`, `account`,
  `push_subscriptions`). `truncate` de `meetings` nos testes lista as duas tabelas de lembretes.

## Comandos

```sh
docker compose up -d                 # Postgres local
pnpm lint && pnpm typecheck          # antes de commitar
pnpm --filter @npac/api test         # vitest e2e da API (~1 min, bancos npac_test*)
pnpm --filter @npac/db test          # RLS/migrations/seed
pnpm --filter @npac/shared test
pnpm --filter @npac/api exec vitest run test/leads.e2e.test.ts -t "nome"   # focado
pnpm --filter @npac/web e2e [e2e/admin.spec.ts]   # Playwright (~2 min)
pnpm exec prettier --write <arquivos>
pnpm perf:seed                       # recria npac_e2e_perf com ~20 mil leads e ~360 inscrições (~2 min)
pnpm perf:api                        # API de medição na porta 4150 (produção, npac_e2e_perf)
scripts/perf/medir.sh igor GET /api/leads?page=1          # mediana de 5, em ms (bash)
node scripts/perf/medir-sql.mjs igor sonia                # count(*) e canal ao vivo sob a RLS
```

- **Medição** só no `npac_e2e_perf` (nunca no dev `npac`); senha de todos `senha-do-e2e-123`. Plano,
  metas e números de antes/depois em `docs/plans/desempenho.md`.

- **Dev só pelo painel**: `preview_start` `npac-dev` (`.claude/launch.json`), nunca `pnpm dev` em
  segundo plano (porta 3000). e2e e dev disputam portas e `.next`: antes do e2e, `preview_stop` e
  libere 3000/4000; depois, `rm -rf apps/web/.next` e `preview_start`. e2e usa API 4100, web 3100
  (`E2E_WEB_PORT=3200` se outro projeto ocupar) e banco `npac_e2e`.
- Testes só recriam `npac_test*`/`npac_e2e*`; nunca aponte para outro banco. `npac_test_api` é um só para todas as worktrees: duas suítes da API ao mesmo tempo dão 401 falso. O e2e isola com `E2E_DB`, `E2E_API_PORT` e `E2E_WEB_PORT`.
- API e e2e compartilham usuários: teste que mexe em MFA/senha/papel restaura no fim; `truncate leads`
  inclui as tabelas com FK.
- e2e loga com `email.split('@')[0]`. Seeds: diretor (DIRETOR), ana/ronaldo (HEAD), ale/murilo/igor
  (SDR), sonia (CLOSER), carla (Acompanhamento sem perfil), duda (Acompanhamento + Admin), operacao, manu, leo, `@npac.com.br`; teste que troca papel: `update "user" set role = …` e restaurar.
- Playwright: `filter({ visible: true })`/`exact: true` (layout mobile oculto duplica controles);
  `role=alert` também pega o anunciador de rotas do Next; nada de `networkidle` (SSE).
- JS de `/leads` < 150 KB gzip (teste; hoje ~149,7, com a release em 150,0 antes da Fase 2 do desempenho). Sem libs pesadas no cliente, nem zod; prefira server components.
- Capturas dos e2e: `apps/web/test-results/*.png`.

## Não commitar

`.env`, dumps, `test-results/`, logs, `node_modules`, `.claude/`. Commits sem linha de
atribuição.
