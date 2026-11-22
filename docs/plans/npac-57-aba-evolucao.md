# NPAC-57: aba Evolução — plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development ou superpowers:executing-plans, uma tarefa por vez.
> Passos com `- [ ]`. Ao fechar uma tarefa, troque a linha de status dela abaixo.

**Objetivo:** aba "Evolução" na ficha do mentorado, com cartões antes → hoje, momento inicial × atual, pontos de partida,
conquistas e PDF, preenchida com os textos do sistema antigo.

**Arquitetura:** duas tabelas novas no módulo (`mentoria_evolucao`, uma por inscrição; `mentoria_conquistas`), textos
cifrados com AAD, leitura e escrita pela RLS do módulo (área nova `EVOLUCAO`). A API expõe uma leitura agregada, um PUT
com `version` (fila de salvamento do módulo) e as conquistas; fotos pelo controlador de mídia existente. A tela é uma aba
nova da ficha; o PDF é uma rota só de servidor impressa pelo navegador. Os textos antigos são copiados ao subir a API.

**Stack:** Postgres 16 + Drizzle (migration SQL manual), NestJS, Next 16 (server components), Zod no `shared`, Vitest,
Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-aba-evolucao-design.md` (aprovada pelo Gabriel em 21/11/2026).
**Protótipo:** https://claude.ai/artifact/FMGeFidYfYqefqVuV4FwfC (telas "Opção A aprovada", "Mentorado novo, tudo vazio",
"Operação, só leitura", "PDF baixado", "Vista Linha do tempo", "Celular").

## Status

| # | Tarefa | Status |
|---|---|---|
| 0 | Release v0.20 e branch | ✅ 21/11 (release aberta pelo cut-release; worktree `.claude/worktrees/npac-57-aba-evolucao`) |
| 1 | Banco: tabelas, RLS, funções | ✅ 21/11 (`216cd36`) |
| 2 | Shared: tipos, schemas, tópicos e mapeamento do legado | ✅ 21/11 (`FichaDTO.pode` foi para a Tarefa 3) |
| 3 | API: leitura, salvar, conquistas e fotos | ✅ 21/11 |
| 4 | API: cópia do legado ao subir | ✅ 21/11 |
| 5 | Web: aba Evolução | ✅ 22/11 (iPhone em `e2e/mobile-layout-evolucao.spec.ts`: o projeto `iphone` só roda `mobile-layout*`) |
| 6 | Web: PDF | ⏳ |
| 7 | Fechamento: capturas, CLAUDE.md, PR e ITODEV | ⏳ |

Sessões: uma sessão nova por fase. Fase A = tarefas 0–2; Fase B = 3–4; Fase C = 5–6; Fase D = 7.

**Ajustes da Fase A (21/11), para a Fase B saber:**
- `FichaDTO.pode.verEvolucao`/`pode.evolucao` não entraram no `shared`: o campo obrigatório quebraria o typecheck da API
  (`ficha.service.ts` monta o `pode`) e a Fase A não mexe na API. Entram na Tarefa 3, junto com o cálculo.
- `atual_atualizado_em/por` é do banco: o gatilho `mentoria_evolucao_guarda` grava quando mudam `atual_notas` ou
  `foto_atual_midia_id`, com quem está logado (o valor mandado pela API é ignorado). A API só lê.
- Conquista: texto e data não mudam, mas `midia_id` tem UPDATE (política `mentoria_conquistas_midia`, área EVOLUCAO)
  para o `apontarFoto` da Tarefa 3. `mentoria_excluir_midia` solta o apontamento das fotos e da conquista.
- `mentoria_evolucao_legado_pendentes(limite, depois uuid default null)`: página pelo id, para a Tarefa 4 pular as
  inscrições com legado ilegível (que ficam pendentes) sem ler as mesmas de novo. Conquistas do jsonb:
  `[{id, data, descricao}]` (`id` gerado na API para o AAD). Data da conquista antiga só vira data se for um dia
  inteiro (DD/MM/AAAA); "MM/AAAA" vira nula (`legadoParaEvolucao`).
- Texto antigo maior que 2.000 caracteres é copiado inteiro (o banco aceita); a tela da Tarefa 5 precisa lidar com
  isso ao editar.

## Restrições globais (valem para toda tarefa)

- Rótulos literais da spec §7; nada de rótulo novo sem perguntar ao Gabriel.
- Leitura: Admin, Acompanhamento (com recorte "só a carteira") e Operação. **Especialista e demais: nada** (404 na API,
  aba escondida). Escrita: Admin e Acompanhamento (área `EVOLUCAO`). Operação só lê.
- Todo texto da evolução e das conquistas é cifrado (`MentoriaCrypto`, AAD `aad('<tabela>', '<coluna>', <id>)`) e nunca
  vai para URL, log, CSV, histórico (só nomes de campos) ou push.
- Política de leitura no formato por consulta: `(select mentoria_ve_todas()) or inscricao_id = any ((select
  mentoria_ids_carteira())::uuid[])`. Nunca `mentoria_ids_visiveis()`.
- Limites: 2.000 caracteres por campo da evolução; 500 na descrição da conquista; mídia até 20 MB (limite atual).
- Tópicos: cada linha não vazia vira um tópico; "Rótulo: texto" põe o rótulo em negrito se o rótulo tiver de 1 a 24
  caracteres.
- Migration nova = `0076_acompanhamento_evolucao.sql` + snapshot + `_journal.json` (`idx` e `when` maiores que os da
  0075). Nunca reescrever migration aplicada.
- Bug durante o trabalho: teste que falha → correção → teste focado.
- Antes de cada commit: `pnpm lint && pnpm typecheck`. Commits sem linha de atribuição.

## Foco da revisão (o que a spec implica e nenhum teste óbvio cobre)

1. **Inscrição fora da carteira** de quem tem "só a carteira": GET dá 404, PUT dá 404, foto e conquista dão 404. Teste na
   Tarefa 3.
2. **Duas abas editando o mesmo cartão**: o segundo PUT com `version` velha recebe 409 e a fila reaplica se o campo for
   outro (`resolverConflito`). Teste na Tarefa 3 (409) e na Tarefa 5 (e2e de dois campos).
3. **Texto antigo com caracteres especiais e linhas em branco** (emoji, "\r\n", rótulo com mais de 24 caracteres):
   `topicos()` não quebra e não negrita rótulo longo. Teste na Tarefa 2.
4. **Cópia do legado rodando duas vezes ou em duas instâncias** ao mesmo tempo: nada duplica (conquistas) e nada
   sobrescreve campo já escrito. Teste na Tarefa 4.
5. **Anonimizar e excluir** com fotos e conquistas: as mídias vão para `mentoria_midia_exclusao` e os textos somem.
   Teste na Tarefa 1 (banco) e Tarefa 3 (API).

---

### Tarefa 0: Release v0.20 e branch

- [x] **Passo 1:** Perguntar ao Gabriel o sim para abrir a `release/v0.20` (não há release aberta; `v0.19` já está na
  `main`). Com o sim, rodar o `cut-release` conforme `RELEASING.md`.
- [x] **Passo 2:** `git status -sb` limpo nos arquivos do pedido; criar a worktree/branch `feat/NPAC-57-aba-evolucao` a
  partir de `origin/release/v0.20`.
- [x] **Passo 3:** Copiar para a branch e commitar a spec e este plano (`docs/pedidos/caixa.md` fica local, fora do git, como hoje).
  Commit: `docs(NPAC-57): spec e plano da aba evolucao`.

### Tarefa 1: Banco (tabelas, RLS, funções)

**Arquivos:**
- Criar: `packages/db/drizzle/0076_acompanhamento_evolucao.sql` (+ `meta/0076_snapshot.json`, `meta/_journal.json`)
- Alterar: `packages/db/src/schema/mentoria.ts` (tabelas novas; `mentoria_midia_dono` com os donos novos)
- Testes: criar `packages/db/test/mentoria-evolucao.test.ts`; alterar `packages/db/test/rls-por-consulta.test.ts`
  (se a tabela nova precisar de caso explícito na equivalência)

**Interfaces (produz):**
- Tabela `mentoria_evolucao`: `inscricao_id uuid PK → mentoria_inscricoes(id) on delete cascade`, `reserva_antes`,
  `reserva_hoje`, `renda`, `saude`, `investimentos`, `area_atuacao`, `inicial_notas`, `atual_notas` (text, cifrado,
  `cifradoCabe`), `foto_inicial_midia_id uuid`, `foto_atual_midia_id uuid`, `atual_atualizado_em timestamptz`,
  `atual_atualizado_por text → user(id)`, `legado_copiado_em timestamptz`, `version int not null default 1`, autoria
  (`...autoria` como as outras tabelas). Drizzle: `mentoriaEvolucao`.
- Tabela `mentoria_conquistas`: `id uuid PK default gen_random_uuid()`, `inscricao_id uuid not null → inscrições
  cascade`, `data date`, `descricao text` (cifrado), `midia_id uuid`, `criado_por text → user(id)` (nulo na cópia),
  `criado_em timestamptz not null default now()`; índice `(inscricao_id, data)`. Drizzle: `mentoriaConquistas`.
- `mentoria_midia.dono_tipo` aceita também `EVOLUCAO_INICIAL`, `EVOLUCAO_ATUAL` (dono = inscrição) e `CONQUISTA`
  (dono = conquista).
- `mentoria_ve_evolucao(inscricao uuid) → boolean` (SECURITY DEFINER, STABLE): `mentoria_admin() OR
  (mentoria_perfil() IN ('ACOMPANHAMENTO','OPERACAO') AND mentoria_carteira_ok(inscricao))`.
- `mentoria_edita('EVOLUCAO', inscricao)`: `EVOLUCAO` entra na lista do perfil `ACOMPANHAMENTO` (recriar a função a
  partir da versão da 0075, mudando só essa lista).
- `mentoria_midia_ve` e `mentoria_midia_edita` (recriar a partir da 0057): `EVOLUCAO_INICIAL`/`EVOLUCAO_ATUAL` →
  `mentoria_ve_evolucao(dono)` / `mentoria_edita('EVOLUCAO', dono)`; `CONQUISTA` → mesma regra pela inscrição da
  conquista.
- `mentoria_enfileirar_midia(inscricao)` (recriar a partir da 0057): zera `foto_*_midia_id` e `midia_id` e enfileira as
  mídias dos três donos novos.
- `mentoria_anonimizar_inscricao(inscricao)` (recriar a partir da 0069): zera os 8 textos de `mentoria_evolucao`
  (mantém a linha) e `descricao` das conquistas.
- `mentoria_conquista_excluir(conquista uuid) → void` (SECURITY DEFINER, VOLATILE): exige `mentoria_edita('EVOLUCAO',
  <inscrição da conquista>)` senão `P0002`; enfileira a mídia e apaga a linha.
- `mentoria_evolucao_legado_pendentes(limite int) → table(inscricao_id uuid, dados text)` e
  `mentoria_evolucao_legado_gravar(inscricao uuid, reserva_antes text, reserva_hoje text, renda text, saude text,
  investimentos text, area_atuacao text, inicial_notas text, atual_notas text, conquistas jsonb) → boolean`
  (SECURITY DEFINER, `EXECUTE` só para `npac_app`): a segunda trava a linha da inscrição, sai `false` se
  `legado_copiado_em` já existe, insere ou completa só campos nulos, insere as conquistas (`[{data, descricao}]`, já
  cifradas) e grava `legado_copiado_em = now()`.
- RLS: `ENABLE` + `FORCE` nas duas tabelas. Leitura no formato por consulta (restrições globais). Escrita:
  `mentoria_evolucao` INSERT/UPDATE `WITH CHECK mentoria_edita('EVOLUCAO', inscricao_id)`; `mentoria_conquistas`
  INSERT com `criado_por = app_user_id() AND mentoria_edita('EVOLUCAO', inscricao_id)`. Grants: `npac_app` SELECT,
  INSERT, UPDATE em `mentoria_evolucao`; SELECT, INSERT em `mentoria_conquistas` (sem DELETE). Funções com `OWNER TO
  npac_owner` e `REVOKE ALL … FROM PUBLIC` como na 0056.

- [ ] **Passo 1: Testes que falham** em `mentoria-evolucao.test.ts` (padrão de `mentoria-v2-metas.test.ts`):
  - `Admin, Acompanhamento e Operação leem a evolução; Especialista lê zero linhas`
  - `"só a carteira" lê só as inscrições em que é responsável`
  - `Operação não grava (UPDATE afeta 0 linhas / INSERT recusado pela política)`
  - `conquista_excluir enfileira a mídia e apaga; Operação recebe P0002`
  - `anonimizar zera os textos da evolução e das conquistas e enfileira as fotos`
  - `excluir inscrição apaga evolução e conquistas e enfileira as mídias`
  - `legado_gravar: segunda chamada devolve false e não duplica conquistas; não sobrescreve campo já preenchido`
- [ ] **Passo 2:** `pnpm --filter @npac/db test -- mentoria-evolucao` → falha (tabela não existe).
- [ ] **Passo 3:** Escrever a migration e o schema Drizzle.
- [ ] **Passo 4:** `pnpm --filter @npac/db build && pnpm --filter @npac/db test` → tudo passa, inclusive
  `rls-por-consulta`, `migrations` ("idx e when crescem juntos") e `areas-compat` (a política nova não lê `user.role`).
- [ ] **Passo 5:** Commit `feat(NPAC-57): tabelas e regras de acesso da evolucao`.

### Tarefa 2: Shared (tipos, schemas, tópicos e mapeamento do legado)

**Arquivos:**
- Criar: `packages/shared/src/mentoria/evolucao.ts` (exportado em `packages/shared/src/mentoria/index.ts`, sem zod)
- Alterar: `packages/shared/src/schemas/mentoria.ts` (schemas Zod), `packages/shared/src/mentoria/dto.ts` (DTOs e
  `FichaDTO.pode`)
- Teste: criar `packages/shared/test/evolucao.test.ts`

**Interfaces (produz):**
```ts
export const CAMPOS_EVOLUCAO = ['reservaAntes', 'reservaHoje', 'renda', 'saude', 'investimentos',
  'areaAtuacao', 'inicialNotas', 'atualNotas'] as const;
