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
| 2 | Metas, tarefas da reunião (até 3, prazo), cobrança da reunião anterior, % do PME (tarefas e metas) | ✅ 12/11 (sem S1/S3/S4; PR na `release/v0.15`) |
| 3 | Check-ins lançados pela equipe, semáforo (função, histórico semanal, sequência), colunas em Mentorados, status da meta, segunda chance manual | ✅ 18/11 (PR na `release/v0.18`; pendências na seção da parte) |
| 4 | Fila (COBRANCA, SEMAFORO, ENVIAR_PME, PME_ATRASADO, FIM_PME espera o ciclo), push, aba 7 "PMEs e ciclos", CSV, fechamento | ✅ 18/11 (PR na `release/v0.18`; pendências na seção da parte) |
| 5 | Depois da Eduarda: P1 da spec §9 e as pendências das Partes 2 a 4 (lista na seção "Parte 5") | aguardando a Eduarda |

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

Branch `feat/NPAC-43-fase-2-parte-2-metas`, criada da `origin/release/v0.14` depois do merge do #91 e rebaseada na
`origin/release/v0.15` (a v0.14 foi para produção antes do PR).
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
- [x] PR na `release/v0.15` (a v0.14 foi para produção antes; pedido do Gabriel, 12/11).

**Para a Parte 3:** `mentoria_tarefas` REUNIAO já têm `prazo`/`data_cobranca`, `status` e `cobrada_em` (base do motivo
`TAREFA_1/2` do semáforo e da COBRANCA da Parte 4); `mentoria_pct_tarefas` serve a coluna "% do PME" de Mentorados. O
motivo `PME_7`/`PME_15` do semáforo usa os dias de atraso (o status não tem mais segunda chance).

## Parte 3 — Check-in e semáforo

Feito quando: `mentoria_checkins` e `mentoria_semaforo_historico`; lançar check-in na ficha (enviado,
respondeu, avanço, travou, próximo passo); `mentoria_semaforo(inscricao, dia)` com os 6 motivos;
histórico gravado na virada da semana pelo timer único e completado ao subir a API (idempotente);
sequência de semanas; Mentorados com PME atual, semáforo e % do PME, filtro por semáforo.
Entram também o status da meta (E10) e a segunda chance manual (E15, E16).

## Parte 3 — tarefas

Branch `feat/NPAC-43-fase-2-parte-3-semaforo`, a partir da `origin/release/v0.18`. Execução nativa (sem
subagentes). Migration `0069` (a última era a 0068).

**Como ficou** (spec E9–E16, mais detalhes técnicos sem efeito de negócio):
- **Entrada no ar (E13):** tabela de uma linha `mentoria_semaforo_inicio(desde)`, preenchida pela migration com o
  dia de Brasília em que ela roda; sem grant para `npac_app` (só as funções leem). Semana válida = começa depois de
  `desde` e depois de `inicio_jornada`. Para "todo mundo começa verde": tarefas contam com prazo a partir de
  `desde`; o atraso do PME no semáforo conta de `greatest(prazo atual, desde)`.
- **Check-in (E9):** `mentoria_checkins`; `semana` = coluna gerada, segunda-feira de Brasília do `enviado_em` (um por
  semana por inscrição); `respondeu` ⇔ `respondido_em` preenchido (CHECK); resposta não antes do envio; envio e
  resposta nunca no futuro (API). Avanço, travou e próximo passo cifrados. Leitura: Admin, Acompanhamento, Operação
  (`(select mentoria_ve_todas())`); escrita: área nova `CHECKIN` (Admin, Acompanhamento). Sem DELETE. LGPD zera os
  textos. Histórico `checkin.lancado` / `checkin.editado` (nomes de campos).
