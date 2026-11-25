# NPAC-60 — Cronograma do PME: plano de implementação

> **Para quem executa:** use superpowers:executing-plans (uma sessão por fase). Passos com `- [ ]`. Ao fechar cada
> tarefa, troque a linha **Situação** dela e faça commit do plano junto.

**Objetivo:** o cronograma da planilha (experiências, desafios, filmes, livros e EAP) passa a morar no sistema: banco
de itens, itens escolhidos no envio de cada PME virando tarefas do ciclo, sem repetir o que a pessoa já recebeu (nem do
RDV para a 2M), aba "Cronograma" na ficha e importação única da planilha.

**Arquitetura:** catálogo `mentoria_cronograma_itens` (Admin) + duas colunas em `mentoria_tarefas` (origem `PME` já
existe e nunca é criada) + `mentoria_cronograma_anteriores` (o que veio da planilha e não virou tarefa). "Já recebeu" é
calculado em SQL por `mentoria_cronograma_recebidos(inscricao)`, que atravessa as inscrições da mesma pessoa pelo índice
cego. A tela reusa as peças do sistema (lista `.pl-mod`, seletor `.seg`, `.ob-h`).

**Stack:** pnpm/Turborepo, NestJS + Drizzle + Postgres 16 (RLS), Next 16, Vitest, Playwright.

**Desenho:** `docs/superpowers/specs/2026-11-24-cronograma-design.md` (decisões R1–R8 e C1–C15).
**Protótipo aprovado:** `docs/acompanhamento/prototipo/cronograma/` (versão 2; `*-1440-claro.png`, `*-375-claro.png`).

## Fases (uma sessão e um PR por fase; cada uma testada no ITODEV antes da próxima)

| Fase | Tarefas | Entrega | Situação |
|---|---|---|---|
| 1. Banco de dados, regras e API | 1–3 | envio com itens por API, banco de itens por API, Fila sem cobrança de item | ✅ 25/11 (0091, PR na `release/v0.26`) |
| 2. Telas | 4–7 | banco, janela de envio + troca, card do PME, aba da ficha | ⏳ |
| 3. Importação | 8–10 | prévia e importação da planilha em 3 passos | ⏳ |

**Nota da fase 1 (25/11):** enquanto a fase 1 rodava, as releases v0.23 a v0.25 foram para a `main` e a `main` ganhou as
migrations 0085 a 0090. A migration do cronograma virou **0091** e o PR foi para a `release/v0.26` (branch
`feat/NPAC-60-cronograma-fase-1`). Onde abaixo diz 0085, leia 0091.

**Antes da fase 1 (histórico):** não há `release/v*` aberta (a v0.22 foi para a `main` em 24/11). Abrir a `release/v0.23` (Actions →
Release → `cut-release`, `RELEASING.md` passo 3) e refazer a branch `feat/NPAC-60-cronograma` a partir dela (`git rebase
--onto origin/release/v0.23`): hoje ela só tem o desenho, o protótipo e este plano.

## Regras globais (valem para toda tarefa)

- Migration nova = **0085** (a `main` já tem a 0084). Uma por fase no máximo; nunca reescrever migration aplicada;
  `_journal.json` com `idx` e `when` crescentes (`db/test/migrations.test.ts`).
- Política de leitura sem função por linha: `(select f())` e `inscricao_id = any ((select mentoria_ids_visiveis())::uuid[])`
  ou `(select mentoria_ve_todas()) or …`; caso novo no teste-guarda `db/test/rls-por-consulta.test.ts`.
- `npac_app` sem DELETE nas tabelas do módulo: tirar item = função SECURITY DEFINER. Cargo lido por `mentoria_perfil()`/
  `mentoria_admin()`, nunca `user.role` (`db/test/areas-compat.test.ts`).
- Função SQL grande do módulo: `SET jit = off`.
- Texto da tarefa cifrado com AAD (`aad('mentoria_tarefas', 'descricao', id)`), como as extras. Item do banco é material
  do programa: texto claro.
