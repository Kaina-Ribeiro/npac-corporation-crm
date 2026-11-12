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
| 1 | Catálogo de PMEs, ciclos e tarefas do ciclo (envio, extras, encerramento, status derivado) + Configurações > PMEs + card "PME atual" na ficha | ✅ 11/11 (PR na `release/v0.14`) |
| 2 | Metas, tarefas da reunião (até 3, prazo), cobrança da reunião anterior, % do PME (tarefas e metas) | ✅ 12/11 (sem S3/S4; PR na próxima `release/*`) |
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

## Parte 1 — tarefas

Branch `feat/NPAC-43-fase-2-parte-1-pmes`. Execução nativa (sem subagentes). Migration `0057`.

**Decisões desta parte** (detalhes que a spec deixa abertos; não mudam escopo):
- Ciclos começam no **1**: o PME de aquecimento (0) é etapa do onboarding da Fase 1; o 0 fica só no catálogo.
- `prazo` = coluna gerada `enviado_em + 30`; `data_cobranca` = coluna gerada `prazo`. Corrigir o envio move o
  prazo do ciclo e, por gatilho, o das tarefas EXTRA e ENCERRAMENTO.
- Todo ciclo enviado ganha uma ENCERRAMENTO; sem texto no catálogo, "Encerramento do Nº PME".
- `descricao` da tarefa cifrada também nas que vêm do catálogo (uma regra só; LGPD zera). Coluna aceita nulo
  só para a anonimização; a API exige.
- Desfazer o encerramento com o PME seguinte já enviado: 400 "O PME seguinte já foi enviado" (senão dois
  ciclos abertos). `concluido_em` = hoje de Brasília (nunca antes do envio).
- `meta_id` fica para a Parte 2 (a tabela `metas` nasce lá, com a FK).
- Especialista **lê** os ciclos das inscrições que vê (número e datas, sem dado pessoal: a Parte 2 põe as
  tarefas da reunião no ciclo aberto); tarefas, só as REUNIAO das reuniões que ela conduz.
- Áreas novas em `mentoria_edita`: `PME` (Admin, Acompanhamento, Operação: envio, anterior ao sistema, corrigir
  data) e `TAREFA` (Admin, Acompanhamento: marcar tarefa, fechar à mão ciclo sem encerramento).
- O "Enviado" do 1º PME na Fila (`PUT inscricoes/:id/pme1-enviado`) também cria o ciclo 1 quando a inscrição
  está ATIVO, sem ciclo e com o 1º PME ativo no catálogo; senão grava só a data, como na Fase 1.
- Status do ciclo com `hoje` vindo do `MENTORIA_CLOCK` (testes): `mentoria_ciclo_status(concluido, nao_concluido,
  prazo, hoje)` IMMUTABLE.
- Em aberto, para perguntar à Eduarda (não implementado): o prazo do PME anda durante a pausa? Hoje não anda.

### Tarefa 1.1: Banco (0057) — Status: ✅
**Files:** Modify `db/src/schema/mentoria.ts` · Create `db/drizzle/0057_acompanhamento_v2_pmes.sql` + snapshot +
journal · Test `db/test/mentoria-v2-pmes.test.ts`
- Tabelas `mentoria_pmes` (numero 0–12 único, titulo ≤120, foco ≤500, link_material `LINK_PERMITIDO`,
  atividades_extras text[] ≤20, encerramento ≤500, ativo, version, criado_por sem FK), `mentoria_ciclos`
  (pme_id opcional para o anterior ao sistema, numero 1–12, único por inscrição, índice parcial do aberto),
  `mentoria_tarefas` (origem, reuniao_id, ciclo_id, ordem, descricao, prazo, data_cobranca, status, motivo,
  comprovante_midia_id, cobrada_em/por, marcada_por_mentorado_em, visivel_ao_mentorado; CHECKs: REUNIAO exige
  reunião e prazo, EXTRA/ENCERRAMENTO exigem ciclo, motivo só em PARCIAL/NAO_FEITA; um ENCERRAMENTO por ciclo).
  `mentoria_midia.dono_tipo` ganha `TAREFA_COMPROVANTE`.