- **Semáforo:** `mentoria_semaforo_calc(inscricao, dia)` (interna, sem grant) e `mentoria_semaforo(inscricao, dia)`
  (para a API: nada para quem não é Admin, Acompanhamento ou Operação). Devolve `cor` e `motivos` (um por par, o mais
  grave). Tarefas: só origem REUNIAO (PDF p. 10, passo 6; as do ciclo já estão no `PME_*`), ordem prazo desc,
  criado_em desc, id desc.
- **Sequência:** `mentoria_sequencia_checkins(inscricao, dia)`: semanas seguidas com check-in respondido, da última
  encerrada para trás.
- **Histórico:** `mentoria_semaforo_historico` (semana, cor, motivos; único por inscrição e semana), escrita só por
  `mentoria_semaforo_gravar(hoje)` (SECURITY DEFINER, `ON CONFLICT DO NOTHING`): para cada ATIVO, as semanas que
  acabaram depois da entrada no ar e do início da jornada, a partir da última gravada, cor calculada na segunda
  seguinte. O `AvisosScheduler` chama em todo disparo (ao subir e na virada) e arma o timer também para a próxima
  segunda 00:00 de Brasília.
- **Segunda chance (E15, E16):** `mentoria_ciclos.segunda_chance_ate`; `PATCH ciclos/:id` aceita `segundaChanceAte`
  (área nova `SEGUNDA_CHANCE`: Admin, Acompanhamento; o gatilho barra a Operação e ciclo fechado). Data depois do prazo
  original e não antes de hoje; nula desfaz. `mentoria_ciclo_status` ganha a versão com `segunda_chance_ate`
  (`SEGUNDA_CHANCE` enquanto hoje ≤ data); `diasAtraso` do card e do semáforo contam do prazo atual. Histórico
  `pme.segunda_chance`. A tela sugere hoje + 7 dias.
- **Status da meta (E10):** `mentoria_metas.status` (ATINGIDA, NAO_ATINGIDA, nulo); `PATCH metas/:id` aceita `status`.
- **Mentorados:** colunas PME atual (número do ciclo mais recente e status), semáforo e % do PME (tarefas do ciclo
  mais recente); filtro por semáforo (lembrado com os outros filtros da tela).
- `app_revision`: o módulo não usa o canal ao vivo (nenhuma tabela `mentoria_*` tem o gatilho); as novas também não.

### Tarefa 3.1: Banco (0069) — Status: ✅
**Files:** Modify `db/src/schema/mentoria.ts` · Create `db/drizzle/0069_acompanhamento_v2_semaforo.sql` + snapshot +
journal · Test `db/test/mentoria-v2-semaforo.test.ts`, `db/test/rls-por-consulta.test.ts`, `db/test/mentoria-v2-metas.test.ts`
- [x] Testes RED: RLS de check-ins e histórico por perfil (Operação lê sem escrever, Manu e Leo não veem, sem DELETE),
  um check-in por semana, cada motivo, entrada no ar verde, pausado sem semáforo, segunda chance, gravar idempotente.
- [x] Schema + `generate` + SQL manual; `pnpm --filter @npac/db test` verde. Commit.

### Tarefa 3.2: API — Status: ✅
**Files:** Create `api/mentoria/checkins.service.ts`, `checkins.controller.ts`, `semaforo.service.ts`,
`sh/mentoria/semaforo.ts` · Modify `sh/schemas/mentoria.ts`, `sh/mentoria/dto.ts`, `sh/mentoria/pmes.ts`,
`ciclos.*`, `metas.service.ts`, `ficha.service.ts`, `inscricoes.service.ts`, `avisos.scheduler.ts`, `mentoria.module.ts` ·
Test `api/test/mentoria-v2-semaforo.e2e.test.ts`
- [x] Testes RED (spec §8 da parte): cada motivo; todo mundo verde na entrada no ar; PENDENTE vencida conta; PARCIAL
  não; pausado sem semáforo; histórico idempotente ao subir duas vezes; segunda chance (status, prazo atual, Operação
  404); check-in (Operação e Manu 404, um por semana); status da meta; lista com colunas e filtro.