- Invisível = 404; pode ver mas não pode = 403/404 como o resto do módulo. Erros em português (`BadRequestException('…')`).
- Histórico só com nomes de campo, nunca o texto do item. Nada de nome de mentorado em log, URL ou auditoria.
- O CSV real da Eduarda **nunca** entra no repositório nem em ferramenta: testes usam o fictício
  `packages/shared/test/fixtures/cronograma-ficticio.csv` (mesma forma: BOM, células com quebra de linha, 5 blocos,
  cabeçalhos "Column N", modelo do PME no fim).
- Web: nada disso pode pesar em `/leads` (limite de 150 KB): constantes em `@npac/shared/mentoria`, sem zod no cliente.
- Telas iguais ao protótipo nas 4 larguras (375/768/1024/1440), claro e escuro, toque de 44 px e campo de 16 px no
  celular. Textos da tela exatamente os do protótipo.
- `CLAUDE.md` ganha a seção "Cronograma do PME (NPAC-60)" no PR de cada fase (o que a fase fez).

## Pontos de atenção da revisão (cada um tem teste na tarefa dona)

1. **Repetir pela outra inscrição:** item recebido no RDV oferecido de novo na 2M da mesma pessoa (WhatsApp ou e-mail
   igual) → a API recusa com 409 "Esse item já foi do RDV" (tarefa 3).
2. **Especialista:** não vê banco, aba, rotas nem as tarefas `PME` no card → 404 e lista sem elas (tarefas 2 e 3).
3. **Fila e push:** tarefa `PME` pendente no dia do prazo não gera `COBRANCA` nem push; extra e reunião continuam
   gerando (tarefa 2).
4. **Importação duas vezes:** a segunda não muda nada; coluna com mais de uma candidata (RDV e 2M) nunca liga sozinha
   (tarefa 9).
5. **CSV fora do padrão:** BOM, célula com quebra de linha, "8 MÊS", "12", "13º mês" (ignorado), "já leram",
   "não concluiu", nome solto, linhas do modelo no fim → lidas como o desenho manda (tarefa 8).

---

## Fase 1 — banco de dados, regras e API

### Tarefa 1: regras puras do cronograma (shared)

**Situação:** ✅ 24/11 — `sh/mentoria/cronograma.ts` + 11 testes; além do pedido, `motivoJaRecebido` (frase do 409) e
`LIMITE_CRONOGRAMA_ENVIO`/`LIMITE_TEXTO_ITEM`. `PLANEJADO` do número entra todo na sugestão (mesmo além do modelo).

**Arquivos:**
- Criar: `packages/shared/src/mentoria/cronograma.ts` (exportado em `packages/shared/src/mentoria/index.ts`)
- Teste: `packages/shared/test/cronograma.test.ts`

**Interfaces (produz):**
- `BLOCOS = ['EXPERIENCIA','DESAFIO','FILME','LIVRO','EAP'] as const`, `type Bloco`
- `BLOCO_LABEL: Record<Bloco,string>` = Experiência, Desafio, Filme, Livro, EAP; `BLOCO_PLURAL` = Experiências,
  Desafios, Filmes, Livros, EAP
- `MODELO_PME: Record<Bloco, number>` = EAP 3, EXPERIENCIA 1, DESAFIO 1, FILME 2, LIVRO 1 (C5)
- `normalizarItem(texto: string): string` (minúsculas, sem acento, pontuação e espaços colapsados; base do único)
- `semCronograma(variante: string | null): boolean` (contém "sem cronograma", sem acento/maiúsculas) (C6)
- `type ItemBanco = { id: string; bloco: Bloco; texto: string; ordem: number; ativo: boolean }`
- `type Recebido = { itemId: string; bloco: Bloco; pmeNumero: number | null; resultado: 'FEITA'|'PARCIAL'|'NAO_FEITA'|'PENDENTE'|'RECEBIDO'|'NAO_FEZ'|'JA_TINHA'|'PLANEJADO'; inscricaoId: string; mentoria: string; propria: boolean }`
- `sugerirItens(banco: ItemBanco[], recebidos: Recebido[], numero: number, sem: boolean): Record<Bloco, ItemBanco[]>`:
  sem cronograma → tudo vazio; senão, por bloco, primeiro os `PLANEJADO` próprios de `numero`, depois os ativos em
  ordem que não estão "já recebidos" (definição da seção 6 do desenho), até `MODELO_PME[bloco]`.