- Funções: `mentoria_ciclo_status`, `mentoria_ve_tarefa(reuniao, inscricao)`, `mentoria_edita_tarefa(reuniao,
  inscricao)`; gatilhos `mentoria_ciclo_guarda` (número só cresce, criado_por, fechar à mão exige área TAREFA e
  ciclo sem ENCERRAMENTO), `mentoria_ciclo_prazo_segue`, `mentoria_tarefa_guarda` (cobrada_em/por do banco),
  `mentoria_tarefa_limite` (4ª REUNIAO da mesma reunião → 22023 "Até 3 tarefas por reunião", com advisory
  lock), `mentoria_tarefa_encerramento` (FEITA fecha, voltar reabre). Atualiza `mentoria_midia_ve/_edita`,
  `mentoria_excluir_midia`, `mentoria_enfileirar_midia(uuid)`, `mentoria_anonimizar_inscricao` (zera
  descricao/motivo, enfileira comprovantes) e a policy de histórico (`pme.concluido`, `pme.reaberto` só pelas funções).
- RLS + grants: pmes (leitura dos perfis, escrita Admin), ciclos (leitura `mentoria_ve`, escrita área PME),
  tarefas (leitura/edição pelas funções novas; INSERT de EXTRA/ENCERRAMENTO pela área PME). Sem DELETE.
- Catálogo: 1º PME (2 extras: erros no Millionaire Book com 3 soluções; livro "Comece pelo Porquê"; encerramento:
  queimar as folhas dos erros) e 2º PME (4 extras do PDF, sem encerramento próprio).
- [x] Testes RED: RLS por perfil (Manu, Leo, Operação sem marcar tarefa), unicidades, 4ª tarefa, um aberto,
  status nos dias 9/10/16/17, encerramento fecha/reabre/recusa, prazo segue, sem DELETE.
- [x] Schema + `generate` + SQL manual; `pnpm --filter @npac/db test` verde. Commit.

### Tarefa 1.2: API — Status: ✅
**Files:** Create `api/mentoria/pmes.controller.ts` (controller + `PmesService`), `ciclos.service.ts`,
`ciclos.controller.ts`, `sh/mentoria/pmes.ts` · Modify `sh/schemas/mentoria.ts`, `sh/mentoria/dto.ts`,
`ficha.service.ts`, `fila.service.ts`, `midia.controller.ts`, `historico.ts`, `mentoria.module.ts` · Test
`api/test/mentoria-v2-pmes.e2e.test.ts`
- Rotas: `GET/PUT mentoria/pmes` (Admin; PUT sem `id` cria pelo `numero`); `POST inscricoes/:id/ciclos`
  (`{enviadoEm?}`, envio); `POST inscricoes/:id/ciclos/anterior` (`{numero, enviadoEm, concluidoEm?}`);
  `PATCH ciclos/:id` (`{version, enviadoEm?, concluidoEm?}`); `GET/PATCH tarefas/:id` (`{version, status?,
  motivo?}`); comprovante em `POST tarefa-comprovante/:id/midia` (foto, vídeo ou PDF).
- DTOs: `PmeDTO`, `CicloDTO` (com `status`, `diasAtraso`, `tarefas`), `TarefaDTO`; `FichaDTO.ciclos` e
  `pode.pme`/`pode.tarefa`.
- Erros: 400 "Cadastre o Nº PME em Configurações", "Só mentorado ativo recebe PME", "A jornada já terminou",
  "Os 12 PMEs já foram enviados", data no futuro ou antes do PME anterior.
- [x] Testes RED (spec §8 da parte): envio cria ciclo e tarefas; encerramento fecha e desfazer reabre; status
  9/10/16/17; envio com aberto → NAO_CONCLUIDO; catálogo só Admin; Operação e Manu sem marcar tarefa (404);
  anterior ao sistema; corrigir data move os prazos; comprovante PDF; `pme1-enviado` cria o ciclo 1; LGPD.
- [x] Implementar; suíte do módulo verde. Commit.