export type CampoEvolucao = (typeof CAMPOS_EVOLUCAO)[number];
export const LIMITE_CAMPO_EVOLUCAO = 2000;
export const LIMITE_DESCRICAO_CONQUISTA = 500;
export type Topico = { rotulo: string | null; texto: string };
export function topicos(texto: string | null | undefined): Topico[];
export type EvolucaoDoLegado = {
  campos: Partial<Record<CampoEvolucao, string>>;
  conquistas: { data: string | null; descricao: string | null }[];
};
export function legadoParaEvolucao(legado: unknown): EvolucaoDoLegado;
```
- `evolucaoPutSchema` (Zod, strict): `version` inteiro ≥ 0 + qualquer subconjunto de `CAMPOS_EVOLUCAO` com
  `string | null` (`trim`, vazio vira `null`, máx. 2.000); pelo menos um campo. Tipo `EvolucaoPut`.
- `conquistaCriarSchema`: `{ data: 'YYYY-MM-DD' | null (faixa DATA_MIN–DATA_MAX), descricao: string | null (máx. 500) }`.
  Tipo `ConquistaCriar`.
- DTOs em `dto.ts`:
```ts
export type ConquistaDTO = { id: string; data: string | null; descricao: string | null;
  midia: { id: string; tipo: 'FOTO' | 'VIDEO' } | null; criadoEm: string };