- [x] Implementar; suítes do módulo verdes. Commit.

### Tarefa 3.3: Telas — Status: ✅
**Files:** Create `components/acompanhamento/semaforo.tsx` (selo, motivos, histórico, sequência, check-ins),
`web/e2e/acompanhamento-v2-semaforo.spec.ts` · Modify `ficha.tsx`, `pme-atual.tsx`, `metas.tsx`,
`mentorados-lista.tsx`, `lib/acompanhamento-prefs.ts`, `historico-lista.tsx`, `modulo.css`
- [x] Playwright por perfil (Duda lança check-in, dá segunda chance, marca meta, filtra por semáforo; Operação vê sem
  editar; Manu sem semáforo nem check-ins). Capturas 375/768/1024/1440. Commit.

### Tarefa 3.4: Fechamento — Status: ✅
- [x] `pnpm lint && pnpm typecheck`, `@npac/db`, `@npac/api`, Playwright completo; `CLAUDE.md`; Status acima; PR.

**Pendências da Parte 3** (sem base no PDF, na spec ou nas respostas de 18/11; nada decidido):
1. **Pausa e o semáforo:** quem volta da pausa pode voltar vermelho, porque as semanas e tarefas vencidas durante a
   pausa contam. As semanas pausadas deveriam ficar de fora?
2. **Tarefas do ciclo no semáforo:** só as da reunião contam (PDF p. 10). Confirmar que as extras e o encerramento
   ficam só no `PME_7`/`PME_15`.
3. **Segunda chance:** pode ser dada mais de uma vez ou corrigida? Hoje a data muda enquanto o ciclo está aberto, e
   cada mudança vai para o histórico.
4. **Especialista:** não vê semáforo nem check-ins (§2, "só"). Confirmar.
5. **Histórico congela a semana:** a cor gravada na virada não muda se a equipe lançar depois um check-in daquela semana.
6. **Cor amarela nova** (`--tag-warn`): o PDF pede amarelo; o CLAUDE.md pede confirmar cor nova.

Fora da Parte 3 (Parte 4 ou depois): item SEMAFORO na Fila e push, escada de atraso (PME_ATRASADO), CSV com semáforo, P1.
Achado de layout: a tabela de Mentorados já não cabia em 1024 px com a barra lateral (colunas cortadas); entre 1024 e
1279 px ela vira cartões, como no celular.

## Parte 4 — Fila, avisos e aba 7

Feito quando: tipos COBRANCA, SEMAFORO, ENVIAR_PME, PME_ATRASADO em `mentoria_fila` + `sh/mentoria/fila.ts`
(quem vê, rótulos, filtro); degraus de atraso gravam contato; ação FIM_PME espera o ciclo (mês 2 com teto de
15 dias); push conforme a spec §6; aba 7 "PMEs e ciclos" no lugar do "em breve"; CSV com PME atual, status
do ciclo e semáforo; spec §8 inteira verde; `CLAUDE.md` e este plano fechados.

## Parte 4 — tarefas