### Tarefa 1.3: Telas — Status: ✅
**Files:** Create `components/acompanhamento/pme-atual.tsx`, `pmes-admin.tsx`,
`app/(app)/acompanhamento/configuracoes/pmes/[id]/page.tsx`, `web/e2e/acompanhamento-v2-pmes.spec.ts` ·
Modify `configuracoes/page.tsx` (aba PMEs), `etapa-card.tsx`/`ficha.tsx` (card antes das ações),
`lib/acompanhamento-saver.ts` (`pme:<id>`, `tarefa:<inscricaoId>:<id>`), `modulo.css`, `db/src/seed-mentoria.ts`
(um ciclo fictício para a demo)
- Card "PME atual": número e título, envio, prazo, status com atraso, link do material, tarefas do ciclo
  (status, motivo, comprovante), botão do encerramento, ações "Registrar envio do Nº PME", "Corrigir data",
  "PME anterior ao sistema"; ciclos anteriores recolhidos.
- [x] Playwright por perfil (Duda edita catálogo e fecha o ciclo; Operação registra envio sem marcar tarefa;
  Manu sem ações); capturas 375/768/1024/1440. Commit.

### Tarefa 1.4: Fechamento — Status: ✅
- [x] `pnpm lint && pnpm typecheck`, `@npac/db`, `@npac/api`, Playwright completo; `CLAUDE.md`; Status acima; PR.

**Para a Parte 2:** `meta_id` em `mentoria_tarefas` ainda não existe (nasce com `mentoria_metas`); o gatilho das 3 tarefas
por reunião e a RLS da Especialista nas tarefas REUNIAO já estão prontos; tarefa da reunião entra no ciclo aberto
(`ciclo_id`). O card da ficha (`pme-atual.tsx`) mostra "N de M feitas"; as duas barras de E5 entram aqui.

## Parte 2 — Metas e tarefas da reunião

Feito quando: `mentoria_metas`; registro da reunião com "Cobrança da reunião anterior", "Metas definidas ou
ajustadas" e "Tarefas da semana" (até 3, prazo obrigatório, 400 na 4ª); Especialista só nas próprias
reuniões; % do PME (tarefas e metas) em SQL e nas duas barras do card; seções Metas e Tarefas na ficha.

## Parte 2 — tarefas

Branch `feat/NPAC-43-fase-2-parte-2-metas`, criada da `origin/release/v0.14` depois do merge do #91 (sem rebase).
Execução nativa (sem subagentes). Migration `0058`.

**Regra do Gabriel (12/11):** não inventar nada nem fazer o que depende da Eduarda. S3 (status da meta) e S4 (meta sem
alvo no %) ficam de fora até a decisão dele; ponto sem base no PDF ou na spec é registrado em "Pendências", sem decidir.

**Como ficou** (o que a spec diz, mais detalhes técnicos sem efeito de negócio):
- **Quem faz o quê** (spec §2): metas leem Admin, Acompanhamento e Operação; área nova `META` em `mentoria_edita` (Admin e
  Acompanhamento escrevem). A Especialista não vê metas ("só as tarefas e a cobrança das próprias reuniões"). Tarefas da
  reunião: quem marca tarefas (`mentoria_edita_tarefa`: Admin, Acompanhamento, Especialista nas próprias reuniões).
- **Cobrança da reunião anterior** (§4, ao pé da letra): as tarefas REUNIAO da última reunião REALIZADA antes desta, entre as
  que quem abre vê (RLS: a Especialista só as dela). Mostra todas as tarefas dessa reunião, as já cobradas com o resultado.
- **Tarefas da semana** (§3, §4): até 3 por reunião (gatilho da 0057, conferido; 400 "Até 3 tarefas por reunião"), descrição
  (cifrada) e prazo obrigatórios, meta opcional; entra no ciclo aberto, se houver (§4).
- **Metas** (§3): casal ou de uma pessoa, pilar, descrição (cifrada), alvo e atual (`numeric(14,2)`), unidade, prazo; nasce no
  ciclo aberto e com a reunião onde foi definida. **Sem status** (S3).