export type EvolucaoDTO = {
  inscricaoId: string; version: number; // 0 = ainda sem linha
  campos: Record<CampoEvolucao, string | null>;
  atualAtualizadoEm: string | null; atualAtualizadoPor: string | null; // nome
  fotoInicial: { id: string; em: string } | null; fotoAtual: { id: string; em: string } | null;
  daAba: { dor: string | null; sonho: string | null; meta: string | null };
  partida: { recebeCentavos: number | null; custoCentavos: number | null; dividasCentavos: number | null;
    guardadoCentavos: number | null; concluidoEm: string | null };
  pilares: { pessoaId: string; nome: string; fe: number | null; saude: number | null;
    dinheiro: number | null; relacionamentos: number | null }[];
  conquistas: ConquistaDTO[]; // por data, sem data por último
  podeEditar: boolean;
};
```
- `FichaDTO.pode` ganha `verEvolucao: boolean` (aba aparece) e `evolucao: boolean` (edita).

- [ ] **Passo 1: Testes que falham** em `evolucao.test.ts`:
  - `topicos: "Dor: texto" → { rotulo: 'Dor', texto: 'texto' }`
  - `topicos: linha em branco, "\r\n" e espaços somem`
  - `topicos: rótulo com 25+ caracteres não vira rótulo` e `"Obs:" sem texto vira { rotulo: null, texto: 'Obs:' }`
  - `topicos: emoji e acento passam inteiros`
  - `legadoParaEvolucao: antesDepois RESERVA_FINANCEIRA antes/depois → reservaAntes/reservaHoje; EVOLUCAO_RENDA,
    EVOLUCAO_SAUDE, INVESTIMENTOS_MENTORIA, AREA_ATUACAO .depois → renda, saude, investimentos, areaAtuacao`
  - `legadoParaEvolucao: notasMomentoInicial + "Fé: …", "Saúde: …", "Dinheiro: …", "Relacionamentos: …" dos pilares
    antigos (.antes) → inicialNotas, nessa ordem e separados por "\n"`
  - `legadoParaEvolucao: notasMomentoAtual → atualNotas; conquistas → [{data, descricao}]`
  - `legadoParaEvolucao: lixo (null, número, chaves faltando) → { campos: {}, conquistas: [] }`
  - `evolucaoPutSchema: recusa campo fora da lista, texto com 2.001 caracteres e corpo só com version`
- [ ] **Passo 2:** `pnpm --filter @npac/shared test -- evolucao` → falha.
- [ ] **Passo 3:** Implementar.
- [ ] **Passo 4:** `pnpm --filter @npac/shared test` → passa; `pnpm typecheck`.
- [ ] **Passo 5:** Commit `feat(NPAC-57): tipos e regras puras da evolucao`.

### Tarefa 3: API (leitura, salvar, conquistas e fotos)

**Arquivos:**
- Criar: `apps/api/src/mentoria/evolucao.service.ts`, `apps/api/src/mentoria/evolucao.controller.ts`
- Alterar: `apps/api/src/mentoria/mentoria.module.ts`, `apps/api/src/mentoria/midia.controller.ts` (donos novos),
  `apps/api/src/mentoria/historico.ts` (`AreaEdicao` + `EVOLUCAO`), `apps/api/src/mentoria/ficha.service.ts`
  (`pode.verEvolucao`, `pode.evolucao`)
- Teste: criar `apps/api/test/mentoria-v2-evolucao.e2e.test.ts` (padrão de `mentoria-v2-metas.e2e.test.ts`)

**Interfaces:**
- Consome: Tarefa 1 (tabelas e funções), Tarefa 2 (`EvolucaoDTO`, `ConquistaDTO`, `evolucaoPutSchema`,
  `conquistaCriarSchema`, `CAMPOS_EVOLUCAO`).
- Produz (rotas sob `@MentoriaController('')`):
  - `GET inscricoes/:id/evolucao` `@Perfis('ACOMPANHAMENTO','OPERACAO')` → `EvolucaoDTO` (404 se
    `mentoria_ve_evolucao` for falso ou a inscrição não existir).
  - `PUT inscricoes/:id/evolucao` `@Perfis('ACOMPANHAMENTO')` body `EvolucaoPut` → `{ version: number }`. `version: 0`
    insere (como `salvarMomento`); senão UPDATE com `version`; 409 `conflitoDeVersao()`. Mexer em `atualNotas` grava
    `atual_atualizado_em/por`. Histórico `evolucao.editada` com os nomes dos campos.
  - `POST inscricoes/:id/conquistas` `@Perfis('ACOMPANHAMENTO')` (201) body `ConquistaCriar` → `ConquistaDTO`;
    histórico `conquista.adicionada` (campos `data`, `descricao`).
  - `DELETE conquistas/:id` `@Perfis('ACOMPANHAMENTO')` (204) → chama `mentoria_conquista_excluir`; histórico
    `conquista.removida` (sem campos).
  - `MidiaController.DONOS` += `'evolucao-inicial'` (`EVOLUCAO_INICIAL`, tabela `mentoriaInscricoes`),
    `'evolucao-atual'` (`EVOLUCAO_ATUAL`, `mentoriaInscricoes`), `'conquista'` (`CONQUISTA`, `mentoriaConquistas`).
    Conquista aceita FOTO ou VÍDEO; as duas fotos só FOTO. `apontarFoto` faz upsert em `mentoria_evolucao`
    (`foto_inicial_midia_id`/`foto_atual_midia_id`, apagando a anterior por `mentoria_excluir_midia`; foto atual também
    grava `atual_atualizado_*`) ou grava `mentoria_conquistas.midia_id`. Histórico `evolucao.foto` (campo
    `fotoInicial`/`fotoAtual`).
  - `EvolucaoService`: `ler(u, id): Promise<EvolucaoDTO>`, `salvar(u, id, b: EvolucaoPut)`,
    `criarConquista(u, id, b: ConquistaCriar)`, `excluirConquista(u, conquistaId)`.

- [ ] **Passo 1: Testes que falham** (`mentoria-v2-evolucao.e2e.test.ts`):
  - `duda (Admin) e Acompanhamento: GET traz version 0 e campos nulos numa inscrição nova`
  - `PUT salva reservaAntes e atualNotas; GET devolve decifrado; atualAtualizadoPor = nome de quem salvou`
  - `PUT com version velha → 409 VERSION_CONFLICT`
  - `PUT com campo fora da lista ou 2.001 caracteres → 400 em português`
  - `operacao: GET 200 e podeEditar false; PUT 404/403 conforme o @Perfis do módulo`
  - `manu (Especialista): GET, PUT, POST conquista e foto → 404`
  - `"só a carteira": inscrição fora da carteira → 404 em GET, PUT, conquista e foto` (Foco 1)
  - `GET traz daAba (dor, sonho, meta), partida (centavos, concluidoEm) e pilares INICIAL por pessoa`
  - `conquista: POST, foto e vídeo aceitos, PDF recusado (400); DELETE 204 e a mídia entra na fila`
  - `histórico grava evolucao.editada só com nomes de campos (nenhum texto do corpo aparece em campos)`
  - `anonimizar pela API zera evolução e conquistas` (Foco 5)
  - `GET inscricoes/:id (ficha) traz pode.verEvolucao/pode.evolucao certos por perfil`
- [ ] **Passo 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-evolucao.e2e.test.ts` → falha.
- [ ] **Passo 3:** Implementar service, controller, donos de mídia e `pode`.
- [ ] **Passo 4:** Teste focado passa; depois `pnpm --filter @npac/api test` (inclui `acompanhamento-sem-comercial`, que
  varre rotas novas) passa.