- `jaRecebido(r: Recebido, numero: number): boolean` (a regra da seção 6: `PLANEJADO` próprio não conta)

- [x] **Passo 1: testes que falham** — `normalizarItem('  Já LEU,  o Pacto!! ')` = `'ja leu o pacto'`;
  `semCronograma('2M sem Cronograma')` = true; `sugerirItens` devolve 1 desafio, 2 filmes e 3 EAP, pula o item recebido
  em outra inscrição, põe o `PLANEJADO` do nº pedido primeiro, ignora item inativo e devolve tudo vazio com `sem = true`.
- [x] **Passo 2:** `pnpm --filter @npac/shared test -- cronograma` → falha (módulo não existe).
- [x] **Passo 3:** implementar em `cronograma.ts`.
- [x] **Passo 4:** `pnpm --filter @npac/shared test` → passa.
- [x] **Passo 5:** commit `feat(NPAC-60): regras puras do cronograma`.

### Tarefa 2: migration 0085 (tabelas, RLS, funções, Fila)

**Situação:** ✅ 25/11 — saiu como **0091** (`0091_cronograma_pme.sql`). Além do pedido: a política
`mentoria_tarefas_criar` passou a aceitar origem PME pela área `PME` (senão a Operação não criaria); gatilho que põe o
bloco do item na tarefa; gatilho que liga o `PLANEJADO` ao enviar (`tarefa_id`); CHECK "PME exige ciclo". Testes:
`mentoria-cronograma.test.ts` (16), bloco NPAC-60 em `fila-equivalencia`, contagens em `rls-por-consulta`.

**Arquivos:**
- Criar: `packages/db/drizzle/0085_cronograma_pme.sql` + `meta/0085_snapshot.json` + entrada em `_journal.json`
- Modificar: `packages/db/src/schema/mentoria.ts` (tabelas e colunas novas)
- Teste: `packages/db/test/mentoria-cronograma.test.ts`; caso novo em `packages/db/test/fila-equivalencia.test.ts` e
  `rls-por-consulta.test.ts`

**Interfaces (produz):**
- `mentoria_cronograma_itens` e `mentoria_cronograma_anteriores` como na seção 6 do desenho (colunas, CHECK, únicos).
  `anteriores.inscricao_id` com `ON DELETE CASCADE` (a exclusão da inscrição leva).
- `mentoria_tarefas.cronograma_bloco text`, `cronograma_item_id uuid` (FK), CHECK "origem `PME` ⇔ bloco preenchido",
  único parcial `(ciclo_id, cronograma_item_id) WHERE cronograma_item_id IS NOT NULL`.
- Leitura: itens para Admin, Acompanhamento e Operação; anteriores pela RLS da inscrição; escrita do banco só Admin;
  `npac_app` sem DELETE.
- `mentoria_cronograma_recebidos(inscricao uuid) RETURNS TABLE(item_id uuid, bloco text, pme_numero smallint,
  resultado text, inscricao_id uuid, mentoria text, propria boolean)` (SECURITY INVOKER, STABLE, `SET jit = off`):
  tarefas `PME` com item + linhas de `anteriores`, desta inscrição e das que têm pessoa com `whatsapp_idx` ou
  `email_idx` igual; a RLS de quem chama recorta.
- `mentoria_cronograma_remover(tarefa uuid, versao int) RETURNS void` (SECURITY DEFINER): só origem `PME`, `PENDENTE`,
  sem comprovante, ciclo aberto, `mentoria_edita('PME', inscricao)`; senão 42501/P0002/22023 (como a 0084); devolve a
  linha `PLANEJADO` (se houver) a `tarefa_id = null`; histórico `pme.cronograma_removido` com o bloco.