- **% do PME** (E5, em SQL): só tarefas, `mentoria_pct_tarefas` = FEITA ÷ total do ciclo (PARCIAL não conta); nulo sem
  tarefas. Juntar as metas num número único está **pendente com a Eduarda**: cada meta com alvo mostra a própria barra
  (`pct` = min(atual ÷ alvo, 1), na leitura das metas); meta sem alvo (S4) não entra em nenhum %.
- **S1 (código da Parte 1), commit à parte:** sem "segunda chance". Migration `0059` refaz `mentoria_ciclo_status`: ciclo
  aberto fica EM_ANDAMENTO com "N dias de atraso"; NAO_CONCLUIDO só quando o seguinte é enviado. `SEGUNDA_CHANCE` saiu de
  `CICLO_STATUS` (`sh/mentoria/pmes.ts`). Testes de db e api da Parte 1 ajustados (9/10/16/17/50 dias = em andamento).
- Ficha > Jornada: card do PME (extras e encerramento + barra de tarefas), seção Tarefas (as da reunião, por PME) e seção
  Metas (barra por meta com alvo).
- Técnico: só a tarefa REUNIAO muda texto, prazo e meta (as do ciclo vêm do catálogo); ciclo, reunião, pessoa e meta ligados
  são da mesma inscrição (gatilho); reunião com tarefa ou meta não se exclui (a FK apagaria as tarefas em cascata); pessoa 2
  removida devolve a meta ao casal (`SET NULL`); alvo > 0 (divisão) e atual ≥ 0; % `SECURITY DEFINER` (número agregado);
  histórico `meta.criada`, `meta.editada`, `tarefa.criada`, `tarefa.editada`.

**Pendentes com a Eduarda** (decisão do Gabriel, 12/11: nada disso entra até ela responder):
1. **S3** Status da meta (Em andamento / Atingida / Não atingida?). Hoje a meta não tem status.
2. **S4** Meta sem alvo numérico no % de metas (contar pelo status?). Hoje fica fora de qualquer %.
3. **% de metas do PME**: como juntar as metas num número (média? só as com alvo?). Hoje não há; só a barra de cada meta.
4. **S1** Segunda chance (10 a 16 dias de atraso). Hoje o ciclo aberto fica "Em andamento" com os dias de atraso.
5. Excluir tarefa ou meta lançada por engano: a spec não prevê. Hoje só se edita.
6. Prazo da tarefa antes do dia da reunião: aceitar ou recusar? Hoje aceita.
7. Reunião com falta (FALTOU) ou remarcada pode receber tarefa e meta? Hoje recebe.
8. Meta criada sem PME aberto (antes do 1º PME) fica fora de qualquer ciclo e não conta no %. Levar para o próximo PME?
9. O texto livre da Fase 1 "Metas definidas ou ajustadas" (registro) tem o mesmo nome do bloco novo: renomear ou tirar?

### Tarefa 2.1: Banco (0058) — Status: ✅
**Files:** Modify `db/src/schema/mentoria.ts` · Create `db/drizzle/0058_acompanhamento_v2_metas.sql` + snapshot + journal ·
Test `db/test/mentoria-v2-metas.test.ts`
- Tabela `mentoria_metas` (inscricao_id, ciclo_id, reuniao_id `SET NULL`, pessoa_id `SET NULL`, pilar, descricao, valor_alvo,
  valor_atual, unidade, prazo, visivel_ao_mentorado, version, autoria). `mentoria_tarefas.meta_id` (FK `SET NULL`).
- Funções: `mentoria_edita` (+ `META`), `mentoria_ve_meta`, `mentoria_vinculos_inscricao` (gatilho nas duas tabelas),
  `mentoria_tarefa_guarda` refeita, `mentoria_meta_guarda`, `mentoria_pct_tarefas`,
  `mentoria_excluir_reuniao` (recusa com tarefa/meta), `mentoria_anonimizar_inscricao` (zera a descrição das metas).
- RLS + grants: metas (SELECT `mentoria_ve_meta`, INSERT/UPDATE área META), tarefas (UPDATE de descricao, prazo, meta_id).
  Sem DELETE.