Branch `feat/NPAC-43-fase-2-parte-4-fila`, a partir da `origin/release/v0.18` (Partes 1–3 e o #127). Execução nativa
(sem subagentes). Migration `0070` (a última era a 0069).

**Decidido** (Gabriel e Eduarda, 18/11; spec E17–E22): COBRANCA, SEMAFORO, ENVIAR_PME, PME_ATRASADO (escada do PDF p. 19
contada do prazo atual), FIM_PME espera o ciclo (3A, mês 2 com teto de 15 dias), aba 7 e CSV. Fora: painel do Leo e padrinho
(Fase 4), entrada automática pela venda do comercial, opção do pagamento (P1).

**Como fica** (o decidido, mais detalhes técnicos sem efeito de negócio):
- **COBRANCA** `cobranca:<tarefa>`: tarefa PENDENTE com `data_cobranca` ≤ hoje (qualquer origem: a spec diz "tarefa"), vence no
  dia do prazo, atrasada depois dele; mostra o status e a descrição. Fila do responsável pela inscrição (perfil
  Acompanhamento); tarefa de reunião conduzida por Especialista ativa, dela. Sai com o resultado. Push às 8h do dia do prazo,
  só naquele dia.
- **SEMAFORO** `semaforo:<inscrição>:<segunda da semana>`: ATIVO em amarelo ou vermelho, com os motivos; responsável pela
  inscrição. Sai ao voltar a verde ou com "Visto nesta semana" (`mentoria_fila_feitos` com a chave da semana; na semana
  seguinte volta se continuar fora do verde). Vermelho = atrasado na lista. Push só vermelho, às 8h (ou na hora em que virar,
  se depois), uma vez por semana por mentorado (`semaforo-vermelho:<inscrição>:<segunda>`); "visto" na semana não avisa.
  Admin, Acompanhamento e Operação veem (como o semáforo); a Especialista não.
- **ENVIAR_PME** `enviar-pme:<ciclo>`: o ciclo mais recente está CONCLUIDO, número < 12, ATIVO e hoje ≤ término (as regras do
  envio, `ciclos.service.ts`); Fila da Operação; "Registrar envio" chama o envio do PME. Sai com o ciclo seguinte. Sem push.
- **PME_ATRASADO** `pme-atrasado:<ciclo>:<prazo atual>:<degrau>`: ciclo aberto com atraso ≥ 3 dias do prazo atual
  (`coalesce(segunda_chance_ate, prazo)`); mostra só o degrau mais alto alcançado (3 "Mensagem leve no grupo", 7 "Áudio ou
  vídeo da Duda", 10 "Avaliar segunda chance", 15 "Ligação e reunião de destravamento"). Responsável pela inscrição.
  "Registrar contato" grava `mentoria_contatos` com `ciclo_id`, `degrau` e `degrau_prazo` (o prazo atual) e o motivo com o
  texto do degrau; sai com esse contato ou com o ciclo fechado; segunda chance muda o prazo atual, e a escada recomeça dele.
  Push às 8h do dia do degrau, válido até o próximo degrau.
- **ACAO FIM_PME (3A):** `mentoria_acao_data(...)` (IMMUTABLE, sem ler tabela): sem ciclo do número do mês (ou ciclo NAO_CONCLUIDO,
  pendência 3), a data da Fase 1; ciclo CONCLUIDO, o `concluido_em`; ciclo aberto, espera (nula), exceto mês 2 com atraso ≥ 15 do
  prazo atual, que aparece no 15º dia. Vale na Fila e no push da ação.
- **Fila sem função por linha que releia tabela:** o semáforo entra por `mentoria_semaforo_lote(dia)` (uma chamada por consulta,
  conjunto inteiro; `mentoria_semaforo_lote_calc` interna = a mesma conta da `mentoria_semaforo_calc`, comparada no teste);
  ciclos, tarefas e contatos por JOIN sob a RLS. `mentoria_perfil_de` (DEFINER, sem RLS) só nas linhas que saem, como na 0064.
- **Despertador:** além do próximo aviso e da segunda 00:00, acorda às 8h de Brasília todo dia (o semáforo vira vermelho com a
  troca do dia, sem escrita que rearme).
- **Aba 7 "PMEs e ciclos"** (`/acompanhamento/pmes`, `GET mentoria/pmes-ciclos`): mentorados ATIVO com o ciclo mais recente
  (número e título, envio, prazo atual, status com atraso, % de tarefas, extras feitas de N, encerramento feito) e o próximo PME a
  enviar; filtros por PME e por status do ciclo (lembrados). Admin, Acompanhamento e Operação; Especialista e Mentor, 404 e fora
  do menu. Cada linha leva à ficha.
- **CSV de Mentorados** ganha "PME atual", "Status do PME" e "Semáforo" (sem textos cifrados).

### Tarefa 4.1: Banco (0070) — Status: ✅
**Files:** Modify `db/src/schema/mentoria.ts` · Create `db/drizzle/0070_acompanhamento_v2_fila_cobranca.sql` + snapshot + journal ·
Test `db/test/fila-equivalencia.test.ts` (o contato do degrau entrou nele, sem arquivo à parte)
- `mentoria_contatos` + `ciclo_id` (FK SET NULL), `degrau` (3, 7, 10, 15), `degrau_prazo`; gatilho: ciclo da mesma inscrição.
- `mentoria_semaforo_lote_calc` (interna) e `mentoria_semaforo_lote` (Admin/Acompanhamento/Operação); `mentoria_acao_data`.
- `mentoria_fila` refeita (4 tipos novos + ACAO com a data do ciclo); `mentoria_avisos_candidatos` refeita (COBRANCA,
  SEMAFORO vermelho, PME_ATRASADO, ACAO com a data do ciclo).
- [x] Testes: equivalência com a 0053 nos tipos antigos (sem ciclo, e com ciclo fora das FIM_PME); lote = calc por inscrição em
  vários dias; SEMAFORO = fora do verde da 0069 menos o visto, só para quem vê o semáforo; Especialista só cobra as dela; contato
  do degrau (prazo atual, outro mentorado recusado); continua INVOKER/STABLE. `@npac/db`: 314 testes verdes.
- Push: os destinatários dos itens novos são lidos uma vez (`pf`/`resp` em `mentoria_avisos_candidatos`), sem
  `mentoria_destinatarios` por linha (215 → 163 ms no `npac_e2e_perf`; 143 ms antes da Parte 4).

### Tarefa 4.2: API — Status: ✅
**Files:** Modify `sh/mentoria/fila.ts`, `sh/schemas/mentoria.ts`, `sh/mentoria/dto.ts`, `fila.service.ts`, `reunioes.service.ts`
(contato do degrau), `avisos.scheduler.ts`, `exportacao.controller.ts`, `mentoria.module.ts` · Create `pmes-ciclos.controller.ts` ·
Test `api/test/mentoria-v2-fila-cobranca.e2e.test.ts`
- [x] Testes (relógio e push falsos): cada tipo novo entra e sai; push 1x (cobrança no dia, vermelho por semana, cada degrau);
  degraus pelo prazo atual e recomeço com segunda chance; FIM_PME espera, usa o encerramento, mês 2 com teto de 15; pausado
  fora; Especialista só nas dela; aba 7 por perfil e filtros; CSV com as colunas novas (16 testes). `@npac/api`: 672 verdes
  (+1 pulado); o teste antigo "escrita do módulo rearma o despertador" passou a usar o link das 6h30, antes do despertar das 8h.
- Os testes da API aceitam `API_TEST_DB` (outra worktree rodando a suíte no `npac_test_api` dava 401 falso).

### Tarefa 4.3: Telas — Status: ✅
**Files:** Modify `components/acompanhamento/fila.tsx`, `shell/nav-menu.tsx`, `acompanhamento/mais/page.tsx`,
`em-breve/[aba]/page.tsx`, `lib/acompanhamento-prefs.ts`, `modulo.css` · Create `app/(app)/acompanhamento/pmes/page.tsx`,
`components/acompanhamento/pmes-ciclos.tsx`, `web/e2e/acompanhamento-v2-fila-cobranca.spec.ts`
- [x] Playwright: Duda cobra, marca "visto" e registra o contato do degrau; Operação registra o envio pela Fila e vê a aba 7; Manu
  sem aba 7 (menu e 404) e com a cobrança das reuniões dela. Capturas 375/768/1024/1440 (`test-results/fila-cobranca-*.png`).
  `acompanhamento-v2-base`: a aba 7 saiu do "em breve" (`/acompanhamento/em-breve/pmes` redireciona).

### Tarefa 4.4: Fechamento — Status: ✅
- [x] lint, typecheck, `@npac/db`, `@npac/api`, `@npac/shared` (273), Playwright completo; `CLAUDE.md`; Status das Partes; PR na
  `release/v0.18`.
- [x] Medição no `npac_e2e_perf` (364 inscrições + ciclos, tarefas e check-ins fictícios da Fase 2; mediana de 5,
  `POST /api/mentoria/fila {"escopo":"EQUIPE"}`), mesma API, só trocando o corpo da `mentoria_fila`:

  | Quem | Antes (0064) | Depois (0070) |
  |---|---|---|
  | diretor | 85 ms | 112–124 ms |
  | duda | 79 ms | 107–112 ms |
  | operacao | 90 ms | 101–106 ms |
  | manu | 23 ms | 38–39 ms |

  Só o SQL (duda, sob a RLS): 64 ms com 341 itens → 81 ms com 909 itens (568 itens novos: 341 cobranças, 81 degraus, 48
  envios, semáforos). Fica longe da meta de 500 ms da Fase 6 do desempenho.
- [x] Achado no CI (o e2e estourou os 15 min duas vezes, todos os testes verdes): no banco pequeno do e2e a Fila levava ~840 ms
  para 37 itens. A tabela de uma linha `mentoria_semaforo_inicio`, nunca analisada, virava estimativa de 2.470 linhas × as
  inscrições, e o custo estimado ligava o JIT (~700 ms de compilação). Correção na 0070: `desde` lido como valor único e
  `SET jit = off` na Fila, no push e no semáforo em lote. Banco do e2e e dev: Fila 840 → 29 ms, push 750 → 30 ms; no
  `npac_e2e_perf`, Fila ~85 ms e push ~172 ms (dentro da variação). Teste-guarda em `fila-equivalencia`.

**Pendências da Parte 4** (sem base no PDF, na spec ou nas respostas; o sistema faz o indicado, sem decidir a regra):
1. **Degrau não registrado:** a Fila mostra só o degrau mais alto; o de 3 dias sem contato some quando chegam os 7. Mostrar todos?
2. **COBRANCA das tarefas do ciclo:** extras e encerramento vencem todas no prazo do PME e viram uma cobrança cada (a spec diz
   "tarefa", sem restringir), além do PME_ATRASADO. Só as da reunião?
3. **FIM_PME com o ciclo NAO_CONCLUIDO** (o seguinte saiu sem fechar este): a spec diz que espera "enquanto não está CONCLUIDO",
   o que esconderia a ação para sempre; hoje volta à data da Fase 1.
4. **Plano dos 12 meses** (aba 5 e CSV do Plano) ainda mostra a data da Fase 1 nas ações FIM_PME; só a Fila e o push esperam o ciclo.
5. **Vermelho por várias semanas** avisa uma vez por semana (a chave é da semana); "só quando vira" pode querer dizer só na troca.
6. **Aba 7 só ATIVO**: pausado não aparece (como o envio de PME).

## Parte 5 — Respostas da Eduarda

Fase 2 entregue nas Partes 1 a 4. Fica com a Eduarda (nada disso entra até ela responder; cada item é pequeno e isolado):
1. **P1** (spec §9): a opção que falta na situação do pagamento.
2. Da Parte 2: % de metas num número único; exclusão de tarefa ou meta lançada por engano; prazo da tarefa antes da reunião;
   tarefa e meta em reunião com falta ou remarcada; meta sem PME aberto; nome do texto livre "Metas definidas ou ajustadas".
3. Da Parte 3: pausa e semáforo; só tarefas da reunião no semáforo; segunda chance mais de uma vez; Especialista sem semáforo;
   histórico que congela a semana; a cor amarela.
4. Da Parte 4: as 6 pendências da seção da parte (degrau não registrado, cobrança das tarefas do ciclo, FIM_PME com ciclo não
   concluído, data do Plano nas FIM_PME, vermelho semanal, aba 7 só ATIVO).
5. Pausa estica o prazo do PME? (aberta desde a Parte 1).