- `mentoria_fila` e `mentoria_avisos_candidatos`: copiar a **última** definição (`grep -l "FUNCTION mentoria_fila("
  packages/db/drizzle/*.sql | tail -1`, idem avisos) e acrescentar `AND t.origem <> 'PME'` no ramo `COBRANCA`/`cobranca:`.

- [x] **Passo 1: testes que falham** (em `mentoria-cronograma.test.ts`, no padrão de `mentoria-v2-pmes.test.ts`):
  Especialista lê 0 itens e 0 anteriores; Operação lê itens e não grava; Acompanhamento "só a carteira" lê anteriores só
  da carteira; `recebidos` da 2M traz o item do RDV de pessoa com mesmo WhatsApp e não traz o de pessoa diferente;
  `remover` recusa tarefa feita, com comprovante ou de ciclo fechado; tarefa `PME` pendente no prazo não aparece em
  `mentoria_fila` nem em `mentoria_avisos_candidatos`, e a `EXTRA` do mesmo ciclo aparece; tarefa com item repetido no
  mesmo ciclo falha no único.
- [x] **Passo 2:** `pnpm --filter @npac/db test -- mentoria-cronograma` → falha.
- [x] **Passo 3:** escrever a 0085 e o schema; `pnpm --filter @npac/db build && pnpm --filter @npac/db migrate` no dev.
- [x] **Passo 4:** `pnpm --filter @npac/db test` → tudo passa (inclui `fila-equivalencia`, `rls-por-consulta`,
  `migrations`, `areas-compat`).
- [x] **Passo 5:** commit `feat(NPAC-60): tabelas e regras do cronograma no banco`.

### Tarefa 3: API do cronograma (envio, troca, banco)

**Situação:** ✅ 25/11 — `cronograma.controller.ts` (serviço e os dois controllers no mesmo arquivo, como `pmes`),
`prepararCronograma`/`inserirCronograma`/`lerRecebidos` em `ciclos.service.ts`, `pode.verCronograma` na ficha,
`cronogramaBloco`/`cronogramaItemId` no `TarefaDTO`. Item repetido no mesmo PME: 409 "Esse item já está neste PME".
`DELETE …/cronograma` responde 204. Testes: `mentoria-v2-cronograma.e2e.test.ts` (13).

**Arquivos:**
- Criar: `apps/api/src/mentoria/cronograma.controller.ts`, `cronograma.service.ts` (registrar no `mentoria.module.ts`)
- Modificar: `apps/api/src/mentoria/ciclos.service.ts` (`enviarNaTx` recebe os itens), `ciclos.controller.ts`,
  `packages/shared/src/schemas/mentoria.ts` (schemas), `packages/shared/src/mentoria/dto.ts` (`FichaDTO.pode.verCronograma`,
  `CronogramaDTO`), `apps/api/src/mentoria/ficha.service.ts` (`pode.verCronograma`)
- Teste: `apps/api/test/mentoria-v2-cronograma.e2e.test.ts`

**Interfaces (produz):**
- `GET mentoria/inscricoes/:id/cronograma` → `CronogramaDTO = { banco: ItemBanco[]; recebidos: Recebido[]; proximo:
  number | null; sugestao: Record<Bloco, ItemBanco[]>; semCronograma: boolean; podeEscolher: boolean }` (Admin,
  Acompanhamento, Operação; Especialista e demais 404).
- `POST mentoria/inscricoes/:id/ciclos` ganha `cronograma?: { itemId?: string; bloco: Bloco; texto?: string }[]` (até
  20); `enviarNaTx(tx, inscricaoId, hoje, enviadoEm?, cronograma = [])` cria as tarefas `PME` (ordem: extras →
  cronograma → encerramento) e liga os `PLANEJADO` escolhidos. Item já recebido → 409 `"Esse item já foi do <Nº PME |
  RDV | 2M | 6M>"`; inativo → 400 "Esse item está escondido no banco"; texto vazio/ > 2000 → 400.