- [ ] **Passo 5:** Commit `feat(NPAC-57): api da evolucao, conquistas e fotos`.

### Tarefa 4: API (cópia do legado ao subir)

**Arquivos:**
- Criar: `apps/api/src/mentoria/evolucao-legado.ts`
- Alterar: `apps/api/src/mentoria/mentoria.module.ts`
- Teste: acrescentar `describe('cópia do legado')` em `apps/api/test/mentoria-v2-evolucao.e2e.test.ts`

**Interfaces:**
- Consome: `mentoria_evolucao_legado_pendentes`, `mentoria_evolucao_legado_gravar` (Tarefa 1), `legadoParaEvolucao`
  (Tarefa 2), `MentoriaCrypto`.
- Produz: `class EvolucaoLegado implements OnApplicationBootstrap` com `copiarPendentes(): Promise<number>`. No
  bootstrap: `pg_try_advisory_lock` de uma chave fixa da evolução (sem lock, sai); lê em lotes de 50 pelo `npac_app`,
  decifra `dados` com `aad('mentoria_legado', 'dados', inscricaoId)`, mapeia, cifra cada campo com
  `aad('mentoria_evolucao', <coluna>, inscricaoId)` e cada descrição com `aad('mentoria_conquistas', 'descricao',
  <id da conquista>)` (id gerado na API e passado no jsonb), chama `_gravar`. Erro numa inscrição: loga
  `evolução: legado ilegível <inscricaoId>` e segue. No fim: `evolução: N inscrições copiadas do legado`. Não roda em
  teste se a variável de teste existente desligar tarefas de boot (seguir como o `AvisosScheduler` faz em teste).