- [x] Testes: RLS de metas por perfil (Operação lê sem escrever, Manu e Leo não veem, sem DELETE); Manu cria tarefa só na
  própria reunião; 4ª tarefa; texto/prazo só em REUNIAO; vínculos de outra inscrição recusados; reunião com tarefa não exclui;
  % de tarefas; sem função de % de metas; sem coluna de status; LGPD. 0059: status do ciclo sem segunda chance.
- [x] Schema + `generate` + SQL manual; `pnpm --filter @npac/db test` verde. Commit.

### Tarefa 2.2: API — Status: ✅
**Files:** Create `api/mentoria/metas.service.ts`, `metas.controller.ts`, `sh/mentoria/metas.ts` · Modify
`sh/schemas/mentoria.ts`, `sh/mentoria/dto.ts`, `ciclos.service.ts`, `ciclos.controller.ts`, `reunioes.service.ts`,
`ficha.service.ts`, `historico.ts`, `mentoria.module.ts` · Test `api/test/mentoria-v2-metas.e2e.test.ts`
- Rotas: `POST reunioes/:id/tarefas` (`{descricao, prazo, metaId?}`); `PATCH tarefas/:id` ganha `descricao`, `prazo`,
  `metaId`; `POST inscricoes/:id/metas` (`{descricao, pilar?, pessoaId?, valorAlvo?, valorAtual?, unidade?, prazo?,
  reuniaoId?}`); `GET/PATCH metas/:id`.
- DTOs: `MetaDTO` (com `pct` da meta); `TarefaDTO` + `metaId`, `cicloNumero`, `reuniaoInicio`, `reuniaoTipo`;
  `CicloDTO` + `pctTarefas`; `ReuniaoDTO` + `tarefas`, `cobranca`, `metasInscricao`, `pessoasDaInscricao`, `podeTarefa`, `podeMeta`;
  `FichaDTO` + `metas`, `tarefasReuniao`, `pode.meta`.
- [x] Testes (spec §8 da parte): 3 tarefas e 400 na 4ª; prazo obrigatório; tarefa no ciclo aberto; cobrança da última
  realizada (FALTOU não conta; a da Manu, só as dela); Manu sem metas (404) e só nas próprias reuniões; Operação lê e não
  cria (404); metas + histórico; status recusado (400); % de tarefas (PARCIAL não conta) e `pct` por meta (sem alvo = nulo); reunião com tarefa não
  exclui; LGPD zera metas.
- [x] Implementar; suítes do módulo verdes. Commit.

### Tarefa 2.3: Telas — Status: ✅
**Files:** Create `components/acompanhamento/metas.tsx`, `tarefas-reuniao.tsx`, `web/e2e/acompanhamento-v2-metas.spec.ts` ·
Modify `reuniao-registro.tsx` (3 blocos), `pme-atual.tsx` (barras; `Tarefa` exportada), `ficha.tsx` (seções Tarefas e
Metas), `lib/acompanhamento-saver.ts` (`meta:<inscricaoId>:<id>`), `historico-lista.tsx` (títulos), `modulo.css`
(o seed não ganhou meta nem tarefa: ele não cifra texto; a demo cria pela tela)
- [x] Playwright por perfil: Duda combina 3 tarefas (4ª bloqueada), cria meta, cobra na reunião seguinte, vê as barras;
  Operação vê sem editar; Manu combina só na própria reunião e não vê metas. Capturas 375/768/1024/1440. Commit.

### Tarefa 2.4: Fechamento — Status: ✅
- [x] `pnpm lint && pnpm typecheck`, `@npac/db`, `@npac/api`, Playwright completo; `CLAUDE.md`; Status acima.
- [ ] PR: na próxima linha `release/*` (a v0.14 foi para produção; pedido do Gabriel, 12/11). Branch pushada.

**Para a Parte 3:** `mentoria_tarefas` REUNIAO já têm `prazo`/`data_cobranca`, `status` e `cobrada_em` (base do motivo
`TAREFA_1/2` do semáforo e da COBRANCA da Parte 4); `mentoria_pct_tarefas` serve a coluna "% do PME" de Mentorados. O
motivo `PME_7`/`PME_15` do semáforo usa os dias de atraso (o status não tem mais segunda chance).

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
