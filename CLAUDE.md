# NPAC CRM — guia para o Claude

CRM comercial da NPAC (SDRs, closers, liderança). Leia antes de explorar e abra só o que o mapa
indicar. Mantenha denso; ao mudar arquitetura, regra ou comando, atualize aqui.

## Como trabalhar

- **Pergunta não é pedido** ("o que acha?", "dá pra…?", "faz sentido…?"): opinar, dar opções e
  recomendação, esperar o "faz". Sem editar nem rodar nada.
- Português, respostas curtas, execução direta quando o pedido é explícito. Commits frequentes; push só se pedirem.
- Branch, PR, tag e release seguem `RELEASING.md` (release-kit): branch `tipo/NPAC-N-nome` a partir da
  `release/vX.Y` aberta, PR `tipo(NPAC-N): resumo` em minúsculas, squash. Tags só pela automação.
  Kit v1.2.0 (17/11/2026): deploy manual (prod, rollback) é Actions → **Deploy** da `release/vX.Y`, não
  mais o menu do Release; o adaptador do Cubeship lê `DEPLOY_URL` + segredo `DEPLOY_TOKEN`
  (`docs/deploy-cubeship.md`, seção 4). Só `release/*` e `hotfix/*` entram na `main`.
- Sem subagentes sem pedido. Plano novo grande: apresentar antes de implementar.
- Régua: CRMs robustos (Linear, Attio).
- Bug: teste que falha (RED) → correção → teste focado → suíte ao fechar.
- Segredos (senhas, chaves, `.env`): pode gerar e definir pelas ferramentas (Cubeship, shell) quando o
  pedido envolver infra; não os repita em mensagens sem necessidade. Dados reais de clientes nunca
  em ferramentas, logs ou mensagens.

## Mapa

pnpm 12 + Turborepo, Node ≥22, Postgres 16 no Docker. Prefixos: `api/` = `apps/api/src`,
`web/` = `apps/web`, `db/` = `packages/db`, `sh/` = `packages/shared/src`.

- **Shared:** papéis/`isLeader`/enums `sh/enums.ts` · cargos e resolvedor `sh/cargos.ts` · frases do registro de acessos e "entrou há X" `sh/acessos.ts` (`@npac/shared/acessos`, sem zod) · `can` `sh/permissions.ts` · Zod de lead
  `sh/schemas/lead.ts`, `lead-update.ts` · usuário/pedido de acesso `sh/schemas/account.ts` ·
  DTOs `sh/dto.ts`, `finance.ts`, `today.ts` · dinheiro/datas BR `sh/money.ts`, `dates.ts`
  · filtros lembrados `sh/screen-prefs.ts` (`@npac/shared/screen-prefs`)
- **Banco:** schema `db/src/schema/*.ts` · migrations `db/drizzle/00NN_*.sql` + `meta/` ·
  `withUser`, `leadContactTaken` `db/src/with-user.ts` · seed `db/src/seed*.ts`
- **Auth:** Better Auth (username, TOTP, auditoria, rate limit) `api/auth/auth.ts` · sessão e
  troca obrigatória `api/auth/session.guard.ts` · `@Can`/`@Public`/`@AllowIncomplete`
  `api/auth/*.decorator.ts` · pedido de acesso público `api/auth/request-access.ts` · esqueci a senha
  `api/auth/password-reset.ts` + e-mail `api/mail/*` · Meu perfil (foto, nome, e-mail com código) `api/conta/*` ·
  env Zod `api/config/env.ts`
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
  não pesar no JS; `nav-items.tsx` também fica no servidor, a barra inferior é componente de servidor) · na sidebar só o
  miolo rola (`.side-scroll`: navegação + filtros salvos); topo e rodapé com o Sair ficam fixos, e a carga direta rola até o
  item ativo (`sidebar-shell.tsx`) · Sair no celular (17/11/2026): o mesmo cartão `shell/conta-card.tsx` (foto, nome, cargo,
  Meu perfil, Sair) no topo do `/mais` e do `/acompanhamento/mais`; nada de outro Sair nessas telas (e2e `e2e/sair.spec.ts`) · classes de botão `lib/button.ts` · dropdown (todos os `<select>`) com o visual do CRM só por CSS
  (`appearance: base-select` + `::picker(select)` no fim de `globals.css`; Safari fica com o do
  sistema; Lightning CSS não aceita pseudo-classe depois de `::picker`, use `select:open::picker(select)`) · login,
  pedir acesso, esqueci a senha (`/login/esqueci`, `/login/nova-senha`) `web/components/login/*` · **duas telas de
  entrada** (NPAC-52, 18/11/2026): `/login` (CRM, noite) e `/login/acompanhamento` (+ `/solicitar`, `/esqueci`;
  "ouro líquido de dia"), mesmas páginas (`login/pages.tsx`) com textos, endereço e destino em `login/area.ts`
  (`LOGIN_AREA`) e aparência em `auth-shell.tsx` (`LOOK`; campos `.auth-dia` em `globals.css`); shader único
  `liquid-gold.tsx` com `tom` `noite`/`dia`, só nas telas de entrada. Até 1023 px em coluna; celular sem a frase.
  Sem sessão no módulo, e ao Sair dele, a tela do Acompanhamento (`lib/login-path.ts`, `proxy.ts`) · senha/MFA `components/conta/*`, `app/(conta)/*` · API
  server/client `web/lib/api.ts` / `lib/client-api.ts` · filtros lembrados `lib/screen-prefs.ts`,
  `lib/use-latest-prefs.ts`, memória da busca `lib/screen-memory.ts` · sessão (`getSession`, `pendingStep`)
  `web/lib/session.ts` · UI base (`Field`, `button`, `StageOptions`) `components/crm-ui.tsx` ·
  cargo (`ROLE_LABEL`, `RoleTag`, `CargoTag`) `components/role-tag.tsx` · campo Cargo (select agrupado,
  dica, caixas/selo) `components/cargo-field.tsx` · tokens/`.tier-*`/`.role-*` `web/app/globals.css`
- **Telas:** leads `components/leads-browser.tsx`, `lead-filters.tsx` · ficha/venda `lead-detail.tsx`,
  `sale-flow.tsx`, `finance-panel.tsx` · `pipeline.tsx`, `today.tsx`, `reports.tsx`, `dashboard-*.tsx`
  (cards reordenáveis: `dashboard-board.tsx`, `lib/dashboard-layout.ts`, `lib/board-motion.ts`) ·
  admin `admin.tsx`, `access-requests.tsx`, quadro "Acessos" `acessos-card.tsx`, linha da equipe `lib/equipe.ts` · Ctrl+K `shell/command-palette.tsx` · avisos `inbox.tsx` ·
  textos de atividade `lib/activity-text.ts` · campos por etapa `stage-fields.tsx` (+ `lib/stage-fields.ts`,
  `lib/stage-kind.ts`) e janelinha `stage-move-dialog.tsx` (Pipeline, lista, massa) · editor de colunas `pipeline-columns-editor.tsx` · ação
  rápida do Hoje `today-quick-action.tsx` · closer completa o pagamento `payment-complete.tsx` · SDR marca a
  venda `sale-mark.tsx` · menu de CSV `csv-export.tsx` (API: `api/common/csv.ts`) ·
  avisos compartilhados (selo do chat, `(N)` na aba, lembretes) `lib/alerts.ts`, `meeting-reminder.tsx` ·
  push no aparelho `lib/push.ts`, `public/sw.js`, `/conta/avisos`, convite `components/push-invite.tsx`
- **Cores e contraste** (achados de design de 17/11/2026, plano `docs/plans/achados-design-17-11.md`): todo texto
  passa de 4,5:1 (WCAG AA) no claro e no escuro. Cada cor tem um significado: **dourado = marca, progresso e
  seleção** (barras da jornada, do PME e das metas; `--gold-deep` em barra/borda, `--gold-text` em texto dourado);
  **vermelho único = atraso e erro** (`--danger` e `--tag-bad`, mesma família); **amarelo = só o semáforo do Acompanhamento**
  (`--tag-warn`, Parte 3: o PDF pede verde, amarelo e vermelho); **cinza neutro = estado sem alarme**
  (Cancelado, Pausado, "N a cobrar", etiqueta RDV/2M/6M em toda tela); azul `--tag-info` = informação/link de meta.
  Avatares com pouca saturação. Na Fila, "X dias" fica vermelho só acima de `ATRASO_ALARME_DIAS` (14, `fila.tsx`).
  `.field` tem versão escura em `globals.css`; a caixa do login (`.auth-card`) fixa os tokens claros nos dois temas.
  Botão desativado mantém o fundo translúcido com o texto inteiro (nunca cinza sobre cinza). Cor nova: mesmo
  significado de uma dessas, ou pergunte.
- **Movimento e resposta** (NPAC-47, Fase 4): entrada de página em `globals.css` (`.page-reveal`, `.reveal`,
  `.reveal-grid`; opção B do Gabriel: sobe 6 px, `--dur-enter` 220 ms, cascata de 3 blocos × `--stagger` 30 ms,
  tudo pronto em 280 ms, sem desfoque; cards do Pipeline não animam um a um) · janelinhas `<dialog class="dlg">`
  entram por `@starting-style` e saem por `closeWithMotion` (`lib/dialog-motion.ts`: anima com a janela ainda
  modal, depois `close()`) · aviso "Salvo" `components/toast.ts` (`showToast()`, sem React: região `role="status"` do layout, um por vez, 2,5 s;
  único texto aprovado, D3) · `startNavProgress(href)` (`shell/nav-progress.tsx`) antes de `router.push` ·
  movimento reduzido zera duração e atraso (`globals.css`, `prefers-reduced-motion`) · e2e `e2e/resposta-imediata.spec.ts`
