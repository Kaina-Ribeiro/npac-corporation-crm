# Plano: acesso por área (NPAC-54)

Spec: `docs/superpowers/specs/2026-11-19-acesso-por-area-design.md` (ler inteira antes de qualquer fase).
Release: a `release/vX.Y` aberta (em 19/11/2026, `release/v0.19`).

**Como executar:** uma sessão nova (Opus 5.5, esforço high) por fase, em ordem. Cada fase depende da
anterior já mesclada na release: **nunca duas fases ao mesmo tempo** (mexem nos mesmos arquivos e na
numeração das migrations). Cada fase é um PR `feat(NPAC-54): …` para a release, squash com o CI inteiro
verde. Ao fechar a fase, a sessão atualiza o status aqui e o `CLAUDE.md` no mesmo PR.

Legenda: ⏳ a fazer · 🔧 em andamento · ✅ feito · ❌ travado (dizer por quê na linha).

| Fase | O que entrega | Estimativa | Status |
|---|---|---|---|
| 1 | Banco: a tabela de membros vira a fonte do cargo, sem mudar nada na tela | 2–3 dias | ✅ (migration 0072; falta só o roteiro no ITODEV, ver notas) |
| 2 | Regra única de quem gerencia quem, na API e no banco | 2 dias | ✅ (migration 0073; ver notas) |
| 3 | Telas: equipe por área (Admin do CRM e aba Perfis do módulo) | 2–3 dias | ✅ (PRs #140 e #141; roteiro no ITODEV em 19/11, ver notas) |
| 3B | Alcance "só a carteira" no cargo Acompanhamento (2B): a pessoa faz o que o cargo faz, só nos mentorados em que é responsável; a Eduarda escolhe por pessoa | 3–4 dias | 🔧 (spec aprovada 19/11; construindo) |
| 4 | Pessoa em duas áreas | 2 dias | ⏳ |
| 5 | Limpeza da compatibilidade | 1 dia | ⏳ |

Estimativas são minhas (sem medição): 9–11 dias de sessão no total.

**Prod:** cada fase vai sozinha ao ITODEV pelo rc da release. Recomendação: levar a fase 1 a prod antes
das outras (não muda tela e tira o maior risco cedo). Prod sempre com o sim do Gabriel, depois do roteiro
completo no ITODEV (um login por cargo) e da contagem de contas por cargo antes e depois.

---

## Fase 1 — Banco: a tabela de membros vira a fonte

Branch `feat/NPAC-54-fase-1-membros`. Só `packages/db` (+ seed e testes). **Nenhuma mudança de
comportamento na API nem no web.** Spec: "Modelo" inteiro.

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 1.1 | Teste de equivalência **antes** de mexer (RED → base): grava, para cada conta do seed e uma desativada, o resultado de `app_role()`, `mentoria_perfil()`, `mentoria_admin()`, `mentoria_perfil_de()` com as funções de hoje | `db/test/areas-equivalencia.test.ts` existe e compara "versão de hoje" × "versão viva", no padrão de `fila-equivalencia.test.ts` | ✅ |
| 1.2 | Migration: `area_membros`, `user.mestre`, CHECKs, RLS de leitura (formato "uma vez por consulta"), grants, carga inicial, invariantes (ao menos um vínculo; ao menos uma Diretoria ativa) | `pnpm --filter @npac/db migrate` aplica no dev; contagem de vínculos = contagem de contas por cargo; `migrations.test.ts` e `rls-por-consulta.test.ts` verdes | ✅ |
| 1.3 | Funções trocam de fonte (tabela da spec) + funções novas `area_definir_membro`, `area_remover_membro`, `area_definir_mestre`, `area_gerencia`, ainda **com a regra de hoje** (Diretoria faz tudo; Admin do módulo troca perfil) | 1.1 verde; `rls.test.ts`, `mentoria-v2-*.test.ts`, `cargos.test.ts`, `access-requests.test.ts` verdes **sem edição das expectativas** | ✅ |
| 1.4 | Compatibilidade: visão `mentoria_perfis`, `mentoria_definir_perfil` por cima da função nova, gatilho que traduz escrita direta em `user.role`, resumo `user.role` + caixas fixas; seed e testes que inseriam em `mentoria_perfis` passam à função | Teste novo: `update "user" set role=…`, `mentoria_definir_perfil(…)` e `select … from mentoria_perfis` funcionam; `seed.test.ts` e `seed-mentoria.test.ts` verdes | ✅ |
| 1.5 | Teste-guarda "ninguém lê `user.role` nem a tabela antiga fora da lista de compatibilidade" + medição | Guarda verde; `pnpm perf:seed` + `scripts/perf/medir.sh` em `/api/leads` e Dashboard do SDR dentro de ±10% de `docs/plans/desempenho.md`; suítes `db`, `shared` e `api` verdes; `CLAUDE.md` (Banco e Papéis) atualizado | ✅ |

**Pronto quando (fase):** suíte da API e e2e do web passam sem nenhuma edição fora de `packages/db`
e do seed; no ITODEV, um login por cargo vê exatamente o que via.

**Notas da Fase 1 (19/11/2026):**
- Migration `0072_area_membros`. Testes novos: `db/test/areas-equivalencia.test.ts` (antes × depois da migration no
  mesmo banco, conta por conta, e funções de hoje × vivas depois de 11 trocas de cargo) e `db/test/areas-compat.test.ts`
  (compatibilidade, funções novas, invariantes, RLS de `area_membros` e o teste-guarda). `rls-por-consulta` passou a
  vigiar também funções `area_*` nas políticas.
- **Compatibilidade sem editar testes:** em vez de passar os testes que gravam em `mentoria_perfis` para a função
  (tarefa 1.4), a visão tem gatilhos INSTEAD OF que gravam o vínculo quando quem escreve é o dono do banco (seeds e
  testes); `npac_app` só tem SELECT nela. Assim as suítes da API e do e2e ficam sem edição. Só o seed do módulo passou à
  função (`area_definir_membro`, em nome da Diretoria) e `seed-mentoria.test.ts` trunca `area_membros` (era a tabela).
  **Fase 5:** apagar esses gatilhos junto com a visão e trocar a escrita nos testes por um helper (5.1).
- **Perfil esquecido** (linha em `mentoria_perfis` de quem não é do Acompanhamento): as funções de hoje já o ignoravam;
  não vira vínculo na carga nem pela visão. Diferença visível só numa lista: `condutores` da reunião mostrava o perfil ao
  lado do nome. Antes do deploy em prod, contar essas linhas (SQL de leitura) para saber se existem.
- **Regra de hoje nas funções novas:** Diretoria faz tudo; Admin do módulo troca perfil (e selo) de quem já é do
  Acompanhamento; Head do Comercial troca SDR/Closer de quem não é Head nem do Acompanhamento (o `guardLeadership`).
  O achado (Admin do módulo dá o selo a outro) continua aberto até a Fase 2.
- **Invariantes:** conta ativa que não é Diretoria tem vínculo; a última Diretoria ativa não sai nem é desativada (por UPDATE;
  apagar conta é só do dono do banco). `definido_por` vira nulo se a conta de quem definiu for apagada.
- **Desempenho** (`npac_e2e_perf`, mediana de 5): SDR `/api/leads` 24 ms (doc 28), Pipeline 32 (42), Hoje 36 (41),
  closer `/api/leads` 53 (56), Plano 108/54 (121/63), relatório do SDR (Dashboard) 143 ms (doc 127, +12,6%). A/B na
  mesma máquina, trocando só `app_role()` pela versão da 0021: 142–143 × 138–143 ms em 3 rodadas alternadas, ou seja,
  sem diferença; os +12,6% são da máquina no dia.
- **Pendente:** roteiro no ITODEV, um login por cargo, quando o rc da release com a 0072 chegar lá.


## Fase 2 — Regra única, na API e no banco

Branch `feat/NPAC-54-fase-2-regra`. Spec: "Regra única", "API", "Fechamento do achado".

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 2.1 | `packages/shared/src/areas.ts`: tipos, `podeGerenciar` e o arquivo de casos (todas as linhas da tabela da spec + os anti-objetivos) | `pnpm --filter @npac/shared test` verde com a tabela de casos; export `@npac/shared/areas` sem zod | ✅ |
| 2.2 | Gêmea em SQL dentro de `area_definir_membro`, `area_remover_membro`, `area_definir_mestre`, `area_gerencia`; `push_purge_user` usa `area_gerencia`; selo de Admin só pela Diretoria | O mesmo arquivo de casos roda em `db/test` contra o SQL e dá o mesmo resultado | ✅ |
| 2.3 | `admin/users` e `admin/access-requests`: sai `guardLeadership`, entra a regra; `@AllRoles()` + guarda "Mestre ou Head de alguma área"; lista e pedidos filtrados por área; escrita de cargo só por `area_definir_membro` | e2e novo por ator (Diretoria, Head do Comercial, Head do Acompanhamento): convida, aprova, troca cargo, redefine senha, desativa; 404 e 403 da regra; `admin.e2e`, `cargos.e2e`, `access-requests.e2e` atuais verdes | ✅ |
| 2.4 | `/api/me` com `mestre` e `areas`; `PUT /mentoria/perfis` recusa mudar `admin` sem ser Diretoria; leitores do cargo no código passam a olhar o vínculo | e2e: Admin do módulo tenta dar e tirar o selo de outro → 403; `acompanhamento-sem-comercial` verde com o caso "sem Head recebe 404 em `admin/*`" | ✅ |
| 2.5 | Auditoria das ações novas (com `area`, `cargo`, `head`) e `GET admin/acessos`, o registro de acessos da Diretoria (spec, D10); `CLAUDE.md` e status | e2e: cada ação da tabela da spec vira uma linha em `admin/acessos`; login e ação de lead não aparecem; quem não é Diretoria recebe 404; `pnpm lint && pnpm typecheck`; suítes `shared`, `db`, `api` verdes | ✅ |

**Notas da Fase 2 (19/11/2026):**
- Migration `0073_area_regra`: `area_regra` (gêmea pura, sem tabela), `area_conta_json`, `area_decidir` (regra com quem está
  logado), `area_exigir` (42501 com o motivo; invisível = "Acesso negado") e `area_contas()` (contas e vínculos só para a
  Diretoria e os Heads, para a API aplicar a regra). Testes: `shared/test/areas.test.ts` e `db/test/areas-regra.test.ts`
  (105 casos, mesmo veredito e mesma frase) e `apps/api/test/acesso-por-area.e2e.test.ts` (18 casos por ator, conta em duas
  áreas, `/api/me` e o registro de acessos).
- **Testes antigos que a spec mudou** (só a expectativa, nenhum outro): Head do Comercial não vê a conta da Carla (404 e
  fora da lista; `cargos.e2e`, `admin.spec.ts` do web) nem o pedido do Acompanhamento (`access-requests.e2e`, M9); o Admin
  do módulo não troca o próprio perfil (`mentoria-v2-base.e2e`, passa a trocar o de outra conta); `area_gerencia` do Admin
  do módulo sobre a área dele passa a ser verdadeiro (`db/test/areas-compat.test.ts`, que descrevia a regra de hoje).
- **Conta em duas áreas pelo `PATCH`**: troca só o cargo da área do campo Cargo e não tira a outra (M5). Se o cargo pedido
  é de outra área e a conta tem uma só, é troca de área (só a Diretoria: define a nova e tira a antiga). O `PATCH` com perfil
  numa conta cujo resumo é comercial dá 400 (o resolvedor ainda pensa em um cargo por pessoa). **Fase 4:** rotas por área e,
  se fizer sentido, o 400 "use o caminho por área" no `PATCH` de conta com duas áreas.
- **Conta nova** nasce do INSERT em `user` (o gatilho de compatibilidade cria o vínculo provisório) e o cargo é gravado
  por `area_definir_membro`, que confere a regra no banco; a Diretoria convidada nasce do próprio INSERT (a API conferiu).
  **Fase 5:** sem o gatilho, o INSERT passa a precisar de outro caminho (função que cria a conta já com o vínculo).
- **Ficou para a Fase 4:** `MentoriaGuard`, `PerfilGuard` e o MFA do módulo (`MFA_ROLES`) ainda olham o `role`; o web
  ainda decide `modules.mentoria` pelo resumo em alguns lugares. Só importam para quem tem as duas áreas.
- **Ficou para a Fase 3:** a tela do registro (`admin/acessos` devolve `tipo`, ator, alvo, área, cargo; a frase é do web) e o
  "entrou há X" (D12, tarefa 3.4).

**Pronto quando (fase):** pela API, a `duda` cria uma conta de Operação e aprova um pedido do
Acompanhamento; a `ana` não enxerga contas do Acompanhamento; ninguém além da Diretoria dá Head.

## Fase 3 — Telas: equipe por área

Branch `feat/NPAC-54-fase-3-telas`. Spec: "Telas". **Antes de codar:** confirmar com o Gabriel os textos
novos listados no fim da seção "Telas" (M3, M6) e mostrar 2–3 opções em imagem da aba Perfis.

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 3.1 | Textos e desenho aprovados pelo Gabriel (aba Perfis e Admin → Usuários da Diretoria) | Resposta dele registrada na spec | ✅ "1A, 2A, 3A" (D13 na spec) |
| 3.2 | Módulo → Configurações → Perfis: Convidar, Pedidos de acesso, cargo, Redefinir senha, Desativar; sai a nota "Conta nova: a Diretoria cria…" | Playwright: `duda` convida uma Operação, que entra direto no módulo; `duda` aprova um pedido; `duda` não vê o interruptor de Admin | ✅ |
| 3.3 | Admin → Usuários: Head do Comercial só vê o Comercial; Diretoria com filtro por área, cargos por área e o cartão "Acessos" (spec, D10) | Playwright: `ana` não vê contas do Acompanhamento nem o cartão; `diretor` filtra por área e vê no cartão, com "novo", a conta que a `duda` criou; `e2e/admin.spec.ts` verde | ✅ |
| 3.4 | "Entrou há X" (spec, D12): `ultimoUso` guardado na conta (no máximo uma gravação a cada 15 min por pessoa) e devolvido em `GET admin/users`; texto ao lado de cada nome nas duas listas | e2e da API: `ultimoUso` dentro do último minuto depois de um pedido; dois pedidos seguidos gravam uma vez; Sair não apaga; teste das frases; Playwright: `diretor` vê "entrou há…" em quem acabou de logar e "nunca entrou" em conta nova | ✅ (migration 0074) |
| 3.5 | Verificação visual e de peso | Capturas 375 / 768 / 1024 / 1440 das duas telas, sem rolagem lateral nem texto cortado; JS de `/leads` < 150 KB; cada tela que usa `cargo-field` reconferida | ✅ |
| 3.6 | Roteiro no ITODEV por cargo (login → onde cai → cliques no menu) + `CLAUDE.md` e status | Lista do que passou, com URL e login por cargo, entregue ao Gabriel | ✅ ITODEV v0.19.9-rc, 19/11 |

**Pronto quando (fase):** a Eduarda consegue, no ITODEV, fazer sozinha as 3 contas que pediu.
(19/11: com as respostas 1B e 2B da Eduarda, as 3 contas não existem mais como pedido. **Sugestão pendente**, sem o sim do
Gabriel: "a Eduarda cria sozinha, no ITODEV, uma conta de cada cargo atual do Acompanhamento e aprova um pedido de
acesso". A Fase 3 é conferida pelos dois critérios.)

**Notas da Fase 3 (19/11/2026):**
- Visual e textos aprovados: D13 na spec ("1A, 2A, 3A"), opções mostradas em imagem no visual real antes de codar.
- Aba Perfis do módulo usa `GET admin/users` e `GET admin/access-requests` (o Admin do módulo é o Head da área); perfil e
  selo continuam por `PUT mentoria/perfis`. O botão "Convidar" do topo da página abre a janelinha da lista por um evento da
  janela (`npac:perfis-convidar`). `GET mentoria/perfis` ficou sem uso na tela (a API continua).
- "Entrou há X": migration `0074_ultimo_uso` (`user.ultimo_uso`), `UltimoUso` na guarda de sessão. Testes: e2e da API
  `test/ultimo-uso.e2e.test.ts` (4) e `shared/test/acessos.test.ts` (frases do "entrou há" e do registro).
- `fraseAcesso` junta o selo ao cargo quando a conta nasce Admin do Acompanhamento ("· Acompanhamento, Acompanhamento e Admin
  do Acompanhamento"); a Diretoria convidada sai "· Diretoria". Combinação dos textos aprovados, sem texto novo.
- Teste antigo com expectativa trocada: `e2e/acompanhamento-v2-base.spec.ts` (a Duda não vê mais o interruptor de Admin, D9).
- Pedido do Gabriel no meio da fase (19/11): o convite chegar por e-mail. Recomendação: e-mail com o usuário e um link
  "Criar minha senha" (caminho do "Esqueci minha senha"), sem a senha no e-mail; PR à parte, aguardando o sim dele.
- **Convite por e-mail** (PR #141, Gabriel "texto ok, 1A, 2A"): o convite manda usuário, senha temporária e o botão para a
  tela de entrada da área; a tela continua mostrando a senha e avisa numa linha embaixo; "Nova senha" não manda e-mail.
- **Roteiro no ITODEV** (v0.19.9-rc, 19/11, um login por cargo e duas contas de teste novas criadas no próprio roteiro):
  Eduarda entra pela tela do Acompanhamento e cai na Fila; Configurações → Perfis sem
  interruptor de Admin; convida uma Operação (a tela diz que o e-mail saiu), gera nova senha, desativa e reativa; a conta
  nova troca a senha e cai na Fila (celular, 390 px). Diretoria cai no Dashboard; Admin → quadro "Acessos" com "Eduarda criou
  a conta de … · Acompanhamento, Operação" e "novo"; "entrou agora" na conta nova; filtro Acompanhamento esconde o Comercial;
  "Ver tudo" abre. Head do Comercial novo cai no Dashboard e, no Admin, não vê o quadro nem contas do Acompanhamento.
  14 de 14 passos ✅. Não conferido: a chegada do e-mail (endereço de teste `.local`, sem caixa real).
- **Para a Fase 4:** "também no Comercial/Acompanhamento" e a frase de conta em duas áreas já aparecem quando a API manda
  `outraArea`; "Adicionar a outra área" continua da Fase 4.

## Fase 3B — Alcance "só a carteira" (2B)

Entre a 3 e a 4 (Gabriel, 19/11: "Sim, entre 3 e 4"). Sem tarefas ainda: a sessão da fase escreve a spec e confere com o
Gabriel no começo.

**Respostas da Eduarda (19/11, "1A, 2A, 3A", repassadas pelo Gabriel):**
- 1A. Na carteira dela, a pessoa faz tudo o que o perfil Acompanhamento faz no dia a dia (reuniões, tarefas, metas, PME e
  onboarding), mas só nos mentorados em que é a responsável.
- 2A. Cadastra mentorado novo, que já entra na carteira dela, com ela como responsável.
- 3A. Nome do cargo na tela: **"Acompanhamento da carteira"**. (Com o desenho do Gabriel vira o alcance: "Acompanhamento · só a carteira".)

**Desenho (Gabriel, 19/11):** cargo Acompanhamento + alcance por pessoa ("Todos os mentorados" ou "Só a carteira"),
escolhido pela Eduarda ou pela Diretoria. Sem cargo novo. O que é só do Admin continua só do Admin (excluir, anonimizar,
transferir carteira, catálogo de PMEs, CSV com contato). Detalhe na spec.

**Em aberto para o Gabriel no começo da fase:** (a) CSV do módulo para quem tem "só a carteira": só da carteira ou nenhum? (b) A visão
"Equipe" da Fila some para ele? (c) O push da Fila que vai "a todos do perfil": só os da carteira? (d) Inscrição tirada da
carteira deixa de ser vista (esperado). (e) Pode trocar o responsável de um mentorado da carteira? (acrescentada na fase)

Branch `feat/NPAC-54-fase-3b-carteira`. Spec: "Fase 3B — Alcance 'só a carteira'". Desenho do Gabriel (19/11): cargo Acompanhamento
+ alcance "Todos os mentorados / Só a carteira" por pessoa; extras por pessoa são o destino e nascem com o primeiro extra real (não na 3B). Conferido no código: a dica da lista da Especialista serve para 12 políticas; reuniões, tarefas, metas e check-ins precisam do caso novo. **Antes do squash:** PR aberto com o CI verde → parar e avisar a sessão coordenadora, que lê a migration (primeira fase que muda visibilidade com prod em uso).

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 3B.1 | Spec da fase (cargo Acompanhamento + alcance, Gabriel 19/11) + desenho do formulário, textos novos e respostas (a)–(e) | Respostas registradas na spec | ✅ (19/11: formulário "Alcance", textos, (a) CSV só da carteira, (b) só "Minha fila", (c) push só da carteira, (d) some na hora, (e) não troca a responsável) |
| 3B.2 | Banco (migration 0075): `area_membros.alcance` (`TODOS` padrão, `CARTEIRA` só no cargo Acompanhamento), `area_definir_membro` com o alcance e a regra única, `mentoria_so_carteira()`, lista da 0061 com a carteira, políticas de reuniões, tarefas, metas e check-ins, funções por linha e `SECURITY DEFINER` que devolvem dado de inscrição, INSERT de inscrição só com ela de responsável, push "a todos do perfil" recortado | `db/test/carteira.test.ts`: com "só a carteira" vê e edita só a carteira; inscrição tirada some; não cria inscrição de outra; `TODOS` = hoje (equivalência); `rls-por-consulta`, `areas-equivalencia`, `fila-equivalencia`, `areas-regra` e `migrations` verdes | ⏳ |
| 3B.3 | Shared + API: alcance em `sh/cargos.ts`, casos em `areas-casos.ts` (Head troca o alcance de quem não é Head; ninguém o próprio), `admin/users`, `access-requests` e `mentoria/perfis` recebem o alcance, `/api/me` e `GET admin/users` devolvem, cadastro com responsável fixo, CSV, Fila e push pelas respostas | e2e da API `carteira.e2e.test.ts`: cada rota do módulo com "só a carteira" (200 na carteira, 404 fora, 404 no que é só do Admin); `duda` convida e aprova com "só a carteira"; suítes `shared` e `api` verdes | ⏳ |
| 3B.4 | Web: campo "Alcance" (Todos os mentorados / Só a carteira) na aba Perfis, no convite e na aprovação, só no cargo Acompanhamento; "Acompanhamento · só a carteira" nas listas; Fila, cadastro com responsável fixo, filtro "Responsável" escondido | Playwright por login real (entra → cai na Fila → Mentorados → Ficha → Reuniões) vendo só a carteira; capturas 375 / 768 / 1024 / 1440; JS de `/leads` < 150 KB | ⏳ |
| 3B.5 | Roteiro no ITODEV (conta de teste com "só a carteira" criada pela conta de teste da Eduarda) + `CLAUDE.md` e status | Lista do que passou, com URL e login por cargo, entregue ao Gabriel | ⏳ |

## Fase 4 — Pessoa em duas áreas

Branch `feat/NPAC-54-fase-4-duas-areas`. Spec: "API" (rotas por área), "Telas" item 3.

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 4.1 | `PUT` e `DELETE admin/users/:id/areas/:area` (só Diretoria); `PATCH` em conta com duas áreas responde 400 | e2e: Diretoria põe a `sonia` como Especialista e tira; Head recebe 404/403 | ⏳ |
| 4.2 | Guardas: `MentoriaGuard` pelo vínculo; `PerfilGuard` com `membro`; MFA do módulo pelo vínculo | e2e novo `duas-areas`: a `sonia` usa as rotas do comercial como Closer e as do módulo como Especialista (só as reuniões que conduz); `acompanhamento-sem-comercial` verde | ⏳ |
| 4.3 | Web: menu, `/`, `not-found`, Mais e `modules.mentoria` pelo vínculo; "Adicionar a outra área" no Admin da Diretoria | Playwright: `sonia` entra por `/login` e vê os dois menus; entra por `/login/acompanhamento` e cai no módulo | ⏳ |
| 4.4 | Head de cada área vê a pessoa com `outraArea`; senha e desativar bloqueados com a frase da spec | Playwright + capturas 375 / 768 / 1024 / 1440 | ⏳ |
| 4.5 | Roteiro no ITODEV + `CLAUDE.md` e status | Lista do que passou entregue ao Gabriel | ⏳ |

**Pronto quando (fase):** uma conta com as duas áreas trabalha nas duas com um login, e nenhum Head
alcança a outra área por ela.

## Fase 5 — Limpeza da compatibilidade

Branch `chore/NPAC-54-fase-5-limpeza`. **Só depois** de as fases 1–4 estarem em prod e de uma release
inteira sem rollback. Spec: "Compatibilidade".

| # | Tarefa | Pronto quando | Status |
|---|---|---|---|
| 5.1 | Testes e seeds deixam de escrever `user.role` direto (10 arquivos, 22 pontos em 19/11) e passam a um helper que chama `area_definir_membro` | `grep` por `set role` nos testes vazio; suítes verdes | ⏳ |
| 5.2 | Migration: sai o gatilho que traduz escrita em `user.role` (escrita direta passa a dar erro), sai a visão `mentoria_perfis` e `mentoria_definir_perfil` | Teste-guarda da fase 1 sem lista de compatibilidade; `migrations.test.ts` verde | ⏳ |
| 5.3 | `CLAUDE.md`, status e nota de que `user.role` é resumo (M7) | Suítes `db`, `api`, `shared` e e2e do web verdes | ⏳ |

**Notas para a Fase 5:**
- O convite de conta nova ainda registra a área pelo gatilho de compatibilidade de `user.role` (insert com `role`); antes
  de remover o gatilho, o convite precisa de caminho próprio no banco.

---

## Pendências com o Gabriel (não travam as fases 1 e 2)

- Conferir as decisões M2–M10, M12 e M13 da spec (M1 e M11 ele confirmou em 19/11).
- Textos novos de tela (antes da fase 3).
- Religar MFA para Diretoria e Heads e ter duas contas de Diretoria (recomendação, fora deste plano).
- Com a Eduarda (respondido em 19/11): **1B** — a Maria dos envios só ganha conta quando existir o cargo Envios, que vem
  com a tela Envios físicos (fase 4 do Acompanhamento; D6). **2B** — a segunda Maria deve ver só os mentorados da carteira
  dela (inscrições em que é responsável); vira o alcance "só a carteira", fase 3B da tabela de fases (Gabriel, 19/11: "Sim, entre 3 e 4").
  Até lá, nenhuma das duas tem conta. A Fase 3 não acrescenta cargo: a lista do Acompanhamento continua a de hoje.
  - **Avisar a Eduarda:** o nome pedido por ela ("Acompanhamento da carteira", 3A) vira "Acompanhamento · só a carteira" na
    tela (alcance no cargo Acompanhamento, não cargo novo; Gabriel, 19/11).
  - **Extras por pessoa** (ex.: "+ envios", Gabriel 19/11) são o destino; nascem com o primeiro extra real. Envios: cargo
    próprio (D6, 1B) ou caixinha é decisão da fase da tela Envios físicos.
  Dica para o cargo da carteira (conferida na Fase 3B: serve em parte, ver a fase): a lista que hoje cobre só a Especialista
  (`mentoria_ids_especialista`) pode ganhar o caso da carteira sem reescrever políticas; a regra de quem pode ser
  responsável (hoje só o perfil Acompanhamento) precisa aceitar o cargo novo.

## Brief de cada sessão (copiar e trocar a fase)

```
Goal: executar a Fase N do plano de acesso por área (NPAC-54) e deixá-la mesclada na release aberta.
Where: repo npac-corporation, branch a partir da release/vX.Y aberta; plano docs/plans/acesso-por-area.md
  (Fase N); spec docs/superpowers/specs/2026-11-19-acesso-por-area-design.md.
Decided:
  - A tabela area_membros é a fonte do cargo; user.role é só resumo calculado.
  - Nenhuma política de RLS é reescrita; as funções trocam de fonte com o mesmo resultado.
  - Regra única de quem gerencia quem (tabela da spec); só a Diretoria dá e tira Head.
  - Nomes na tela não mudam; texto novo de tela só com o sim do Gabriel.
  - Só as tarefas da Fase N; o que for de outra fase vira nota no plano.
Done when: os "pronto quando" da Fase N passam, com o comando e a saída no relatório.
Limits: push/PR/merge pelas regras de Git (squash só com o CI inteiro verde); prod precisa do sim do
  Gabriel; sem outras sessões; relatório final em até 5 linhas.
```