- `POST mentoria/ciclos/:id/cronograma` (mesmo corpo, ciclo aberto) e `DELETE mentoria/tarefas/:id/cronograma`
  (`{ version }`, chama `mentoria_cronograma_remover`).
- Banco (`@SoAdmin()`): `GET mentoria/cronograma/itens?bloco=`, `POST mentoria/cronograma/itens` `{ bloco, texto }`,
  `PATCH mentoria/cronograma/itens/:id` `{ version, texto?, ativo? }` (409 `VERSION_CONFLICT`; mesmo texto normalizado
  no bloco → 409 "Esse item já está no banco"). Cada item volta com `envios` (quantas tarefas o usam).
- Marcar resultado das tarefas `PME`: nenhuma rota nova (o `PATCH tarefas/:id` atual serve; Operação continua recusada).

- [x] **Passo 1: testes que falham:** Operação envia o 2º PME com 8 itens e a % do ciclo passa a contar 8 + extras +
  encerramento; Acompanhamento marca uma `PME` como FEITA e a Operação recebe recusa ao marcar; item do RDV da mesma
  pessoa → 409 com "RDV"; Especialista → 404 em todas as rotas novas; Admin cria, corrige e esconde item, texto repetido
  → 409; Acompanhamento no banco → 404; tirar item pendente funciona e tirar item feito → recusa; envio sem
  `cronograma` continua igual a hoje (teste antigo de `mentoria-v2-pmes.e2e.test.ts` passa).