- [ ] **Passo 1: Testes que falham:**
  - `copia reserva, renda, saúde, investimentos, área, notas e conquistas de um legado importado`
  - `segunda chamada devolve 0 e não duplica conquistas` (Foco 4)
  - `não sobrescreve campo que a equipe já escreveu antes da cópia`
  - `duas chamadas em paralelo copiam uma vez só` (Foco 4)
  - `legado com JSON ilegível: pula, conta 0, não lança`
- [ ] **Passo 2:** rodar o teste focado → falha.
- [ ] **Passo 3:** Implementar.
- [ ] **Passo 4:** teste focado e `pnpm --filter @npac/api test` passam.
- [ ] **Passo 5:** Commit `feat(NPAC-57): copia os textos antigos para a evolucao ao subir`.

### Tarefa 5: Web (aba Evolução)

**Arquivos:**
- Alterar: `apps/web/components/acompanhamento/ui.tsx` (`Aba` + `'evolucao'`, entre `momento` e `historico`),
  `apps/web/components/acompanhamento/ficha.tsx` (aba e rolagem da fileira até a aba aberta no celular),
  `apps/web/lib/acompanhamento-saver.ts` (chave `evolucao:<inscricaoId>` → `PUT /inscricoes/:id/evolucao`),
  `apps/web/lib/acompanhamento-prefs.ts` (`FICHA_REGRAS` + `vista`: `lado` | `linha`), `apps/web/app/(app)/acompanhamento/modulo.css`,
  `apps/web/components/acompanhamento/historico-lista.tsx` (textos `evolucao.editada`, `evolucao.foto`,
  `conquista.adicionada`, `conquista.removida`)