- **Celular** (Fase 1, 18/11/2026; regras no fim de `globals.css`, e2e `e2e/mobile-layout-celular.spec.ts`, projeto `iphone`):
  na tela de toque (`pointer: coarse`) campo de texto e select têm 16 px (abaixo disso o iPhone dá zoom ao tocar; campo
  novo maior que 16 px entra na exceção da regra), `.btn` tem 44 px de altura e `.toque` aumenta a área de toque para 44 px
  sem mudar o desenho (`::after`; não serve com `overflow: hidden`; caixa pequena vai dentro de `<label class="toque">`) ·
  barra de baixo do celular leva `barra-celular` (some enquanto um campo de texto tem foco) · `viewport-fit=cover`
  (`app/layout.tsx`): o que encosta na borda usa `env(safe-area-inset-*)` (`.shell` nas laterais, barras e `.nf-barra`
  embaixo) · ícone (NPAC-55, opção C: N dourado degradê com contorno) na aba `app/favicon.ico` + `app/icon.png`, na Tela de Início do iPhone `app/apple-icon.png` (180 px) e no Android `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (manifesto); refazer: desenho em HTML com a fonte Anton, foto por Playwright · menu de CSV fica dentro da tela (`caberNaTela`)
- **Acompanhamento (mentorados), v2 em 5 partes** (plano `docs/superpowers/plans/2026-11-10-acompanhamento-v2-fase-1.md`, protótipo `docs/acompanhamento/prototipo/canvas/`):
  API `api/mentoria/*` (guarda 404 + MFA: `MentoriaController` em `mentoria.guard.ts`; perfil `perfil.guard.ts`,
  `perfis.*`; inscrição e ficha `inscricoes.*`, `ficha.service.ts`, `historico.ts`; mídia `midia.controller.ts`,
  `media-store.ts`, `media-sniff.ts` (`semMetadados`: foto sem EXIF/GPS; MP4/MOV com `udta`/`meta`/`uuid` virando `free`
  zerado, mesmo tamanho e posições, NPAC-57; PDF como veio), `media-worker.ts`; cifra `mentoria-crypto.ts`; onboarding e Caixa `onboarding.*`
  (regras puras `sh/mentoria/onboarding.ts`; CAIXA e IDR são derivadas, gatilhos da 0048); importação `importacao/*`, junção das
  fontes `sh/mentoria/importacao.ts`, planilha lida por título em `ler-planilha.ts`, CPF descartado ali; `importacao_chave` impede
  reimportar quem foi renomeado; reimportar só acrescenta, quem já está não muda; tela em Configurações > Importação, com
  atalho "Importar" no topo de Mentorados só para Admin, 18/11/2026); reuniões e contatos `reunioes.*`, `contatos.controller.ts` (0052: estados e
  remarcar/excluir no banco; IDR realizada → `data_idr`/início de Brasília + ATIVO + ações em `iniciarPelaIdr`;
  reunião realizada conclui a ação do mesmo `reuniao_tipo`; Especialista vê só inscrições/reuniões que conduz,
  nunca IDR); Fila do dia `fila.*` (0053: `mentoria_fila(agora)` calcula na leitura, SECURITY INVOKER;
  0064: sem função por linha que releia tabela, porque cada uma reavalia a RLS (era 0,6–1 s); o mês da
  jornada e os dias parados repetem a conta de `mentoria_mes_jornada`/`mentoria_dias_pausados`: mudou
  uma delas, mude a Fila; `db/test/fila-equivalencia.test.ts` compara com a versão da 0053; quem vê cada item `sh/mentoria/fila.ts` `itemVisivel`; `mentoria_fila_feitos` conclui o que não tem estado;
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
  (`mentoria_pct_tarefas`; barra por meta); 0059 tira a segunda chance do status do ciclo;
  Parte 3 (0069): check-ins `checkins.*`, semáforo (`mentoria_semaforo`, histórico gravado pelo `avisos.scheduler.ts`), rótulos
  `sh/mentoria/semaforo.ts`, tela `components/acompanhamento/semaforo.tsx`, colunas e filtro em `mentorados-lista.tsx`;
  Parte 4 (0070): itens novos da Fila (`mentoria_fila`, `fila.service.ts`, degraus em `sh/mentoria/fila.ts`), contato do degrau
  (`reunioes.service.ts`), aba 7 `pmes-ciclos.controller.ts` + `web/app/(app)/acompanhamento/pmes`, `components/acompanhamento/pmes-ciclos.tsx`;
  **Evolução** (NPAC-57, 22/11/2026, spec `docs/superpowers/specs/2026-11-21-aba-evolucao-design.md`, plano
  `docs/plans/npac-57-aba-evolucao.md`, opção A): aba da ficha com cartões antes → hoje, Momento inicial (da aba Momento
  inicial) × Momento atual com foto e tópicos, Pontos de partida dos 4 pilares, Conquistas e "Baixar PDF". Banco 0076:
  `mentoria_evolucao` (uma por inscrição, textos cifrados com AAD, `version`; `atual_atualizado_em/por` gravados pelo gatilho
  `mentoria_evolucao_guarda`) e `mentoria_conquistas` (sem UPDATE; sai só por `mentoria_conquista_excluir`), área `EVOLUCAO`
  em `mentoria_edita`. Veem e baixam o PDF Admin, Acompanhamento ("só a carteira": a carteira) e Operação
  (`mentoria_ve_evolucao`; leitura por `mentoria_ids_carteira()`, nunca `_visiveis`); editam Admin e Acompanhamento; a
  **Especialista recebe 404** (aba, rotas e PDF). API `evolucao.controller.ts` + `evolucao.service.ts` (`GET` e
  `PUT inscricoes/:id/evolucao` com `version`, `POST inscricoes/:id/conquistas`, `DELETE conquistas/:id`; histórico só com nomes
  de campo); fotos pelo `midia.controller.ts` com os donos `evolucao-inicial`, `evolucao-atual` (dono = inscrição, uma foto
  por momento) e `conquista`, conferidos no banco por `mentoria_midia_do_dono` (mídia de outro registro, 22023). **Cópia do
  legado ao subir e depois de cada importação** (`evolucao-legado.ts`, 2A; `ImportacaoService.importar` chama
  `copiarDepoisDeImportar` após o commit, sem lançar, pois em prod a importação veio depois do deploy): uma instância por vez (advisory lock), percorre `mentoria_legado` pelas funções
  SECURITY DEFINER `mentoria_evolucao_legado_pendentes`/`_gravar`, que só rodam sem sessão (`app_user_id() IS NULL`; pedido
  logado recebe 42501); nunca sobrescreve campo escrito nem duplica conquista, marca `legado_copiado_em`, **não grava
  histórico** e loga só "evolução: N inscrições copiadas do legado" (ilegível: só o id, fica pendente). Excluir e anonimizar
  a inscrição levam evolução, conquistas e mídias; nada da evolução no CSV. Tela `components/acompanhamento/evolucao*.tsx`
  (fila de salvamento `evolucao:<id>`; grades por container query `.evs`, não pela largura da tela); regras puras
  `sh/mentoria/evolucao.ts`. **PDF pela impressão do navegador**: rota `app/(impressao)/acompanhamento/ficha/[id]/evolucao/pdf/`
  (grupo fora da casca do app, CSS `evolucao-pdf.css`, A4 com `@page { margin: 0 }`, `imprimir-ao-abrir.tsx`). e2e
  `acompanhamento-evolucao.spec.ts`, `mobile-layout-evolucao.spec.ts`; capturas `CAPTURAS=<pasta> … e2e/capturas-evolucao.spec.ts`
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
- **Próximo no Acompanhamento** (Gabriel, 19/11/2026): a gestão vem antes da área do mentorado, que fica por último.
  Bloco 1 (NPAC-56, venda vira mentorado + cargo Envios e aba Envios físicos): spec
  `docs/superpowers/specs/2026-11-19-acompanhamento-gestao-bloco-1-design.md`, plano `docs/plans/acompanhamento-gestao-bloco-1.md`.
  O Acompanhamento mexe no comercial quando precisar (G1, 19/11/2026). Partes 1 e 2 prontas (22 e 23/11/2026).
- **Venda vira mentorado** (NPAC-56, Parte 1, 0077; Eduarda 1A–5A): `insertSale` (`api/finance/finance.service.ts`) recebe
  `InscricaoDaVenda` (`api/mentoria/venda/inscricao-da-venda.ts`, exportado pelo `MentoriaModule` com o `AvisosScheduler`)
  e, se o produto tem `products.mentoria` (`RDV`/`2M`/`6M`; Admin > Produtos "Vira mentorado", "Não" = nulo; a 0077
  preencheu os de mentoria pelo código ou nome, como a 0066), cria a inscrição **na transação da venda** (G9): decifra o
  contato do lead (chave do comercial), cifra com a do Acompanhamento (AAD da pessoa) e chama
  `mentoria_inscricao_da_venda` (SECURITY DEFINER; só quem criou a venda, venda não estornada e sem inscrição): ONBOARDING,
  INDIVIDUAL, sem responsável, `data_compra` = dia de Brasília do `closed_at`, valor = total, forma Cartão/Pix/Boleto/Parcial,
  pessoa 1 com nome, WhatsApp, e-mail e Instagram, as 6 etapas, histórico `inscricao.criada_pela_venda` e auditoria
  `mentoria.inscricao_da_venda` (sem nome nem e-mail). Falhou: 409 "Não foi possível criar o mentorado no Acompanhamento.
  Tente de novo; se continuar, avise a liderança." e a venda inteira volta (o log leva só o código do erro). Vale para
  `POST /finance/deals` e o cadastro em Venda Fechada com a venda; o mesmo `requestKey` não duplica; vendas de antes da 0077
  não viram (M2); pessoa já mentorada ganha outra inscrição (M3). Depois do commit, `avisos.rearm()` (venda e estorno).
  `mentoria_inscricoes.deal_id` **sem FK** (a FK travaria o `truncate deals` dos testes; venda não se apaga), único quando
  não nulo; só o banco grava (gatilho `mentoria_inscricoes_venda_guarda`, que também recusa mudar `status_financeiro` de
  inscrição com venda: 400 "A situação do pagamento vem das parcelas do comercial"). **Estorno** (gatilho
  `deals_mentoria_estorno`): a inscrição vira CANCELADO (pausa aberta fecha no dia), nada é apagado, histórico
  `inscricao.cancelada_pelo_estorno` e auditoria. **Situação do pagamento** `mentoria_status_financeiro(inscricao)`: sem venda
  a coluna; com venda QUITADO (nada em aberto), EM_ATRASO (parcela sem baixa vencida) ou EM_DIA; nulo para quem não vê. Ficha
  e CSV leem por ela; a ficha traz `dealId`, mostra o selo "Veio da venda de DD/MM" e o Financeiro só leitura. **Fila**:
  `NOVA_INSCRICAO` (`nova-inscricao:<inscrição>`, inscrição com venda sem responsável e não cancelada; só de quem é Admin,
  `SO_ADMIN` em `sh/mentoria/fila.ts`; o painel tem o seletor "Responsável" e "Já tem inscrição: <mentoria>, <status>"
  pelo índice cego, `jaTem` no DTO) e `VENDA_ESTORNADA` (`venda-estornada:<inscrição>`, CANCELADO com o histórico do estorno;
  da responsável ou do perfil; sai com "Visto", `FILA_FEITO_MANUAL`). Push: nova à Admin (selo; sem nenhuma, a Diretoria) e
  estornada à responsável, uma vez cada (`mentoria_avisos_candidatos`). O closer só executa a função: não lê o módulo (404
  na ficha). Testes: `db/test/mentoria-venda.test.ts`, `fila-equivalencia` (bloco NPAC-56), `api/test/mentoria-v2-venda.e2e.test.ts`,
  `e2e/acompanhamento-venda.spec.ts`. Venda de RDV/2M/6M nos testes do comercial agora também cria inscrição.

- **Envios físicos** (NPAC-56, Parte 2, 0078; protótipo aprovado pelo Gabriel, "A", capturas em
  `docs/acompanhamento/prototipo/envios/`): cargo **Envios** (perfil `ENVIOS` no Acompanhamento, a Maria; `sh/cargos.ts`,
  convidado pela Admin do módulo na aba Perfis) que **não lê nada pela RLS**: tudo por funções SECURITY DEFINER. Lista
  `mentoria_envios_lista(agora)` (nomes, endereço cifrado, CEP, foto só do presente ainda não entregue; a gestão vê só o que
  a RLS dela deixa) e escrita `mentoria_envio_marcar(inscricao, tipo, envio, version, status, data, rastreio, agora)`
  (advisory lock, 409 por versão, mensagens em português, histórico só com nomes de campo); as duas e o push leem a interna
  `mentoria_envios_calc`. Entram sozinhos: a **Caixa** quando a etapa está pendente e o formulário do endereço foi marcado
  (ou a Boas-vindas dispensada), o **presente da família** quando a foto da família chega; Caixa e presente sem linha vêm com
  `id` nulo e versão 0 e ganham a linha na primeira marcação (ler não grava). Kit e certificado: "Novo envio" da gestão
  (`POST mentoria/envios`, Admin, Acompanhamento e Operação). A Caixa entregue conclui a etapa CAIXA (gatilho
  `mentoria_caixa_segue_envio`, também pelo `PUT …/caixa` do Onboarding). Entregues somem depois de 30 dias. API
  `envios.controller.ts` (`GET mentoria/envios`, `POST mentoria/envios/marcar`); fora disso, de `mentoria/eu` e da foto do
  presente (`mentoria_envio_foto_ve` na política de `mentoria_midia`), o cargo recebe 404 (o `PADRAO` do `PerfilGuard` não
  inclui ENVIOS). Web: `/acompanhamento/envios` (`components/acompanhamento/envios.tsx`, `soEnvios`/`veEnvios` em
  `lib/acompanhamento.ts`): o cargo entra direto nela (`/acompanhamento` redireciona), menu, barra do celular e Mais só com
  ela, sem a busca do topo; a gestão vê "Abrir ficha" e "Novo envio". Fila: `ENVIAR_CAIXA` vai ao perfil Envios quando há
  alguém ativo nele (`mentoria_tem_envios()`), senão à Operação; push "Tem envio para hoje" às 8h (`envios:<dia>`, a quem é
  Envios, havendo algo a enviar; `ENVIOS_PAYLOAD` no `avisos.scheduler.ts`). Testes: `db/test/mentoria-envios.test.ts`,
  `fila-equivalencia` (bloco Parte 2), `api/test/mentoria-v2-envios.e2e.test.ts`, `e2e/acompanhamento-envios.spec.ts`.

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
não muda nada não soma) em `leads`, `lead_tasks`, `lead_timeline`, `chat_*`, `notifications`, `meetings` e `deals` (as duas últimas mudam o que
o closer vê). `RevisionService` lê `n`
com um temporizador de 2 s por processo (não por aba) e qualquer escrita vira `invalidate` para todas as abas; a sessão é
conferida ao abrir e a cada 10 s (`heartbeat`). `/api/me` traz `revision`; o layout a passa ao `LiveUpdates`, que abre
`/api/events?rev=`: igual à atual sai `ready` (a aba não recarrega: ficha, lista e Pipeline não carregam duas vezes),
diferente ou ausente sai `invalidate`. Tabela nova que deva avisar a tela: o mesmo gatilho na migration. Não
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
- **Regra única de quem gerencia quem** (NPAC-54, Fase 2, 0073): função pura `podeGerenciar` em `sh/areas.ts`
  (`@npac/shared/areas`, sem zod) e a gêmea em SQL `area_regra`, que rodam o **mesmo arquivo de casos**
  (`packages/shared/test/areas-casos.ts`, nos testes `shared/test/areas.test.ts` e `db/test/areas-regra.test.ts`, que
  compara veredito e frase): mudou uma, mude a outra e os casos. A Diretoria (Mestre) faz tudo, menos mexer no próprio
  cargo; o Head de cada área (Head do Comercial; Admin do Acompanhamento) vê e gerencia só as contas com vínculo na área
  dele, convida e aprova com cargo dessa área, **nunca dá nem tira Head/selo** (D9), não mexe em outro Head e, em conta com
  duas áreas, só troca o cargo da área dele (senha, MFA, desativar e e-mail só a Diretoria, M5). Pôr ou tirar área e dar
  Diretoria: só a Mestre. Respostas: invisível 404, enxerga mas não pode 403 com o motivo (`MOTIVO`), o próprio cargo 400.
  Na API: `admin/areas.ts` (`lerContas`/`lerConta` por `area_contas()`, `aplicar`, `definirMembro`/`removerMembro`/
  `definirMestre`, que auditam `area.membro.definido`/`removido`/`area.mestre.definido` com área, cargo e Head) e a guarda
  `@Gerente()` (Diretoria ou Head de alguma área; comercial sem isso 403, Acompanhamento sem o selo 404) em
  `admin/users` e `admin/access-requests`; transferir leads continua do comercial (`admin:manage`). No banco,
  `area_definir_membro`, `area_remover_membro`, `area_definir_mestre`, `area_gerencia` e `push_purge_user` decidem por
  `area_decidir` (regra com quem está logado). A API não grava mais `user.role`: conta nova é INSERT + `area_definir_membro`;
  troca de cargo vai pelas funções. `GET admin/users` traz `mestre`, `areas` (o Head vê só as da área dele) e `outraArea`;
  `/api/me` traz `mestre` e `areas`, e `modules.mentoria` vem do vínculo. Na RLS, `app_role()` devolve `'HEAD'` para
  DIRETOR (0021).
- **Registro de acessos** (D10, D11): `GET admin/acessos?page=` (`admin/acessos.ts`), só a Diretoria (demais 404), 20 por
  página, lido do `audit_log`: conta criada, pedido aprovado/recusado, cargo, Head/selo, área posta/tirada, Diretoria,
  senha, MFA, desativar/reativar; cada linha com `tipo`, `ator`, `alvo` (nomes lidos da conta na hora), `area`, `cargo`,
  `head`. Logins e o resto da auditoria ficam fora. `admin.user.update` com `registro: 2` (desde a Fase 2) só entra se
  mudou `ativo`; o cargo vem de `area.*`. Tela (Fase 3, opção 2A, D13): quadro "Acessos" no topo de Admin → Usuários, só
  a Diretoria, 5 linhas + "Ver tudo" (janelinha paginada) + "novo" (cookie `npac_acessos_<hash>`, `Path=/admin`, só o maior
  id visto); frase montada por `fraseAcesso`/`quandoAcesso` (`sh/acessos.ts`, tipos `Acesso`/`TIPOS_ACESSO` também lá).
  A Diretoria filtra a Equipe por área ("Comercial | Acompanhamento | Todas", lembrado em `npac_f_admin_*`).
- **Equipe por área na tela** (NPAC-54, Fase 3, 19/11/2026, D13 = "1A, 2A, 3A"): a aba Perfis do módulo
  (`components/acompanhamento/perfis-admin.tsx`) é a equipe do Acompanhamento pelas rotas `admin/users` e
  `admin/access-requests` (o Admin do módulo é o Head da área): "Convidar" no topo da página abre janelinha (campo
  "Perfil"), pedidos de acesso só do Acompanhamento, perfil por `PUT mentoria/perfis`, "Nova senha" e
  "Desativar"/"Reativar" na linha; o interruptor de Admin só para a Diretoria. A tela esconde o que `podeGerenciar` recusa e
  mostra a frase da regra; quem decide é a API. **"Entrou há X"** (D12, M12): `user.ultimo_uso` (0074), gravado pela
  `SessionGuard` via `UltimoUso` (`api/auth/ultimo-uso.ts`: no máximo 1 gravação a cada 15 min por pessoa e instância, e o
  UPDATE confere a data no banco); `user` fica fora do canal ao vivo; o Sair não apaga. Vem em `GET admin/users` como
  `ultimoUso`; frase `entrouHa` (`sh/acessos.ts`, dias de calendário de Brasília). e2e `e2e/acesso-por-area.spec.ts`.
- **Alcance "Só a carteira"** (NPAC-54, Fase 3B, 19/11/2026, 0075; Gabriel aprovou formulário, textos e (a)–(e)): no
  cargo Acompanhamento sem o selo, `area_membros.alcance` = `TODOS` (padrão, igual a antes) ou `CARTEIRA` (só as
  inscrições em que a pessoa é `responsavel_id`). Não é cargo novo: o perfil continua `ACOMPANHAMENTO` (guardas `@Perfis`,
  responsável, transferência e catálogos iguais). Grava pela regra única como troca de cargo: `area_definir_membro(…,
alcance)` (5 argumentos; a de 4 mantém o alcance), por convite, aprovação, `PATCH admin/users` e `PUT mentoria/perfis`
  (campo `alcance`; "Só a carteira" em outro cargo = 400); trocar o cargo ou dar o selo volta a `TODOS` (gatilho
  `area_membros_alcance` + CHECK). Recorte só no banco: `mentoria_so_carteira()`, `mentoria_ids_carteira()`,
  `mentoria_carteira_ok(inscricao)`; `mentoria_ve_todas()` exclui quem tem "só a carteira"; as políticas que liam
  `mentoria_ids_especialista()` leem `mentoria_ids_visiveis()` (Especialista + carteira); reuniões, tarefas, metas,
  check-ins e histórico do semáforo ganham `OR inscricao_id = any (carteira)`; funções por linha, semáforo, pausar,
  retomar, excluir reunião e sequência de check-ins recortam. Ela cria inscrição só com ela de responsável e não troca o
  responsável (política da inscrição; API força no cadastro e dá 403 na troca; ficha `pode.responsavel`). Fila só "Minha"
  (API força `escopo`), CSV só da carteira (RLS), push "a todos do perfil" sem ela (`mentoria_destinatarios`,
  `mentoria_avisos_candidatos.acomp_todos`), inscrição tirada da carteira some na hora. `GET mentoria/eu` traz
  `soCarteira`; `admin/users` e `/api/me` trazem `alcance`. Tela (desenho A, Gabriel 19/11): "Acessos" com as tags de
  escolha única "Carteira" / "Todos os mentorados" na aba Perfis (linha, Convidar, pedido; `.acessos`/`.acesso-tag` em
  `modulo.css`); nas listas, o selo "Acompanhamento" e a tag neutra "Carteira" ao lado (`.role-TAG`, `CargoTag`); no quadro
  "Acessos", a frase do cargo com a tag (`FraseAcesso.tag`). Nunca "Acompanhamento · só a carteira" (reprovado). Extras por pessoa
  (ex.: Envios) ficam para quando houver o primeiro extra real. Rótulos e regra pura em `sh/alcance.ts`
  (`@npac/shared/alcance`, fora de `cargos.ts` pelo peso de `/leads`). Testes: `db/test/carteira.test.ts`,
  `api/test/carteira.e2e.test.ts`, `e2e/acompanhamento-carteira.spec.ts`.
- **Pessoa em duas áreas** (NPAC-54, Fase 4, 19/11/2026): só a Diretoria põe, troca ou tira alguém de uma área, por
  `PUT admin/users/:id/areas/:area` (`{ cargo, head? }`; `head` só no Acompanhamento, ausente mantém) e
  `DELETE admin/users/:id/areas/:area` (`definirArea`/`removerArea` em `admin/users.ts`; a última área não sai, 400). O
  Head recebe 404 na conta que não enxerga e 403 "Só a Diretoria põe ou tira alguém de uma área" na que enxerga.
  `PATCH` com cargo (`role`/`perfil`/`moduloAdmin`/`alcance`) de conta com duas áreas: a Diretoria recebe 400 (usa a
  rota por área; dar Diretoria e as caixas "Atua como" seguem pelo `PATCH`); o Head troca o cargo da área dele pelo
  `PATCH` (Comercial) ou pela aba Perfis (M5). O módulo é aberto pelo **vínculo**, não pelo resumo `role`:
  `MentoriaGuard` e `PerfilGuard` leem `lerAcesso` (`perfil.guard.ts`: perfil, selo, carteira e `membro` = Diretoria ou
  vínculo no Acompanhamento, uma consulta por pedido, guardada em `req.mentoriaAcesso`); o MFA do módulo (`session.guard.ts`)
  consulta o mesmo só em rota com `@RequiresMfa`, sem autenticador e com `MFA_LIGADO`. Rotas do comercial seguem pelo
  resumo (cargo comercial), sem consulta nova. Web: `modules.mentoria` (do vínculo) decide menu, `/`, Mais, 404 e o aviso
  de MFA (`precisaMfa`); quem tem as duas áreas navega como a Diretoria (menu do comercial + Acompanhamento) e cada tela de
  entrada leva à área dela. No Admin da Diretoria (`components/areas-conta.tsx`): "Adicionar a outra área" (select com
  os cargos da área que falta), numa conta com as duas um campo Cargo por área, o selo e "Tirar de uma área"; as
  etiquetas mostram o cargo de cada área. e2e `apps/api/test/duas-areas.e2e.test.ts`, `e2e/duas-areas.spec.ts`.
- **Fonte do cargo = `area_membros`** (NPAC-54, Fase 1, 0072; plano `docs/plans/acesso-por-area.md`, spec
  `docs/superpowers/specs/2026-11-19-acesso-por-area-design.md`): uma linha por (pessoa, área `COMERCIAL`/`ACOMPANHAMENTO`,
  cargo, `head`); a Diretoria é `user.mestre` (sem linha). Comercial: cargo SDR/CLOSER/HEAD, `head` = HEAD. Acompanhamento:
  cargo = perfil (nulo = "falta perfil"), `head` = selo de Admin. **`user.role` é resumo** calculado por gatilho
  (`area_sincronizar`: mestre → DIRETOR, senão o cargo comercial, senão ACOMPANHAMENTO; acerta as caixas de SDR, Closer e
  Acompanhamento). `app_role()`, `mentoria_perfil()`, `mentoria_perfil_de()`, `mentoria_admin()`, destinatários do push e
  aviso de formulário leem da fonte, com o mesmo resultado (`db/test/areas-equivalencia.test.ts`). Escrita só por
  `area_definir_membro`, `area_remover_membro`, `area_definir_mestre` (`area_gerencia` responde "pode mexer na conta"),
  com a regra única (item acima). Invariantes no commit: conta ativa que não é Diretoria tem
  vínculo; sempre uma Diretoria ativa. **Compatibilidade até a Fase 5**: escrita em `user.role` (API de hoje, seeds,
  testes) é traduzida para o vínculo (um cargo por pessoa, como antes); `mentoria_perfis` é visão (npac_app só lê; o dono
  do banco grava por ela) e `mentoria_definir_perfil` chama `area_definir_membro`. Coluna `mestre` só pelas funções.
- **Cargo em um passo** (11/11/2026, spec `docs/superpowers/specs/2026-11-11-cargos-design.md`): no
  Admin, um campo "Cargo" agrupado (Comercial: SDR, Closer, Head, Diretoria; Acompanhamento:
  Acompanhamento, Operação, Especialista, Mentor, Envios). Rótulos, dicas e o mapa cargo ↔ (`role`, perfil) em
  `sh/cargos.ts` (`@npac/shared/cargos`, sem zod); regra pura `resolverCargo`, aplicada por
  `api/admin/cargo.ts` em convite, aprovação de pedido e PATCH (mesmo schema `sh/schemas/account.ts`).
  Cargo do Acompanhamento grava `role = ACOMPANHAMENTO` + perfil (`mentoria_definir_perfil`) na mesma
  transação; sem perfil, 400. Sair do cargo apaga o perfil. "Atua como SDR/Closer" (`can_prospect`/
  `can_close`) só para Head/Diretoria (sem vir, mantêm o que tinham); SDR `t/f`, Closer `f/t`,
  Acompanhamento `f/f`, fixos pelo cargo (caixa contrária: 400) e por `CHECK user_cargo_caixas` (0049).
  `GET /admin/users` traz `perfil`/`moduloAdmin` para a Diretoria e o Admin do Acompanhamento. A aba Perfis do módulo
  troca perfil (`PUT /mentoria/perfis` recusa `null`) e, desde a Fase 3 do NPAC-54, convida, aprova e desativa; "Peça ao
  Admin" fica para conta antiga sem perfil (selo "falta perfil"). O selo aparece como "Admin do Acompanhamento".
- Liderança vê tudo; SDR, os próprios leads; CLOSER, leads com reunião não cancelada dele ou
  que o SDR lhe passou em Agendou Pagamento (`leads.closer_id`; também depois, como venda a registrar, NPAC-68).
  Invisível e inexistente → **404**, nunca 403. `canProspect`/`canClose` são dados; nada depende de nomes.
- **SDR não recebe R$ de venda** (pedido do cliente, 04/11/2026): `/reports/search`, `/reports/summary`
  e `/team` cortam no servidor (`dropSales`), o lead vem sem valor e entrada (`toDTO`) e
  `/finance/products` sem preço; o Dashboard do SDR mostra comparecimento. Closer igual a
  antes; liderança vê venda + comparecimento, com filtro por SDR. Vendas e pagamentos (ficha,
  cobranças do Hoje, `sale:register`) são do closer e da liderança; o SDR marca o resultado da reunião
  e, depois dela, a venda só com o produto (NPAC-48, abaixo em "Marcar venda"). A renda extra do SDR
  (`saleBonus`) é renda dele, não R$ de venda: o SDR vê só a dele; a liderança vê a de todos.
  **Vendas na visão do SDR** (NPAC-51, Igor 18/11/2026, "1A"): para o papel SDR a venda conta assim que
  ele marca, na data da marcação, sem esperar o closer pôr o valor (`sdrSales` em `reports.service.ts`
  troca `metrics.sales` e a coluna Vendas de Por SDR/Por closer, Funil e Pré-vendas). Uma por lead:
  marcação ativa vale pela venda dela; venda registrada sem marcação conta no dia da venda. Closer =
  o da reunião da marcação. Liderança e closer seguem contando só a venda registrada (`deals`).
  Relatórios do SDR mostra o card "Valor a receber por venda feita"; o resumo copiado e o CSV do
  período levam Vendas e esse valor. **Vendas a registrar anteriores à 0066** (Gabriel, 18/11/2026,
  "1B"): a 0067 deu a cada uma a marcação que faltava (SDR do lead, produto informado, reunião
  realizada mais recente, renda extra do catálogo de hoje, data do `sale.pending` da timeline); venda
  já registrada e lead sem produto ficaram de fora (`db/test/renda-extra-vendas-antigas.test.ts`).
- Login por **usuário** (`/sign-in/username`, `[a-z0-9_.]{3,30}`, minúsculo); login por e-mail e
  `/is-username-available` desligados. Senha mínima 3 (provisório, decisão de 29/10/2026: no dev
  todas são `123`; as regras voltam no fim).
- **Pedido de acesso** (29/10/2026): `/login/solicitar` grava em `access_requests`, fora de `user`
  (pendente não loga). Quem aprova escolhe o cargo (regra única: a Diretoria vê todos e aprova em qualquer área; o
  Head de cada área vê e aprova só os da área dele, com cargo dessa área, M9);
  recusar apaga; expira em 7 dias; 3/hora por IP; resposta igual exista ou não o usuário (hash
  sempre, para o tempo não revelar). Guarda a **área** da tela (`access_requests.area`, 0068: `COMERCIAL` por
  `/login/solicitar`, `ACOMPANHAMENTO` por `/login/acompanhamento/solicitar`; `ACCESS_AREAS` em `sh/enums.ts`) e o
  Admin mostra a etiqueta (os do Acompanhamento aparecem também na aba Perfis do módulo, NPAC-54 Fase 3). A liderança segue redefinindo a senha no Admin;
  Diretoria trancada: `reset-password-cli.js <usuário> [--mfa]` no shell da api (`db/src/reset-password.ts`).
- **Esqueci minha senha por e-mail** (NPAC-50, 18/11/2026, plano `docs/plans/pedidos-18-11.md`, Fase 2):
  `/login/esqueci` (usuário ou e-mail) → `POST /api/auth/forgot-password` → e-mail "Crie a sua senha nova"
  com o botão "Criar senha nova" e `/login/nova-senha#t=<token>` (fragmento: não vai a servidor nenhum; sem
  e-mail ou usuário no link) → a tela confere o link ao abrir (`POST …/forgot-password/check` → usuário, para
  "Para o usuário ana", ou "Link vencido") → `POST /api/auth/forgot-password/reset` troca a senha, apaga `must_change_password`, derruba **todas** as
  sessões e devolve o usuário, e a tela entra pelo login normal (`signIn.username`, mesma auditoria e TOTP).
  Plugin `api/auth/password-reset.ts`: resposta igual e com piso de 400 ms exista ou não a conta; 3/hora por IP
  (rate limit da rota) e por conta (linhas `npac-reset:` em `verification`, advisory lock); link de uso único
  (DELETE … RETURNING), 1 h, só o SHA-256 no banco; trocar a senha mata os outros links da conta; conta
  desativada não recebe nem usa link; auditoria `auth.password_reset.requested`/`auth.password_reset` sem
  e-mail. `/request-password-reset` e `/reset-password` do Better Auth ficam em `disabledPaths`. Sem envio
  configurado, `GET forgot-password/status` diz `enabled: false`, o POST dá 404 e a tela manda pedir à liderança.
  Telas e textos seguem o protótipo do canvas "Login da equipe" (linha "Esqueci minha senha (fase 2)", 4 telas);
  "Enviar de novo" libera 1 minuto depois de cada envio. "Link vencido" e o aviso sem SMTP não estão no protótipo.
- **Envio de e-mail** (`api/mail/*`): `MailSender` (`MAIL_SENDER`, módulo global) com SMTP pelo nodemailer;
  variáveis `SMTP_HOST`, `SMTP_PORT` (465 = TLS; 587 = STARTTLS), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (Zod em
  `api/config/env.ts`; `MAIL_FROM` obrigatória com host; usuário e senha juntos). Gmail do sistema hoje
  (temporário, "2C"); Resend, SES ou Brevo = trocar as cinco variáveis. Sem `SMTP_HOST`, desligado. Envio sem
  `await` depois da resposta; `send` nunca lança e loga `e-mail enviado: <host>` ou `e-mail não enviado: <código>
<host>`, nunca destinatário ou texto. E-mail só com o primeiro nome (`mail/templates.ts`). Testes: `MemoryMailSender`
  em `test/helpers.ts`; caixa falsa SMTP+HTTP `scripts/caixa-falsa.mts` (`pnpm mail:caixa` no dev: SMTP 2525,
  mensagens em `http://localhost:2526/mensagens`), que o e2e sobe na porta da API + 25/26 (`e2e/esqueci-senha.spec.ts`).
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
  (`mentoria_perfis`: Acompanhamento, Operação, Especialista, Mentor, Envios) e o selo de Admin decidem o resto, por RLS
  (`mentoria_ve`, `mentoria_edita`; Diretoria é Admin sem linha). Cargo sem perfil vê "Peça ao Admin" e Mentor vê
  "Seu painel chega em breve", sem menu (`components/acompanhamento/sem-acesso.tsx`, no layout de `(app)`); API 404 em tudo menos
  `mentoria/eu`. MFA obrigatório nas rotas `mentoria/*` para quem usa o módulo (Diretoria ou vínculo no Acompanhamento), 404 para os demais. O cargo não vê nada do comercial
  (05/11/2026): `PermissionsGuard` dá 404 em toda rota sem `@AllRoles()` (`api/auth/all-roles.decorator.ts`;
  hoje `me`, `events`, `push` e o módulo), e o web mostra só as abas do módulo (`hasCommercialAccess`,
  sidebar/Ctrl+K/Mais/rodapé). Telas comerciais ficam em `web/app/(app)/(comercial)/`, cujo layout
  manda o cargo ao módulo com carga completa (o layout de `(app)` não roda na navegação do
  navegador; redirect do servidor ali deixava o módulo em branco). Entrada única: login, troca de
  senha e MFA vão para `/`, que escolhe o destino pelo cargo; a tela do Acompanhamento manda para
  `/?area=acompanhamento`, que leva ao módulo quem o vê (Diretoria cai na Fila) e os demais à tela do cargo. Rota nova que o cargo use leva
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
  Datas (18/11/2026, print da Eduarda): campo de data do módulo leva `min={DATA_MIN}`/`max={DATA_MAX}` (`sh/mentoria/datas.ts`,
  1900 a 2999, a faixa da API); sem eles o Chrome aceita ano "25" (0025) ou de 6 dígitos e a API recusava. `CampoPr` de data
  confere antes de enviar (`DATA` em `campo.tsx`, aviso `AVISO_DATA`); no cadastro o aviso de erro sai quando a pessoa mexe num campo.
  e2e `e2e/acompanhamento-datas.spec.ts`.
  **PMEs e ciclos** (Fase 2, Parte 1, 11/11/2026): cada PME dura 30 dias do envio (`prazo` e `data_cobranca` são colunas
  geradas); o envio (`POST inscricoes/:id/ciclos`, Admin, Acompanhamento e Operação, área `PME` de `mentoria_edita`) cria o
  ciclo do número seguinte (1 a 12) com uma tarefa EXTRA por atividade do catálogo e uma ENCERRAMENTO (texto cifrado; sem texto
  no catálogo, "Encerramento do Nº PME"); só ATIVO, antes do término; ciclo aberto vira `nao_concluido_em`; o 1º preenche
  `pme1_enviado_em`, e o "Enviado" do 1º PME na Fila também abre o ciclo 1. Status derivado em `mentoria_ciclo_status(concluido,
nao_concluido, prazo, hoje)`: aberto = em andamento com "N dias de atraso" (do `MENTORIA_CLOCK`); não concluído só com o
  seguinte enviado. Encerramento FEITA fecha o ciclo por gatilho; voltar reabre (recusa se o seguinte já saiu). Ciclo anterior ao sistema
  (`ciclos/anterior`) sem tarefas, fecha à mão (área `TAREFA`). Marcar tarefa (resultado, motivo só em parcial/não feita,
  comprovante foto/vídeo/PDF em `tarefa-comprovante/:id/midia`): Admin e Acompanhamento; Especialista só as REUNIAO das próprias
  reuniões (`mentoria_ve_tarefa`/`mentoria_edita_tarefa`); Operação envia mas não marca. Até 3 tarefas por reunião (gatilho, para a
  Parte 2). Pausa não estica o prazo do PME (pergunta aberta à Eduarda).
  **Metas e tarefas da reunião** (Fase 2, Parte 2, 12/11/2026): metas (`mentoria_metas`, casal ou de uma pessoa, pilar, alvo/atual
  `numeric`, unidade, prazo, descrição cifrada) leem Admin, Acompanhamento e Operação (`mentoria_ve_meta`); escrevem Admin e
  Acompanhamento (área `META`); a **Especialista não vê metas**. Meta nasce no ciclo aberto (se houver). Status da meta (E10,
  Parte 3): ATINGIDA, NAO_ATINGIDA ou nulo (sem marcação; sem "Em andamento"), nunca num %. **Sem exclusão de meta ou tarefa**
  (não está na spec; pendências no plano da Fase 2, Parte 2). Registro da reunião:
  "Cobrança da reunião anterior" (tarefas REUNIAO da última reunião REALIZADA antes desta, entre as que quem abre vê), "Tarefas da
  semana" (até 3, prazo obrigatório, meta opcional, entra no ciclo aberto) e "Metas definidas ou ajustadas"; os textos da Fase 1
  continuam. Só a tarefa REUNIAO muda texto, prazo e meta; reunião com tarefa/meta não se exclui (a FK apagaria as tarefas).
  Vínculos (ciclo, reunião, pessoa, meta) da mesma inscrição por gatilho. % do PME (E5, `mentoria_pct_tarefas`, `SECURITY
DEFINER`, a Especialista vê o número inteiro): só tarefas FEITA ÷ total do ciclo (PARCIAL não conta). Metas não viram número
  único (pendente com a Eduarda): cada meta com alvo tem a própria barra (`pct` na leitura); sem alvo (S4), nenhum %. Ficha >
  Jornada: card do PME (extras e encerramento + barra de tarefas), Tarefas (as da reunião por PME) e Metas.
  **Layout** (achados de design de 17/11, plano `docs/plans/achados-design-17-11.md`, Fase 2): meta é um resumo (descrição,
  pilar, prazo, barra); "Editar" abre os campos, uma meta por vez, e "Pronto" recarrega quando a fila de salvamento esvazia
  (`metas.tsx`). Plano > Esta semana: lista vazia vira uma linha e as Atrasadas ficam na coluna larga. Quem veio de antes do
  sistema não vê os seis passos do onboarding, só o aviso. Perfis tem títulos de coluna (o interruptor guarda o rótulo inteiro).
  **Check-in e semáforo** (Fase 2, Parte 3, 18/11/2026, spec E9–E16 e §5): check-in (`mentoria_checkins`) lançado na ficha por Admin
  e Acompanhamento (área `CHECKIN`), um por semana (segunda a domingo de Brasília; `semana` = coluna gerada do `enviado_em`);
  `respondeu` ⇔ `respondido_em`; avanço, o que travou e próximo passo cifrados; Operação lê; **a Especialista não vê check-in nem
  semáforo**. Semáforo só ATIVO, em SQL (`mentoria_semaforo_calc`, interna; `mentoria_semaforo(inscricao, dia)` para a API, nada
  para quem não é Admin/Acompanhamento/Operação): `CHECKIN_1/2` = a última/as 2 últimas semanas encerradas sem check-in
  respondido (enviado ou não); `TAREFA_1/2` = a última/as 2 últimas tarefas **da reunião** vencidas (prazo < hoje) NAO_FEITA ou
  PENDENTE; `PME_7/15` = atraso do ciclo aberto contado do prazo atual. Pior cor; sem motivo, verde. **Conta só da entrada no
  ar**: `mentoria_semaforo_inicio.desde` (a 0069 grava o dia em que roda, cada ambiente o seu); semanas válidas começam depois
  dele e do início da jornada; tarefas com prazo a partir dele; o atraso do PME conta de `greatest(prazo atual, desde)`. Testes
  mudam `desde` e restauram. Histórico (`mentoria_semaforo_historico`, só `mentoria_semaforo_gravar(hoje)`, idempotente): o
  `AvisosScheduler` grava em todo disparo e arma o timer também para a segunda 00:00 de Brasília. Sequência de semanas com
  check-in: `mentoria_sequencia_checkins`. **Segunda chance** (E15, E16): `PATCH ciclos/:id {segundaChanceAte}` (área
  `SEGUNDA_CHANCE`: Admin e Acompanhamento; o gatilho barra a Operação), só no ciclo aberto, depois do prazo e não antes de hoje
  (a tela sugere hoje + 7); status `SEGUNDA_CHANCE` ("Segunda chance até DD/MM") enquanto vale, depois "Em andamento" com o
  atraso do novo prazo; histórico `pme.segunda_chance`. Mentorados: PME atual, semáforo e % do PME, filtro por semáforo
  (lembrado). Amarelo do semáforo é token novo (`--tag-warn`, `--sem-amarelo` em `modulo.css`). Pendências no plano.
  **Fila da cobrança** (Fase 2, Parte 4, 18/11/2026, spec E17–E22 e §6; 0070): `COBRANCA` (`cobranca:<tarefa>`) = tarefa
  PENDENTE com prazo ≤ hoje (qualquer origem), do responsável pela inscrição ou, na reunião conduzida por Especialista ativa,
  dela; sai com o resultado; push às 8h do dia do prazo, só nele. `SEMAFORO` (`semaforo:<inscrição>:<segunda>`) = ATIVO em
  amarelo/vermelho, do responsável; sai no verde ou com "Visto nesta semana" (`fila_feitos` da semana); vermelho = atrasado;
  push só vermelho, 1x por semana por mentorado (`semaforo-vermelho:…`), não depois do visto; Especialista não recebe.
  `ENVIAR_PME` (`enviar-pme:<ciclo>`) = ciclo mais recente CONCLUIDO, < 12, ATIVO e antes do término, para a Operação; "Registrar
  envio" chama o envio; sem push. `PME_ATRASADO` (`pme-atrasado:<ciclo>:<prazo atual>:<degrau>`) = só o degrau mais alto
  (3, 7, 10, 15 dias do prazo atual; textos do PDF em `DEGRAU_LABEL`), do responsável; "Registrar contato" grava
  `mentoria_contatos.ciclo_id/degrau/degrau_prazo` (o gatilho põe o prazo atual; a API recusa antes do degrau) com o texto do
  degrau no motivo; segunda chance recomeça a escada; push 1x por degrau. Ação `FIM_PME` (3A, `mentoria_acao_data`, IMMUTABLE):
  ciclo do número do mês aberto = espera; fechado = data do `concluido_em`; sem ciclo ou NAO_CONCLUIDO = data da Fase 1; mês 2
  aparece com 15 dias de atraso do prazo atual (Fila e push; o Plano ainda mostra a data da Fase 1, pendência). O semáforo na
  Fila e no push vem de `mentoria_semaforo_lote(dia)` (uma chamada; `_lote_calc` interna = a conta da `mentoria_semaforo_calc`:
  mudou uma, mude a outra; `fila-equivalencia` compara). O despertador acorda também às 8h de todo dia. Aba 7 "PMEs e ciclos"
  (`/acompanhamento/pmes`, `POST mentoria/pmes-ciclos`): ATIVO com o ciclo mais recente, envio, prazo atual, status, % de tarefas,
  extras, encerramento e próximo PME; filtros por PME e status (lembrados, `PMES_REGRAS`); Admin, Acompanhamento e Operação
  (`mentoriaCiclos` no menu; Especialista 404); `/acompanhamento/em-breve/pmes` redireciona. CSV de Mentorados: PME atual, status
  do PME e semáforo (pelo dia de hoje de verdade, como o mês da jornada).
- **Siglas das mentorias** (Gabriel, 04/11/2026): RDV = Rico de Verdade · IDR = Introdução da
  Riqueza · PME = Plano Mensal de Enriquecimento · 2M = Marco e Mudança · 6M = sem definição ainda.
  Nas telas vale o texto literal do PDF, exceto IDR: "Introdução da Riqueza" (o PDF diz "à"; corrigido).
- Cookies em vez de localStorage: último usuário `npac_last_user` (`Path=/login`, vale nas duas telas de entrada); ordem dos cards
  `npac_dash_<hash do id>` (`Path=/dashboard`, só IDs, o servidor já renderiza na ordem); colunas
  ocultas `npac_pipe_<hash>` (`Path=/pipeline`; com texto buscado, a coluna oculta que tem resultado aparece marcada "Oculta" e, no celular, abre se a aberta ficou vazia, NPAC-64) e filtro do Hoje `npac_hoje_<hash>` (`Path=/hoje`),
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
  "Filtrar Hoje", "Buscar" do Pipeline, "Atualizar relatório"); a busca de Leads e do Pipeline roda ao digitar (NPAC-63, Igor 23/11/2026: 300 ms depois da última tecla, campo vazio na hora, Enter na hora; `useTypedSearch` em `lib/typed-search.ts`); "Limpar
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
- API com `Cache-Control: no-store` (o gancho de `app.setup.ts` só não sobrescreve rota que define o próprio: hoje só
  a foto do perfil, com a versão na URL). SSE só manda `{ type }`.
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
- **Marcar venda** (NPAC-48, Igor 16–17/11/2026, "4A, 5B, 1A, 2A"): depois da reunião realizada, o SDR
  do lead (ou a liderança; closer não, 403) usa `POST /leads/:id/sale-mark` `{ version, productId }`
  (`markSale` em `api/leads/lead-mutations.service.ts`; tela `components/sale-mark.tsx`, na última
  reunião realizada da ficha). Um produto por venda, do closer da reunião realizada mais recente (pelo
  horário); sem ela, 409 `MEETING_DONE_REQUIRED`; já em Venda, 409 `ALREADY_SOLD`. O lead vai para
  Venda como **venda a registrar** (`sold_product_id`), o closer da reunião vira o do lead (gatilho
  `leads_guard_owner_columns` da 0066 deixa o SDR só nesse caso) e recebe `sale.pending` (sino + push);
  ele põe o valor registrando a venda, como no cadastro. **Renda extra do SDR** (`sdr_sale_marks`, 0066):
  cada marcação guarda o SDR do lead, o produto e `bonus_cents` = `products.sdr_bonus_cents` do dia
  (valor editável em Admin > Produtos, "Renda extra do SDR"; mudar não altera o já ganho). O cadastro
  em Venda Fechada também grava a marcação (`recordSaleMark` em `api/leads/sale-mark.ts`). Conta na
  data da marcação (1A); sai (`canceled_at`, por gatilho) no estorno, quando o lead deixa a Venda ou é
  excluído. Leitura por RLS: o próprio SDR e a liderança; `npac_app` só SELECT/INSERT. Aparece no
  Dashboard como o balão preto "Valor a receber por venda feita" (card `sale-bonus`, o `RevenueHero` do valor
  por reunião, linha acumulada por `saleBonus.daily`; Igor, 17/11: "outro balão desse preto das reuniões
  realizadas, só que das vendas feitas"), pelo período de `/reports/search`: **cada SDR vê o dele (rodapé por
  produto); a liderança vê o de todos (rodapé por SDR, `bySdr`) ou do SDR filtrado** (Gabriel, 17/11/2026);
  o closer não recebe. Igor, 17/11 ("1A, 2B"): a renda segue o produto que o SDR marcou, mesmo que o
  closer registre outro; venda registrada direto pelo closer, sem marcação, não gera renda. Valores do Igor: Nação Promocional R$ 5, Padrão (Normal) R$ 10, Completo (Cheio) R$ 20,
  RDV R$ 70, 2M R$ 90, 6M R$ 120 (seed e 0066, por código ou nome).
  **Venda vinda de Agendou Pagamento** (NPAC-59, Igor 23/11/2026, "A"): pôr o lead em Agendou Pagamento com o
  produto já é a venda do SDR. Quem registra a venda (closer ou liderança, `POST /finance/deals`) grava a marcação
  (`recordPaymentSaleMark` em `api/leads/sale-mark.ts`, antes de limpar o pagamento): SDR do lead, produto do
  pagamento, reunião realizada mais recente, data e autor do registro. Sem reunião realizada ou com marcação ativa,
  nada. Registro direto de outra etapa segue sem renda (2B). A 0079 deu a marcação às vendas assim registradas
  desde 17/11 (produto da venda, porque o do pagamento some ao registrar; `db/test/renda-extra-agendou-pagamento.test.ts`).
  **SDR marca a venda de quem pagou** (NPAC-68, Igor 23/11/2026: "sem depender que somente o Closer faça"): em Agendou
  Pagamento, o SDR do lead (ou a liderança) usa o "Marcar venda" **ao lado do "Mover para"** (não mais no card Reuniões),
  já com o produto do pagamento. Mesmo `POST /leads/:id/sale-mark`: nessa etapa o closer da venda é o do pagamento
  (`leads.closer_id`; sem ele, o da reunião) e o produto tem de ser dele (400); a reunião realizada continua obrigatória
  (409 `MEETING_DONE_REQUIRED`; NPAC-65, 4.4B: nada automático). O `sale.pending` só leva a reunião como entidade quando o
  closer dela é o da venda (senão o aviso iria ao closer da reunião). Sem reunião realizada, a ficha mostra "Para marcar
  a venda, marque antes a reunião como realizada." e o link "A reunião já aconteceu" (leva ao card Reuniões com a caixa
  marcada). Nos selects de etapa da ficha do SDR, a Venda diz "(use “Marcar venda”)" ou "(depois da reunião realizada)"
  (`saleHint` em `stage-options-after-meeting.tsx`). A 0080 faz o closer do lead ver a venda a registrar (Venda sem venda
  ativa) mesmo sem reunião com o lead (`closer_has_lead`/`closer_lead_ids`). e2e `e2e/venda-agendou-pagamento.spec.ts`.
- **Campos por etapa** (NPAC-38, 05/11/2026, "1A 2A 3A"): Agendados pedem `meeting` (criada na
  mesma transação, origem pela etapa, `rearm()` depois do commit; reunião futura aberta dispensa),
  Agendou Pagamento pede data (`next_contact_at`) + produto + valor, Sem Perfil pede `lost_reason`
  (+ texto se Outro; limpa o próximo contato). 409 `MEETING_/PAYMENT_/REASON_REQUIRED` só quando a
  etapa muda; leads antigos ficam como estão. Sair da etapa ou registrar venda apaga pagamento e
  motivo. Closer grava esses campos só junto da troca (gatilho da 0037, refeito na 0039). Regra em `api/leads/stage-fields.ts`.
  **Agendou Pagamento só depois da reunião realizada** (NPAC-59, Igor 23/11/2026, "A": cadastrou → reunião → realizada →
  Agendou Pagamento → pagou): entrar na etapa pede reunião com resultado DONE e não cancelada (409
  `MEETING_DONE_REQUIRED`, "marque antes a reunião como realizada"; futura, sem resultado ou no-show não contam), para
  todos os cargos; quem já está nela fica (3A). `StageOptionsAfterMeeting` (`components/stage-options-after-meeting.tsx`,
  fora do `crm-ui` pelo limite de JS de `/leads`) desativa a opção só para o closer na ficha sem reunião realizada.
  **Reunião que já aconteceu na entrada da etapa** (NPAC-65, Igor 23/11/2026, 15:12: "para a pessoa agendar pagamento
  ela já realizou uma reunião"): sem reunião realizada, o SDR e a liderança informam ali mesmo a reunião passada
  ("A reunião já aconteceu": "Quando aconteceu (Brasília)", "Closer da reunião", "Origem do agendamento";
  `PastMeetingFields` em `stage-fields.tsx`), ao mover (ficha, Pipeline e lista; a janelinha busca `/api/meetings` para
  saber se já há realizada) **e no cadastro direto na etapa** (desfaz o "cadastro não entra" do NPAC-59). PATCH e POST
  `/leads` levam `meetingDone` (passado, até um ano; fora da entrada em Agendou Pagamento, 400; closer 403) e a reunião
  entra realizada na mesma transação (`logDoneMeeting` em `meetings.service.ts`, o mesmo do `POST /meetings/done`).
  Quem já está na etapa sem reunião não muda sozinho (4.4B): o SDR lança a reunião pela ficha. A pergunta "Teve reunião
  ou foi venda direta?" saiu: venda direta (só à vista, cartão ou boleto, direto para Venda Fechada) espera a resposta
  do Igor sobre quem põe o valor.
  **Reunião já realizada lançada depois** (NPAC-62, Igor 23/11/2026, "1A, 2A"): na ficha, a caixa "A reunião já aconteceu"
  (só o SDR dono do lead e a liderança; closer 403, quem não vê o lead 404) manda `POST /meetings/done` (`createDone` em
  `api/meetings/meetings.service.ts`): horário passado, até um ano atrás (400 fora disso), entra DONE com `outcome_at` =
  o horário, então o valor por reunião realizada conta no dia em que ela aconteceu (2A). Lead já em Venda com venda ativa
  vinda de Agendou Pagamento, fechada depois da reunião e desde 17/11, sem marcação: a renda extra entra agora
  (`recordLoggedMeetingSaleMark` em `api/leads/sale-mark.ts`, produto da venda, data da venda). e2e `e2e/reuniao-ja-realizada.spec.ts`.
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
- **Vendas a registrar no Hoje** (NPAC-51, Gabriel 18/11/2026): `salesToRegister` em `POST /today/search`
  (`api/today/today.service.ts`) lista os leads em Venda sem venda ativa, com o produto, para quem
  registra venda: o closer da venda (`leads.closer_id`) vê os dele; a liderança, os de todos (filtros de
  SDR e closer valem); o SDR recebe lista vazia. Bloco "Vendas a registrar" em `today.tsx`, só quando
  há item, com link para `/leads/<id>#vendas`. Sai ao registrar a venda ou quando o lead deixa a Venda.
- **Sair da Venda a registrar pede confirmação** (NPAC-51): `confirmLeaveSale` (`web/lib/leave-sale.ts`,
  `confirm()` nativo como no Admin) na ficha ("Mover para"), no Pipeline (arrastar) e no select da lista.
  Sair cancela a venda feita do SDR e apaga o produto. A ação em massa não pergunta.
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
  Login de conta desativada: 401 com o mesmo corpo da senha errada (gancho `session.create.before` em
  `api/auth/auth.ts` lança o erro do plugin `username`; `return false` ali vira 500).
- Fuso `America/Sao_Paulo`; `datetime-local` = Brasília (`brasiliaInput`); intervalos [início, fim);
  em `sql` cru, datas como ISO string.
- Métricas em SQL com CTEs que não multiplicam linhas; vendas contam por `deals`, não por etapa.
  Relatório por produto usa o nome atual do catálogo (`deals.product_name` guarda o da época).
- Paginação no servidor; CSV recusa > 10 mil linhas; cabeçalhos do CSV com `csvHeaders` depois de
  gerar o arquivo (com `@Header` fixo, erro de validação virava 500). Leads e Relatórios exportam por
  período, filtro atual ou tudo (`period: 'ALL'` só no CSV). `POST /reports/export` = relatório do
  período em CSV (resumo + por SDR/closer/produto, sem contato), para todos; SDR sem venda. As
  exportações dos Relatórios leem o formulário na tela, não o último "Atualizar".
- Ação de um clique (concluir na Fila, marcar feita no Plano, mover card no Pipeline): `useOptimistic` +
  `startTransition`, a tela muda no clique; erro desfaz e mostra a mensagem da API; sucesso chama `showToast()`.
  Ação nova do mesmo tipo segue o padrão.
- Erros da API em português para o usuário final (`BadRequestException('…')`); o `clientApi` mostra a
  mensagem, as padrão do Nest viram texto genérico. `clientApi` aceita 204.

## Meu perfil (NPAC-53, 18/11/2026)

Spec `docs/superpowers/specs/2026-11-18-meu-perfil-design.md`, plano `docs/superpowers/plans/2026-11-18-meu-perfil.md`,
protótipo no canvas "Meu perfil". Gabriel aprovou com "1A, 2A, 3A".

- `/conta/perfil` (`app/(app)/conta/perfil`, dentro da casca, todos os cargos): foto, nome (salva ao sair do campo,
  "Salvo"; 2–80 caracteres, `cleanProfileName` em `sh/profile.ts`, `@npac/shared/profile`, fora do índice), usuário só
  leitura, e-mail com código, senha recolhida ("Trocar senha" abre ali; `authClient.changePassword` derruba os outros
  aparelhos) e "Avisos neste aparelho". O cargo Acompanhamento vê as abas do módulo no celular. Tela `components/conta/perfil.tsx`.
- No menu, "Meu perfil" no lugar de "Trocar senha": rodapé da sidebar (foto, nome e cargo são o link), cartão do Mais
  (CRM e módulo) e Ctrl+K. `/conta/senha` só no primeiro acesso; sem troca pendente, vai para `/conta/perfil`.
- Foto: o navegador lê o arquivo como `data:` (a CSP de imagens só aceita `'self'` e `data:`), recorta em círculo
  (`components/conta/foto-recorte.tsx` por `next/dynamic`, matemática em `lib/crop.ts`; arrastar, setas, − / +) e manda
  256 px em WebP 0,85 (JPEG se o navegador não gerar WebP). `PUT /api/me/photo` (multipart, até 200 KB, tipo pelos bytes
  com `farejar`/`semMetadados`, nunca SVG), `DELETE /api/me/photo`. Banco: `user_photos` (0071, sem RLS como `user`,
  CHECK de tipo e tamanho) e a versão em `user.image`. `GET /api/users/:id/photo?v=` para quem está logado, com
  `private, max-age=31536000, immutable` e `nosniff`. `/update-user` e `/change-email` do Better Auth em `disabledPaths`.
- Foto dos outros: `GET /api/team/photos` → `{ photos: id → URL, names: nome único → URL }` (o feed da equipe só traz o
  nome; não mexer em `finance/`), lido por `getTeamPhotos()` (`lib/team-photos.ts`) e passado às telas. `Avatar`
  (`components/avatar.tsx`, sem `'use client'`) mostra foto ou inicial: sidebar, Mais, topo do módulo, Equipe, Dashboard
  e Relatórios (mesa, tabela por SDR, feed), Hoje (selo do closer; a sua com anel dourado), Chat (conversa e autor),
  Admin, Mentorados e Fila (responsável). `/api/me` e `/admin/users` trazem `photo`.
- E-mail: `POST /api/me/email/code { email }` → 6 dígitos no endereço novo (10 min, 5 tentativas, 3 por hora por conta,
  linhas `npac-email:`/`npac-email-sent:` em `verification`, advisory lock da conta; pedido novo invalida o anterior);
  `POST /api/me/email/confirm { code }` troca e avisa o endereço antigo (sem o novo). Em uso → 409 "Esse e-mail já está em
  uso." (não diz de quem). Sem `SMTP_HOST` (2A): as rotas dão 404 e o perfil mostra "Para trocar o e-mail, peça à
  liderança. Ela muda no Admin." Janelinha `components/conta/email-troca.tsx` (6 caixas sobre um campo, confirma no 6º).
- Auditoria `user.photo_set`/`photo_removed`/`name_changed`/`email_code_sent`/`email_changed`, sem nome, e-mail ou foto.
- e2e: `meu-perfil*.spec.ts` e `mobile-layout-perfil.spec.ts` (iPhone: nada sai da tela em 375/390/768/1024, também
  dentro de `overflow: hidden`, toques de 44 px e campos de 16 px); capturas `CAPTURAS=<pasta> … e2e/capturas-perfil.spec.ts`.
  Pendência anterior: Mentorados em 1024 com a sidebar aberta passa ~96 px (`test.fixme`).

## Avisos e lembretes (NPAC-26, 04/11/2026)

- Chat: selo de não lidas (`chatUnread` em `/notifications`) e `(N)` no título, pelo SSE. Push sem
  texto: "Nova mensagem no Chat" (Geral → todos menos o autor) ou "de <nome>" (DM → destinatário).
- Lembretes do dono do lead (`leads.sdr_id`): `H1` (60 min) e `M15` (15 min) com
  "Confirmação enviada" (`POST /meetings/:id/confirm`, `meeting_confirmations` por horário, timeline
  `meeting.confirmed`); `M1` só aviso. Etapa vigente calculada no navegador (`sh/reminders.ts`).
  Liderança vê "1 h: não confirmada" na ficha. Remarcar recomeça; cancelada/resultado não avisa.
  O **closer da reunião** (`meetings.closer_id`, NPAC-48, 17/11/2026) recebe só o push de `M15` e `M1`
  ("Reunião com X às HH:MM", `closerReminderPayload`), sem o pedido de confirmação; se for o próprio dono, um só.
- Push dos lembretes: `ReminderScheduler` = um único timer para o próximo (`meeting_reminder_next`),
  rearmado ao subir a API e depois de criar/remarcar/cancelar/resultado/transferir. Disparo via
  `meeting_reminder_claim` (advisory lock + `meeting_reminders_sent`; 0065 devolve `sdr_id` e `closer_id`,
  nulo se desativado): uma vez por etapa, só a mais recente se a API ficou parada. Sem polling. Testes
  trocam `PUSH_SENDER` e `REMINDER_CLOCK`.
- **Push do sino** (NPAC-48, Igor 17/11/2026: "cada um recebe os avisos do seu acesso"): todo aviso que
  entra em `notifications` também vai como push às mesmas pessoas (a liderança não ganha os da equipe).
  Sem polling: gatilho `notifications_push` faz `pg_notify('npac_aviso', id)` (entregue no commit) e
  `push/sino-push.ts` (`SinoPush`) ouve com o LISTEN do postgres-js (`DB_SQL`, conexão própria, reconecta
  sozinho). `notification_push_claim` grava em `notification_pushes` (fora do `app_revision`, sem FK,
  apaga o que passou de 1 dia): um push por aviso entre instâncias; ao (re)conectar, recupera os dos
  últimos 10 min ainda não lidos. Texto = a linha do sino (`activityVerb` em `sh/activity.ts`, o mesmo do
  web): "Ana agendou João"; o nome do lead é lido como a pessoa (RLS), fora do acesso sai "um lead fora do
  seu acesso". `form.received` fica fora (o webhook já manda o push dele). Testes: `vi.waitFor` + `settled()`.
- Push: VAPID opcional no env (sem chaves = desligado). Inscrição por `push_subscribe` (o aparelho
  vai para quem logou por último); sair e desativar usuário apagam; 404/410 apaga. **Log de cada envio**
  (`WebPushSender`, NPAC-48): `push enviado: 201 web.push.apple.com`, `push recusado: <código> <host>
<reason>`, `push expirado…` (404/410) e `push sem resposta: <ETIMEDOUT…> <host>`; nunca o endpoint
  inteiro, o texto do aviso ou dados da pessoa.
- **Convite para ativar** (NPAC-48, pedido do Igor 16/11/2026: a equipe não sabia que dava):
  `components/push-invite.tsx` no topo do Dashboard, Hoje, Chat (dentro da coluna, para o campo não sair
  da tela) e Fila do Acompanhamento; fora do layout para não pesar no JS de `/leads`. Só aparece se dá
  para ligar e ainda não está ligado neste aparelho (`conviteState` em `lib/push.ts`): notificação
  bloqueada, sem suporte ou sem VAPID não convida; iPhone fora da Tela de Início recebe o passo a passo.
  "Agora não"/"Entendi" = cookie `npac_push_convite` (`Path=/`, 7 dias, por aparelho). O Chromium do e2e
  começa com notificação "denied": `e2e/avisos-no-celular.spec.ts` simula "default" e a chave.
- **Barra do celular** (NPAC-48, Igor 16/11/2026): Dashboard, Hoje, Pipeline, **Chat** (com selo de não
  lidas), Mais; Leads vai para a tela Mais (`BOTTOM_HREFS` em `shell/nav-items.tsx`). Desktop sem mudança.

## Google Forms (NPAC-42, 10/11/2026)

- `POST /webhooks/forms` (`api/forms/*`, `@Public`, cabeçalho `x-forms-token`): sem
  `FORMS_WEBHOOK_TOKEN` ou com token errado, 404. Apps Script e passo a passo em `docs/integracao-forms/`.
- Acha o lead por telefone, Instagram e e-mail (`form_find_lead`); não altera o lead nem troca o dono.
  Sem lead: cria só com faixa do CRM (acima de 5 mil) e telefone ou Instagram, dono =
  `FORMS_OWNER_USERNAME`, origem `FORMULARIO`, etapa Criando Relacionamento; senão descarta, sem guardar.
- `form_responses`: respostas cifradas, gravação só por `form_response_record` (timeline
  `form.received` + auditoria), LGPD zera. Aviso ao dono e à liderança, sem excluir o autor; bloco
  "Formulários novos" no Hoje e card na ficha. `truncate leads` nos testes inclui `form_responses` e `sdr_sale_marks`.

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
  (comercial), `(select mentoria_ve_todas()) or inscricao_id = any ((select mentoria_ids_visiveis())::uuid[])`
  (Acompanhamento). Nunca `closer_has_lead(id)`/`mentoria_ve(inscricao_id)` direto: com 20 mil leads o
  Dashboard do SDR levava 20 s. O teste-guarda de `db/test/rls-por-consulta.test.ts` varre `pg_policies`
  (única exceção: `mentoria_midia_leitura`). INSERT/UPDATE com `mentoria_edita*` seguem por linha.
  Tabela nova do módulo: política de leitura nesse formato e caso no teste de equivalência.
- Valor novo de enum não vale na mesma transação da migration (compare como texto). Num banco novo
  todas as migrations rodam numa transação só: em função `LANGUAGE sql` (o corpo é conferido ao criar),
  nada de `'ACOMPANHAMENTO'::role` ou `'DIRETOR'::role`; leia o valor como texto e converta na execução.
- **Cargo** (0072): função ou política nova lê o cargo por `app_role()`, `mentoria_perfil*()`, `mentoria_admin()`,
  `area_mestre()`, `area_head_areas()` ou `area_membros`, nunca `user.role` nem `mentoria_perfis` (teste-guarda em
  `db/test/areas-compat.test.ts`). Gatilhos de `area_membros`/`user` usam `npac.area_sync` para não traduzir de volta.
- **JIT desligado nas funções da Fila e do push** (`SET jit = off` em `mentoria_fila`, `mentoria_avisos_candidatos` e
  `mentoria_semaforo_lote_calc`, 0070): em banco pequeno, a tabela de uma linha `mentoria_semaforo_inicio` sem `analyze`
  fazia o planejador estimar milhões de linhas e compilar a consulta (~700 ms por Fila; o e2e do CI estourou os 15 min).
  Função SQL grande nova do módulo: mesma linha, e tabela de uma linha lida como valor único (`(select … )`).
- Aplicar no dev: `pnpm --filter @npac/db build && pnpm --filter @npac/db migrate`.
  psql: `docker exec npac-corporation-postgres-1 psql -U npac_owner -d npac`.
- Apagar lead/usuário à mão (a foto `user_photos` e os vínculos `area_membros` saem em cascata): FKs em `form_responses`, `sdr_sale_marks`, `chat_reads`, `chat_*`, `payments`, `deals`, `lead_notes`,
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
# Varredura por cargo num ambiente publicado (só lê): login → cada item do menu em 1440/1024/768/375,
# com erro na tela, console, 4xx/5xx da API e rolagem lateral; relatório e capturas em VARREDURA_OUT
VARREDURA_URL=https://crm-itodev… VARREDURA_SENHA=… VARREDURA_OUT=<pasta> node apps/web/scripts/varredura-por-cargo.mjs <usuário>…
# Varredura do celular (WebKit, 375 e 768, claro e escuro): toque < 44 px, zoom ao tocar, barra cobrindo,
# teclado, janelinha e tabela larga; local, aponte para um `next start` (o `API_INTERNAL_URL` entra no build)
VARREDURA_URL=http://localhost:3150 VARREDURA_SENHA=senha-do-e2e-123 VARREDURA_OUT=<pasta> node apps/web/scripts/varredura-celular.mjs <usuário>…
```

- Endereço que não existe é 404 com a navegação do cargo (`app/not-found.tsx`); não há mais a página
  "Em breve" do comercial (`[secao]`). Os "Em breve" do Acompanhamento ficam (D4). `notFound()` numa tela
  ou layout de `(app)` cai em `app/(app)/not-found.tsx`, só o aviso (`components/shell/aviso-404.tsx`), porque a
  casca já tem a barra lateral (NPAC-58: o da raiz ali mostrava duas; e2e em `e2e/sidebar.spec.ts`).

- **Medição** só no `npac_e2e_perf` (nunca no dev `npac`); senha de todos `senha-do-e2e-123`. Plano,
  metas e números de antes/depois em `docs/plans/desempenho.md`.

- **Dev só pelo painel**: `preview_start` `npac-dev` (`.claude/launch.json`), nunca `pnpm dev` em
  segundo plano (porta 3000). e2e e dev disputam portas e `.next`: antes do e2e, `preview_stop` e
  libere 3000/4000; depois, `rm -rf apps/web/.next` e `preview_start`. e2e usa API 4100, web 3100
  (`E2E_WEB_PORT=3200` se outro projeto ocupar) e banco `npac_e2e`.
- Testes só recriam `npac_test*`/`npac_e2e*`; nunca aponte para outro banco. `npac_test_api` é um só para todas as worktrees: duas suítes da API ao mesmo tempo dão 401 falso; com outra worktree rodando, `API_TEST_DB=npac_test_api_<nome> pnpm --filter @npac/api test`. O e2e isola com `E2E_DB`, `E2E_API_PORT` e `E2E_WEB_PORT`.
- **CI em partes** (NPAC-45, 19/11/2026, `.github/workflows/ci.yml`): `static` (lint, typecheck, shared,
  audit), `db`, `api (1/3…)` e `e2e (1/6…)` em paralelo, cada parte com Postgres, API e web próprios
  (`vitest --shard`, `playwright --shard`); `ci` é o resumo (verde só com tudo verde). Uma parte passou
  de ~3 min: some um número à lista `shard` do job. No e2e do CI o turbo compila API e web ao mesmo
  tempo antes do Playwright e `E2E_PREBUILT=1` faz o `playwright.config.ts` só subir os servidores
  (local, sem a variável, cada execução compila de novo). O build do e2e não checa tipos
  (`NEXT_SKIP_TYPECHECK=1` → `typescript.ignoreBuildErrors` no `next.config.ts`; quem checa é o
  `pnpm typecheck` e o job `static`; produção nunca define). Por isso **arquivo de teste não depende de outro**:
  cada um cria o que usa a partir do seed e roda sozinho (`--shard` muda quem roda antes). Commit novo
  cancela a execução anterior do PR; PR só de `docs/**` e `*.md` não roda os testes; falhou uma parte,
  "Re-run failed jobs" roda só ela.
- API e e2e compartilham usuários: teste que mexe em MFA/senha/papel restaura no fim; `truncate leads`
  inclui as tabelas com FK.
- e2e loga com `email.split('@')[0]`. Seeds: diretor (DIRETOR), ana/ronaldo (HEAD), ale/murilo/igor
  (SDR), sonia (CLOSER), carla (Acompanhamento sem perfil), duda (Acompanhamento + Admin), operacao, manu, leo, maria (Envios), `@npac.com.br`; teste que troca papel: `update "user" set role = …` e restaurar.
- Playwright: `filter({ visible: true })`/`exact: true` (layout mobile oculto duplica controles);
  `role=alert` também pega o anunciador de rotas do Next; nada de `networkidle` (SSE).
- JS de `/leads` < 150 KB gzip (teste; hoje ~149,7, com a release em 150,0 antes da Fase 2 do desempenho). Sem libs pesadas no cliente, nem zod; prefira server components.
- Capturas dos e2e: `apps/web/test-results/*.png`.

## Não commitar

`.env`, dumps, `test-results/`, logs, `node_modules`, `.claude/`. Commits sem linha de
atribuição.