- [x] **Passo 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-cronograma.e2e.test.ts` → falha.
- [x] **Passo 3:** implementar (validação por Zod no shared, `withUser`, histórico `pme.enviado` com o campo
  `cronograma`, `pme.cronograma_incluido`).
- [x] **Passo 4:** `pnpm --filter @npac/api test` e `pnpm lint && pnpm typecheck` → passam.
- [x] **Passo 5:** commit; `CLAUDE.md` (seção nova, fase 1); PR `feat(NPAC-60): cronograma do pme no banco e na api` na
  `release/v0.23`; CI verde; ITODEV: enviar um PME com itens pela API e conferir no banco; plano com fase 1 ✅.

## Fase 2 — telas (iguais ao protótipo versão 2)

### Tarefa 4: Configurações → Cronograma (banco)

**Situação:** ⏳

**Arquivos:** criar `apps/web/components/acompanhamento/cronograma-banco.tsx`; modificar
`apps/web/app/(app)/acompanhamento/configuracoes/page.tsx` (aba `cronograma` depois de `pmes`, só Admin, `SUB` =
"Os itens que vão em cada PME. Item já enviado não se apaga: esconda para ele sair das sugestões."); CSS só no fim de
`modulo.css` sob `.ac`. Teste: `apps/web/e2e/acompanhamento-cronograma-banco.spec.ts`.

**Consome:** rotas do banco (tarefa 3), `BLOCO_PLURAL`.

- [ ] **Passo 1:** e2e que falha: Admin abre Configurações → Cronograma, troca para "Filmes", cria "Filme Fictício",
  esconde e vê "Escondido · 0 envios"; Acompanhamento não vê a aba.
- [ ] **Passo 2:** implementar como `banco-1440-claro.png`/`banco-375-claro.png` (seletor `.seg` rolando no celular,
  `.pl-lista` com `.pl-n`, texto em 2 linhas, ›; edição numa janela `<dialog class="dlg">` com texto e Esconder/Mostrar).
- [ ] **Passo 3:** e2e passa; commit.

### Tarefa 5: janela de envio + troca

**Situação:** ⏳

**Arquivos:** criar `apps/web/components/acompanhamento/cronograma-envio.tsx` (janela) e `cronograma-troca.tsx`
(caixa suspensa ≥ 768 px / tela própria no celular), carregados por `next/dynamic`; modificar `pme-atual.tsx` (o
"Registrar envio" abre a janela nova) e `fila.tsx` (`ENVIAR_PME` deixa de ser um clique: "Registrar envio" abre a mesma
janela). Teste: `apps/web/e2e/acompanhamento-cronograma-envio.spec.ts`.

**Consome:** `GET …/cronograma` (sugestão, banco, recebidos), `POST …/ciclos` com `cronograma`.

- [ ] **Passo 1:** e2e que falha: Operação abre a janela pela Fila, vê 8 sugestões com "Estava na planilha para este
  PME" no planejado, troca o desafio (o recebido no RDV aparece apagado e não clica), adiciona um "só para ele",
  envia e o card mostra "Cronograma deste PME · 0 de 9 feitos"; no iPhone (projeto `iphone`) a troca abre como tela
  própria com "Voltar" e nada sai da tela.
- [ ] **Passo 2:** implementar como `envio-*.png` e `envio-trocar-*.png` (lista `.pl-mod` com cabeçalho por bloco,
  rodapé fixo, busca filtrando por `normalizarItem`, "Tirar do PME", inscrição "sem cronograma" sem sugestões com o
  aviso "Inscrição sem cronograma").
- [ ] **Passo 3:** e2e passa; `e2e/resposta-imediata.spec.ts` e `acompanhamento-v2-fila-cobranca.spec.ts` continuam
  verdes; commit.

### Tarefa 6: card do PME e aba "Cronograma"

**Situação:** ⏳

**Arquivos:** modificar `pme-atual.tsx` (grupo "Cronograma deste PME · N de M feitos" e "Montar o cronograma"),
`ficha.tsx` + `ui.tsx` (`Aba` ganha `'cronograma'` depois de `'evolucao'`, só com `pode.verCronograma`; página da ficha
igual à regra da Evolução), criar `apps/web/components/acompanhamento/cronograma-aba.tsx`. Teste:
`apps/web/e2e/acompanhamento-cronograma-aba.spec.ts`.

- [ ] **Passo 1:** e2e que falha: na aba, "2º PME · 1 de 8 feitos", item do RDV em "No RDV", filtro "Filmes" mostra só
  filmes; Especialista não vê a aba e `?aba=cronograma` cai na Jornada.
- [ ] **Passo 2:** implementar como `aba-*.png` e `card-*.png`.
- [ ] **Passo 3:** e2e passa; commit.

### Tarefa 7: conferência visual e PR da fase 2

**Situação:** ⏳

- [ ] **Passo 1:** capturas das telas novas em 375/768/1024/1440, claro e escuro, lado a lado com as do protótipo;
  listar e corrigir as diferenças.
- [ ] **Passo 2:** `mobile-layout-*` do módulo, limite de `/leads` e `pnpm --filter @npac/web e2e` passam.
- [ ] **Passo 3:** `CLAUDE.md` (fase 2); PR `feat(NPAC-60): telas do cronograma`; ITODEV com roteiro por perfil (Admin,
  Acompanhamento, Operação, Especialista); plano com fase 2 ✅.

## Fase 3 — importação da planilha

### Tarefa 8: leitura do CSV e casamento de colunas (shared)

**Situação:** ⏳

**Arquivos:** modificar `packages/shared/src/mentoria/cronograma.ts`; criar a fixture fictícia
`packages/shared/test/fixtures/cronograma-ficticio.csv`; teste `packages/shared/test/cronograma-planilha.test.ts`.

**Produz:**
- `lerCronograma(csv: string): PlanilhaCronograma = { itens: { bloco: Bloco; texto: string; linha: number }[];
  colunas: { indice: number; cabecalho: string; marcas: { linhaItem: number; pmeNumero: number | null; resultado:
  'RECEBIDO'|'NAO_FEZ'|'JA_TINHA' }[]; ignoradas: number }[]; ignoradasPorMotivo: Record<string, number> }` — regras do
  passo 2 da seção 8 do desenho e C9/C15.
- `casarColunas(colunas, inscricoes: { id; nomes: string[]; tipo; mentoria; status; pmeAtual: number | null }[]):
  { indice: number; situacao: 'LIGADA'|'DUVIDA'|'SEM_FICHA'|'SEM_MARCACAO'; candidatas: string[]; maiorMes: number |
  null }[]` — C14 (várias candidatas, inclusive RDV e 2M, = dúvida; nunca escolhe sozinha).

- [ ] **Passo 1:** testes que falham com a fixture: 5 blocos com a contagem certa, "Column N" e as linhas do modelo
  ignoradas, "8 MÊS"/"12" viram mês, "13º mês" e nome solto ignorados, "já leram" → `JA_TINHA`, "não concluiu" →
  `NAO_FEZ`, item repetido junta no menor mês, célula com quebra de linha e BOM; casal "A e B" e "A/B" casam com CASAL;
  nome com RDV e 2M → `DUVIDA`.
- [ ] **Passo 2–4:** falha → implementar → `pnpm --filter @npac/shared test` passa; commit.

### Tarefa 9: API da importação

**Situação:** ⏳

**Arquivos:** criar `apps/api/src/mentoria/importacao/cronograma-importacao.controller.ts` (`@MentoriaController('cronograma')`,
`@SoAdmin()`, rotas `importar/previa` e `importar` para usar o limite de 25 MB do `app.setup.ts`) e
`cronograma-importacao.service.ts`; schema `importarCronogramaSchema = { csv: string (≤ 5 MB), decisoes?: Record<string,
string | 'IGNORAR'> }`; teste `apps/api/test/mentoria-v2-cronograma-importacao.e2e.test.ts`.

**Produz:** prévia `{ itens: { bloco; novos; existentes; juntados }[]; colunas: (casamento + nome + mentoria das
candidatas)[]; tarefas: number; anteriores: number; planejados: number; jaTinha: number; naoFez: number; ignoradas:
Record<string, number> }`; importar = uma transação: itens novos, `anteriores` e tarefas do ciclo aberto pela regra C8,
só acrescentando; auditoria `mentoria.cronograma_importado` com as contagens.

- [ ] **Passo 1:** testes que falham: prévia com a fixture e 3 inscrições do seed; importar liga as colunas decididas,
  cria a tarefa do mês = ciclo aberto, `PLANEJADO` para mês maior, `RECEBIDO` para menor; rodar de novo não muda
  nenhuma contagem; Acompanhamento → 404; `.xlsx` → 400 "Baixe a aba CRONOGRAMA em CSV".
- [ ] **Passo 2–4:** falha → implementar → `pnpm --filter @npac/api test` passa; commit.

### Tarefa 10: tela da importação e PR da fase 3

**Situação:** ⏳

**Arquivos:** criar `apps/web/components/acompanhamento/importar-cronograma.tsx`; modificar a aba Importação de
`configuracoes/page.tsx` (card depois do da carteira). Teste: `apps/web/e2e/acompanhamento-cronograma-importacao.spec.ts`.

- [ ] **Passo 1:** e2e que falha: Admin sobe a fixture, decide uma dúvida, importa e vê o item na aba da ficha.
- [ ] **Passo 2:** implementar como `importacao-*.png` (3 passos; passo 3 com os números e "Importar").
- [ ] **Passo 3:** capturas lado a lado com o protótipo; `CLAUDE.md` (fase 3); PR `feat(NPAC-60): importacao da
  planilha do cronograma`; ITODEV com a fixture; plano com fase 3 ✅.

## Depois das 3 fases

1. Conferir em produção que a carteira foi importada (em 22/11 havia 1 inscrição); sem ela nenhuma coluna casa.
2. Deploy em produção (regra "faz o que quiser", com o roteiro do ITODEV aprovado) e avisar o Gabriel do que foi.
3. Mensagem para a Eduarda: onde fica, o que clicar e que ela importa a planilha (Configurações → Importação). A
   planilha aposenta depois que ela conferir algumas fichas.