- Criar: `apps/web/components/acompanhamento/evolucao.tsx` (aba: busca `GET …/evolucao`, cabeçalho, vista),
  `evolucao-cartoes.tsx`, `evolucao-momentos.tsx`, `evolucao-partida.tsx`, `evolucao-conquistas.tsx`,
  `evolucao-topicos.tsx` (lista a partir de `topicos()`)
- Teste: criar `apps/web/e2e/acompanhamento-evolucao.spec.ts`

**Interfaces:**
- Consome: `EvolucaoDTO`, `ConquistaDTO`, `topicos`, `CAMPOS_EVOLUCAO`, `LIMITE_*` (Tarefa 2); rotas da Tarefa 3;
  `useFieldSaver`/`salvarCampo` (fila existente); `MidiaUpload` de `midia.tsx` (`dono` novo); `showToast()`.
- Regras da tela (spec §5): aba só com `ficha.pode.verEvolucao` (senão some, e `?aba=evolucao` cai na padrão); edição só
  com `pode.evolucao`; cartão inteiro é `<button>` com `aria-label="Editar <rótulo em minúsculas>"` que abre o campo
  (salva ao sair); cartão vazio some para quem só lê; Momento inicial em dois blocos ("Da aba Momento inicial" com "Ver a
  aba" → `?aba=momento`; "Outras anotações" editável); "Editar"/"Pronto" no mesmo lugar nos dois momentos; Pontos de
  partida somem sem dado; conquistas com janelinha `dlg` (mídia obrigatória, data com hoje sugerido, descrição) e
  `confirm('Remover essa conquista?')`; clicar na foto (momento ou conquista) abre o arquivo em tamanho maior; seletor "Lado a lado | Linha do tempo" lembrado e escondido abaixo de 768 px;
  "Baixar PDF" abre `/acompanhamento/ficha/<id>/evolucao/pdf` em aba nova. Cores: spec §8.

- [ ] **Passo 1: Testes que falham** (`acompanhamento-evolucao.spec.ts`, logins `duda`, `operacao`, `manu`):
  - `duda abre a ficha, aba Evolução, edita "Evolução de renda" pelo teclado (Tab + Enter), sai do campo e vê "Salvo";
    recarrega e o texto continua`
  - `duda escreve o momento atual com "Rótulo: texto" e vê o rótulo em negrito; rodapé "Atualizado em … por Duda"`
  - `duda adiciona uma conquista com foto e remove com a confirmação`
  - `troca para "Linha do tempo", recarrega e a vista continua`
  - `operacao vê a aba sem botões de editar, sem "Adicionar conquista" e sem o cartão vazio`
  - `manu (Especialista) não vê a aba; /acompanhamento/ficha/<id>?aba=evolucao abre a Jornada`
  - `duas abas: editar campos diferentes do mesmo mentorado não perde nenhum` (Foco 2)
  - `iPhone 375: nada sai da tela (rolagem lateral 0), toques ≥ 44 px, campos 16 px, a aba aberta aparece na fileira`
- [ ] **Passo 2:** `preview_stop`; liberar 3000/4000; `pnpm --filter @npac/web e2e e2e/acompanhamento-evolucao.spec.ts` →
  falha.
- [ ] **Passo 3:** Implementar. Componentes de servidor onde der; nada novo no JS de `/leads` (o teste de 150 KB passa).
- [ ] **Passo 4:** e2e focado passa; `pnpm --filter @npac/web e2e e2e/acompanhamento-v2-base.spec.ts
  e2e/acompanhamento-v2-preferencias.spec.ts` (ficha e abas lembradas) passam.
- [ ] **Passo 5:** Commit `feat(NPAC-57): aba evolucao na ficha do mentorado`.

### Tarefa 6: Web (PDF)

**Arquivos:**
- Criar: `apps/web/app/(app)/acompanhamento/ficha/[id]/evolucao/pdf/page.tsx` (servidor; folha A4 do protótipo),
  `apps/web/components/acompanhamento/evolucao-pdf.tsx`, `apps/web/components/acompanhamento/imprimir-ao-abrir.tsx`
  (cliente mínimo: `window.print()` depois do carregamento das imagens)
- Alterar: `apps/web/app/(app)/acompanhamento/modulo.css` (bloco `@media print` e `@page`) ou CSS próprio da rota
- Teste: acrescentar ao `apps/web/e2e/acompanhamento-evolucao.spec.ts`

**Interfaces:**
- Consome: `GET …/evolucao` e `GET …/inscricoes/:id` (nome, mentoria, mês, início); `topicos`.
- Regras (spec §5.7): título do documento `Evolução - <nome>`; `@page { size: A4; margin: 0 }` e respiro interno de
  ~12 mm; texto ~10 pt, rótulos ≥ 8 pt; sem foto, sem círculo; sem cartão vazio; sem botões nem casca do app; folha 2
  com cabeçalho curto quando houver conquistas; rodapé "Gerado pelo CRM NPAC em DD/MM/AAAA"; 404 para quem não vê;
  `break-inside: avoid` nos cartões.

- [ ] **Passo 1: Testes que falham:**
  - `duda abre a rota do PDF (com print() trocado por um espião): título "Evolução - <nome>", sem sidebar e sem botões`
  - `com a mídia de emulação "print": nenhum elemento sai da largura A4 e nenhum .ec é cortado entre folhas`
    (`page.emulateMedia({ media: 'print' })` + `page.pdf()` gera o arquivo sem erro)
  - `sem foto no momento inicial, não há círculo de foto no PDF`
  - `manu recebe 404 na rota do PDF`
- [ ] **Passo 2:** rodar o e2e focado → falha.
- [ ] **Passo 3:** Implementar.
- [ ] **Passo 4:** e2e focado passa.
- [ ] **Passo 5:** Commit `feat(NPAC-57): pdf da evolucao`.

### Tarefa 7: Fechamento

- [ ] **Passo 1:** Capturas da aba em 375/768/1024/1440, claro e escuro, e do PDF; comparar lado a lado com o protótipo
  (mesma largura) e listar diferenças; corrigir.
- [ ] **Passo 2:** `VARREDURA_URL=… node apps/web/scripts/varredura-celular.mjs duda operacao` sem achados novos.
- [ ] **Passo 3:** Atualizar `CLAUDE.md` (mapa do Acompanhamento: arquivos da evolução; regras de acesso; cópia do
  legado ao subir; donos de mídia novos; PDF pela impressão).
- [ ] **Passo 4:** `pnpm lint && pnpm typecheck`, `pnpm --filter @npac/shared test`, `pnpm --filter @npac/db test`,
  `pnpm --filter @npac/api test`, `pnpm --filter @npac/web e2e` → tudo verde (saídas em arquivo; mostrar só falhas).
- [ ] **Passo 5:** PR `feat(NPAC-57): aba evolucao na ficha do mentorado` para `release/v0.20`, Auto-fix ligado, merge
  squash só com o CI completo verde (não ligar auto-merge do GitHub).
- [ ] **Passo 6:** Deploy no ITODEV; conferir no log "evolução: N inscrições copiadas do legado"; roteiro com `duda`
  (Admin), um Acompanhamento, `operacao` e `manu`; mandar ao Gabriel o link, os logins por cargo e o que clicar.
- [ ] **Passo 7:** Atualizar `docs/pedidos/caixa.md` (NPAC-57 🚧 → pronto no ITODEV) e o status deste plano. Produção
  só com o sim do Gabriel.
