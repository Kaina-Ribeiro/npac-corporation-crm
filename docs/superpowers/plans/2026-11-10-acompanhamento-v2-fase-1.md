# Acompanhamento v2, Fase 1 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o módulo Acompanhamento atual pelo sistema de gestão dos mentorados da Eduarda (inscrições, ficha, onboarding, plano por mentoria, reuniões, Fila do dia, importação da carteira), sem alterar o CRM.

**Architecture:** Mesmo app (Nest + Next + Postgres). Tabelas novas `mentoria_*` com RLS por perfil do módulo; regras de calendário em SQL; Fila calculada na leitura; push com um único timer. Código útil do módulo antigo é reaproveitado.

**Tech Stack:** NestJS/Fastify, Next 16, Drizzle + SQL manual, Postgres 16, Zod, Vitest, Playwright. Dependência nova: `exceljs` (só em `apps/api`).

**Spec:** `docs/superpowers/plans/2026-11-10-acompanhamento-v2-design.md` (ler inteiro antes de cada parte; PDF em `docs/acompanhamento/especificacao-eduarda-2026-11-07.txt`).

## Como executar

- **Uma sessão nova por parte** (são 5). A sessão lê este plano, o SPEC e `CLAUDE.md`, e atualiza a linha `Status` de cada tarefa ao terminar.
- **Branch por parte:** `feat/NPAC-43-parte-N-nome`, a partir da `release/vX.Y` aberta (hoje `origin/release/v0.11`), depois que a parte anterior entrou nela. Sem branches empilhadas. PR `feat(NPAC-43): resumo`, squash.
- **Sem push, PR ou deploy sem o OK do Gabriel.**
- A pasta principal do repositório pode estar em uso por outra sessão: trabalhar em worktree.

| Parte | Entrega | Status |
|---|---|---|
| 1 | Base: protótipo, limpeza, perfis, inscrição, ficha, Mentorados | ✅ |
| 2 | Onboarding + importação | ✅ |
| 3 | Plano por mentoria + pausa | ⏳ |
| 4 | Reuniões + IDR inicia a jornada | ⏳ |
| 5 | Fila do dia, avisos, WhatsApp, exportação, fechamento | ⏳ |

## Global Constraints

- CRM intocado. Únicas exceções: itens do módulo em `web/components/shell/nav-menu.tsx`, e-2-e que citam esses itens, e o push (D12, Tarefa 5.3).
- Runtime `npac_app`; toda consulta em `withUser(db, u.id, tx => …)`; autorização de linha é RLS, nunca filtro em JS.
- Invisível = inexistente = **404**, nunca 403.
- `npac_app` sem DELETE nas tabelas do módulo; exclusão só por função `SECURITY DEFINER`.
- Migration nova: número e `when` depois da última **no momento da execução** (hoje a última é `0041`; a NPAC-42 pode ter somado outra). Nunca reescrever migration aplicada.
- Fuso `America/Sao_Paulo` em toda data de calendário; em `sql` cru, datas como ISO string.
- Mês da jornada e datas previstas: **uma** implementação, em SQL.
- Dinheiro em centavos (`sh/money.ts`). PATCH exige `version` (409 `VERSION_CONFLICT`).
- Texto sensível via `MentoriaCrypto` com AAD `aad(tabela, coluna, id)`.
- Contato, termo de busca e conteúdo pessoal nunca em URL, log ou push. Busca por POST.
- `historico` guarda nomes de campos, nunca valores; mudança + histórico na mesma transação.
- Dados reais nunca em teste, seed, log ou ferramenta; fixtures sintéticas ("Mentorado Fictício NN").
- Lógica pura em `sh/mentoria/*` sem zod. Erros da API em português.
- Controllers do módulo sempre com `MentoriaController(...)`. Rota de importação no formato `mentoria/<recurso>/importar(/previa)`.
- Manter nomes: export `seedMentoria(db)` em `seed-mentoria.ts`, classe `MentoriaModule`, caminho `mentoria/mentoria.module.ts`.
- UI: tokens de `globals.css`, padrão premium; capturas em 375, 768, 1024 e 1440 px; testar pelo fluxo real (login + menu, por perfil).

## Review Focus

1. **Duas pessoas editam campos diferentes da mesma ficha ao mesmo tempo:** nada se perde, ninguém vê erro falso. → Tarefa 1.5.
2. **Importação repetida ou parcial** (só a planilha, sem `.json`, ou o mesmo arquivo duas vezes): não duplica nem apaga o que a equipe já editou. → Tarefa 2.4.
3. **Pausar e retomar no mesmo dia** (0 dias) e pausar no dia exato de uma ação: datas não andam à toa, e a ação do dia é adiada. → Tarefa 3.2.
4. **Casal em que uma pessoa não tem WhatsApp, e inscrição sem link do grupo:** o botão correspondente some, sem quebrar nem abrir link vazio. → Tarefa 5.2.
5. **Responsável desativado no CRM e Diretoria sem perfil:** o item cai na Fila do perfil, e a Diretoria vê tudo sem repetir item. → Tarefa 5.1.

---

## Parte 1 — Base

### Tarefa 1.1: Protótipo das telas principais
Status: ✅

**Files:** Create: `docs/acompanhamento/prototipo/canvas/` (cópia do canvas aprovado: telas `.dc.html` e `prototipo.css`, dados inventados, tokens copiados de `globals.css`).

- [ ] **Step 1:** Montar Fila do dia, Mentorados e Ficha (individual e casal), em 375 e 1440 px, com os campos das §4 e §6 do SPEC.
- [ ] **Step 2:** Mostrar ao Gabriel (screenshots). **Parar até o OK.** Nenhuma tela é codada antes disso.
- [ ] **Step 3:** Commit `docs(NPAC-43): protótipo do acompanhamento v2`.

### Tarefa 1.2: Apagar o módulo antigo
Status: ✅

**Files:**
- Delete: `api/mentoria/{mentoria.service,fichas.service,fichas.controller,rdv.service,rdv.controller,escrita.service,import.service,import.controller,backup.controller,mentorados.controller,registros.controller}.ts`; `web/app/(app)/acompanhamento/{dashboard,linha-do-tempo,rdv,backup}`; `web/components/acompanhamento/*` exceto `abas-mobile.tsx`, `cabecalho-modulo.tsx`, `indicador-salvo.tsx`, `midia.tsx`, `remover-confirma.tsx`; `sh/mentoria/{planilha,eventos-colados,topicos,diagnostico}.ts`; `sh/schemas/mentoria.ts`; testes `apps/api/test/mentoria{,-backup,-escrita,-fichas,-importacao,-importacao-legado,-lgpd,-midia,-papel,-rdv,-rdv-eventos}.e2e.test.ts`, `packages/db/test/{mentoria-funcoes,mentoria-lgpd,mentoria-modelo,mentoria-rls,seed-mentoria}.test.ts`, `packages/shared/test/mentoria-{diagnostico,planilha,topicos}.test.ts`, `web/e2e/acompanhamento-{backup,dashboard,importacao,impressao,linha,mobile,rdv,rdv-eventos}.spec.ts`.
- Keep: `mentoria-crypto.ts`, `media-store.ts`, `media-sniff.ts`, `media-worker.ts`, `mentoria.guard.ts`, `cursor.ts`, `erros.ts`, `midia.controller.ts`; `sh/mentoria/{normalizar,datas,links,dedupe,field-queue,legado,json-backup,campos}.ts`.
- Create: `packages/db/drizzle/00NN_acompanhamento_v2_limpeza.sql`.
- Modify: `db/src/schema/mentoria.ts` (fica só `mentoriaMidia`, `mentoriaMidiaExclusao`), `db/src/seed-mentoria.ts` (corpo vazio por enquanto), `apps/api/test/helpers.ts` (truncate), `api/mentoria/mentoria.module.ts`, `sh/index.ts`, `sh/mentoria/index.ts`.

- [ ] **Step 1: Teste que falha** em `packages/db/test/migrations.test.ts`:

```ts
it('limpeza remove o modelo antigo e enfileira a mídia antiga', async () => {
  // antes da 00NN: insere em mentoria_midia uma linha com chave_objeto 'antiga/1.jpg'
  // depois: to_regclass('mentoria_mentorados') é null; mentoria_midia vazia;
  // mentoria_midia_exclusao contém 'antiga/1.jpg' com removido_em null
});
```

- [ ] **Step 2:** `pnpm --filter @npac/db test -- migrations` → FAIL.
- [ ] **Step 3:** SQL da limpeza, nesta ordem: enfileira `chave_objeto` não nula de `mentoria_midia` em `mentoria_midia_exclusao`; `DELETE FROM mentoria_midia`; `DROP` de `mentoria_rdv_*`, `mentoria_conquistas`, `mentoria_ficha_campos`, `mentoria_fichas`, `mentoria_mentorados` e das funções de 0030–0034, **exceto** `mentoria_pode`, `mentoria_exigir_acesso`, `mentoria_enfileirar_midia`, `mentoria_excluir_midia`, `mentoria_midia_fila_pendente`, `mentoria_midia_marcar_removida`. Apagar os arquivos e ajustar o que sobrar.
- [ ] **Step 4:** `pnpm lint && pnpm typecheck && pnpm --filter @npac/db test && pnpm --filter @npac/api test` → verde (inclui as suítes do CRM e `acompanhamento-sem-comercial`).
- [ ] **Step 5:** Commit `feat(NPAC-43): remove o módulo antigo do acompanhamento`.

### Tarefa 1.3: Banco base e perfis
Status: ✅

**Files:** Create: `packages/db/drizzle/00NN_acompanhamento_v2_base.sql` (+ snapshot, journal), `sh/mentoria/enums.ts` (reescrito). Modify: `db/src/schema/mentoria.ts`. Test: `packages/db/test/mentoria-v2-rls.test.ts`.

**Interfaces — Produces:**
- Tabelas: `mentoria_perfis`, `mentoria_inscricoes`, `mentoria_pessoas`, `mentoria_enderecos`, `mentoria_momento_inicial`, `mentoria_avaliacoes`, `mentoria_anotacoes`, `mentoria_historico`, `mentoria_legado` (colunas da §4 do SPEC).
- SQL: `mentoria_perfil() → text`, `mentoria_admin() → boolean`, `mentoria_ve(inscricao uuid) → boolean`, `mentoria_edita(area text, inscricao uuid) → boolean`, `mentoria_destravar_momento(inscricao uuid)`.
- `mentoria_edita` áreas: `INSCRICAO`, `MOMENTO`, `ONBOARDING`, `PLANO`, `REUNIAO`, `CONTATO`, `ANOTACAO`, pela matriz da §3. Parte 4 acrescenta a regra do Especialista em `REUNIAO` e `PLANO`.
- TS: `MENTORIAS = ['RDV','2M','6M']`, `PERFIS = ['ACOMPANHAMENTO','OPERACAO','ESPECIALISTA','MENTOR']`, `INSCRICAO_STATUS`, `TIPOS_INSCRICAO`, `OCUPACOES`, `ORIGENS`, `STATUS_FINANCEIRO`.

- [ ] **Step 1: Testes que falham** (`mentoria-v2-rls.test.ts`):

```ts
it('Diretoria é admin sem linha em perfis')           // mentoria_admin() true, mentoria_perfil() null
it('Acompanhamento com admin=true é admin e mantém o perfil')
it('cargo Acompanhamento sem perfil não vê nada')     // select em inscricoes → 0 linhas
it('Mentor não vê nenhuma inscrição')                 // D14: mentoria_ve false
it('Operação escreve endereço, mas não momento inicial') // insert momento → erro 42501
it('npac_app não tem DELETE em inscricoes')
it('momento inicial travado recusa UPDATE até destravar')
it('avaliação INICIAL trava junto com o momento inicial')
it('SDR com linha em perfis não ganha acesso')        // exige cargo cru ACOMPANHAMENTO
```

- [ ] **Step 2:** `pnpm --filter @npac/db test -- mentoria-v2-rls` → FAIL.
- [ ] **Step 3:** Escrever schema e SQL. `mentoria_perfil`, `mentoria_admin`, `mentoria_ve`, `mentoria_edita` são `SECURITY DEFINER`, dono `npac_owner`, `SET search_path = public, pg_temp`. Remover `mentoria_pode`, redefinir `mentoria_exigir_acesso` e as policies de `mentoria_midia` com `mentoria_admin() or mentoria_perfil() is not null`, e trocar o CHECK `mentoria_midia_dono` para `('PESSOA_FOTO', 'FOTO_FAMILIA', 'ACAO_EVIDENCIA')`.
- [ ] **Step 4:** Mesmo comando → PASS; `pnpm --filter @npac/db test` → verde.
- [ ] **Step 5:** Commit `feat(NPAC-43): banco base e perfis do módulo`.

### Tarefa 1.4: API de perfis, inscrição, ficha, histórico e busca
Status: ✅

**Files:** Create em `api/mentoria/`: `perfil.guard.ts`, `perfis.controller.ts`, `perfis.service.ts`, `inscricoes.controller.ts`, `inscricoes.service.ts`, `ficha.service.ts`, `historico.ts`; `sh/mentoria/dto.ts` (reescrito), `sh/schemas/mentoria.ts` (novo). Modify: `mentoria-crypto.ts`, `midia.controller.ts` (donos novos), `mentoria.module.ts`. Test: `apps/api/test/mentoria-v2-base.e2e.test.ts`.

**Interfaces — Produces:**
- `@Perfis(...p: Perfil[])`, `@SoAdmin()`, `@SemPerfil()`; `PerfilGuard` (404 se a pessoa não tem perfil nem é admin).
- `MentoriaCrypto.indiceCego(valorNormalizado: string): string` (HMAC-SHA256 com chave `hkdfSync('sha256', key, '', 'mentoria-indice-v1', 32)`).
- `registrarHistorico(tx: Tx, inscricaoId: string, tipo: string, campos: string[]): Promise<void>`.
- Rotas: `GET mentoria/eu` → `{ perfil, admin }`; `GET|PUT mentoria/perfis`; `GET mentoria/condutores` → `{ id, nome }[]` de usuários ativos; `POST mentoria/inscricoes`; `POST mentoria/inscricoes/lista`; `POST mentoria/busca`; `GET mentoria/inscricoes/:id`; `PATCH mentoria/inscricoes/:id`; `PATCH mentoria/pessoas/:id`; `POST|DELETE mentoria/inscricoes/:id/pessoa-2`; `PUT mentoria/inscricoes/:id/endereco`; `PUT mentoria/inscricoes/:id/momento`; `POST mentoria/inscricoes/:id/momento/concluir`; `POST mentoria/inscricoes/:id/momento/destravar`; `PUT mentoria/pessoas/:id/avaliacoes`; `POST mentoria/inscricoes/:id/anotacoes`; `GET mentoria/inscricoes/:id/historico`.

- [ ] **Step 1: Testes que falham**, com seed `carla` como ACOMPANHAMENTO e linhas em `mentoria_perfis` por fixture:

```ts
it('GET eu devolve perfil e admin')
it('cargo sem perfil recebe 404 em tudo menos eu')
it('Leo (MENTOR) recebe 404 em inscrições')
it('cria casal com 2 pessoas e individual com 1')
it('individual recusa pessoa 2; casal → individual remove a pessoa 2 e registra histórico')
it('busca acha por nome, telefone completo e e-mail em maiúsculas')
it('busca por telefone parcial não acha')
it('WhatsApp e e-mail não aparecem em claro no banco')
it('PATCH sem version → 400; version velha → 409 VERSION_CONFLICT')
it('status PAUSADO não entra por PATCH')              // 400 "Use a ação de pausar"
it('histórico grava nomes de campos, nunca valores')
it('momento concluído recusa PUT; admin destrava')
it('avaliação é por pessoa no casal')
it('foto da pessoa e foto da família sobem e ficam fora do registro')
it('Operação recebe 404 ao editar momento inicial')
```

- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-base.e2e.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. `termino_previsto` padrão = `inicio_jornada` + 12 meses, em SQL. Nome da pessoa em claro (busca por `nome_norm`).
- [ ] **Step 4:** Mesmo comando → PASS; `pnpm --filter @npac/api test` → verde.
- [ ] **Step 5:** Commit `feat(NPAC-43): api de perfis, inscrições e ficha`.

### Tarefa 1.5: Telas de Mentorados, Ficha e Perfis
Status: ✅

**Files:** Create: `web/app/(app)/acompanhamento/{mentorados,mentorados/[id],configuracoes,em-breve/[aba]}/page.tsx`, `web/components/acompanhamento/{mentorados-lista,busca-modulo,ficha,ficha-pessoas,ficha-momento,historico-lista,perfis-admin,em-breve}.tsx`. Modify: `web/app/(app)/acompanhamento/page.tsx` (redirect `/acompanhamento/mentorados`; Parte 5 muda para `fila`), `web/components/shell/nav-menu.tsx`, `web/app/(app)/acompanhamento/layout.tsx` (busca em todas as abas), `web/components/acompanhamento/abas-mobile.tsx`, `web/lib/acompanhamento-saver.ts`, `sh/mentoria/field-queue.ts`, `web/e2e/{sidebar,interacao,acompanhamento-acesso}.spec.ts`, `db/src/seed-mentoria.ts`. Test: `web/e2e/acompanhamento-v2-base.spec.ts`, `packages/shared/test/mentoria-field-queue.test.ts`.

**Interfaces — Produces:** `seedMentoria(db)` cria `duda` (ACOMPANHAMENTO + admin), `operacao`, `manu` (ESPECIALISTA), `leo` (MENTOR), todos com cargo `ACOMPANHAMENTO`, **copiando o hash da senha de `carla`** (assinatura não muda; só roda fora de produção), e inscrições fictícias individual, casal e importada. `resolverConflito(valorVisto: unknown, valorServidor: unknown): 'REAPLICAR' | 'AVISAR'` em `field-queue.ts`.

- [ ] **Step 1: Testes que falham:**

```ts
// field-queue
it('409 em campo que o outro não mudou: recarrega version e reaplica')
it('409 em campo que o outro mudou: avisa e não sobrescreve')
// e2e
test('Duda: menu → Mentorados → cria casal → edita → salvo')
test('duas abas editam campos diferentes da mesma pessoa e os dois ficam salvos') // Review Focus 1
test('Leo vê "Seu painel chega em breve" e nenhum mentorado')
test('cargo sem perfil vê "Peça ao Admin"')
test('Manu não abre ficha de quem não é dela (404)')
test('as 5 abas futuras mostram "em breve"')
test('busca no topo acha por nome e o termo não aparece na URL')
```

- [ ] **Step 2:** `pnpm --filter @npac/shared test` e `pnpm --filter @npac/web e2e e2e/acompanhamento-v2-base.spec.ts` → FAIL (antes do e2e, seguir a nota de portas do `CLAUDE.md`).
- [ ] **Step 3:** Implementar conforme o protótipo aprovado. Menu com as 11 abas + Configurações (só admin); filtros por mês, status e responsável na lista.
- [ ] **Step 4:** Mesmos comandos → PASS. Capturas em 375/768/1024/1440, comparar com o protótipo e listar diferenças.
- [ ] **Step 5:** Commit `feat(NPAC-43): telas de mentorados, ficha e perfis`.

---

## Parte 2 — Onboarding e importação

### Tarefa 2.1: Onboarding e Caixa na API
Status: ✅

**Files:** Create: migration `00NN_acompanhamento_v2_onboarding.sql`, `api/mentoria/onboarding.controller.ts`, `onboarding.service.ts`, `sh/mentoria/onboarding.ts`. Test: `apps/api/test/mentoria-v2-onboarding.e2e.test.ts`, `packages/shared/test/mentoria-onboarding.test.ts`.

**Interfaces — Produces:**
- Tabelas `mentoria_onboarding_etapas`, `mentoria_envios_fisicos`.
- `sh`: `ETAPAS` (ordem do SPEC), `PASSOS_MENSAGEM = ['BOAS_VINDAS','GRUPOS','AQUECIMENTO','PME_AQUECIMENTO']`, `PRAZOS = { PASSO_CURTO_DIAS: 3, CAIXA_SEM_ENVIO_DIAS: 3, CAIXA_TRANSITO_DIAS: 20 }`, `podeEnviar(etapa, etapas): boolean`.
- SQL: `mentoria_onboarding_base(etapa_id uuid) → timestamptz` (mais recente entre `enviada_em` e a última retomada; Parte 3 completa a retomada).
- Rotas: `PATCH mentoria/onboarding/:etapaId` (`status`, campos da etapa, `version`); `POST mentoria/onboarding/:etapaId/dispensar`; `PUT mentoria/inscricoes/:id/caixa`; `POST mentoria/onboarding/painel` → funil, dias parado, caixas em trânsito, IDRs a agendar.

- [ ] **Step 1: Testes que falham:**

```ts
it('cadastro cria as 6 etapas PENDENTE, em qualquer mentoria')
it('passo 2 recusa ENVIADA com o passo 1 aberto')       // 400
it('Caixa pode ser enviada com o formulário preenchido, com o PME de aquecimento aberto')
it('Caixa recusa envio sem formulário preenchido')
it('etapa CAIXA segue o envio: ENVIADO → ENVIADA, ENTREGUE → CONCLUIDA')
it('PATCH direto em CAIXA e IDR é recusado, exceto dispensar')
it('RDV recusa dispensar')                              // 400
it('2M: dispensada libera a próxima')
it('2M: todas CONCLUIDA ou DISPENSADA vira ATIVO, com inicio_jornada = hoje')
it('Manu recebe 404; Operação edita')
```

- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-onboarding.e2e.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Geração de ações no fechamento do onboarding fica para a Tarefa 3.1.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-43): onboarding e caixa`.

### Tarefa 2.2: Aba Onboarding
Status: ✅

**Files:** Create: `web/app/(app)/acompanhamento/onboarding/page.tsx`, `web/components/acompanhamento/{onboarding-funil,etapa-card,caixa-form}.tsx`. Modify: `ficha.tsx` (seção Jornada). Test: `web/e2e/acompanhamento-v2-onboarding.spec.ts`.

- [ ] **Step 1: Testes que falham:** `test('Operação conduz da boas-vindas até a Caixa pelo funil')`, `test('dias parado aparecem por pessoa')`, `test('botão Dispensar só existe em 2M e 6M')`.
- [ ] **Step 2:** `pnpm --filter @npac/web e2e e2e/acompanhamento-v2-onboarding.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar. **Step 4:** Mesmo comando → PASS + capturas nos 4 tamanhos.
- [ ] **Step 5:** Commit `feat(NPAC-43): aba onboarding`.

### Tarefa 2.3: Leitura das duas fontes (lógica pura)
Status: ✅

**Files:** Create: `sh/mentoria/importacao.ts`, `api/mentoria/importacao/ler-planilha.ts` (`exceljs`). Modify: `sh/mentoria/legado.ts`, `apps/api/package.json`. Test: `packages/shared/test/mentoria-importacao-v2.test.ts`, `apps/api/test/mentoria-ler-planilha.test.ts`.

**Interfaces — Produces:**
- `valorEmCentavos(texto: string): number | null`.
- `separarCasal(nome: string): { pessoa1: string; pessoa2: string | null }`.
- `mentoriaDoRotulo(rotulo: string): { mentoria: Mentoria | null; variante: string | null; casal: boolean }`.
- `montarCarteira(fontes: FontesImportacao): CarteiraPrevia` (`FontesImportacao` e `InscricaoImportada` no mesmo arquivo, com os campos das tabelas da §7), com `CarteiraPrevia = { novos: InscricaoImportada[]; naoCasados: string[]; parecidos: [string, string][]; rotulosSemMentoria: { rotulo: string; total: number }[] }`.
- `lerPlanilha(arquivo: Buffer): Promise<PlanilhaLida>`: só `RESPOSTASFORMS`, `PROCESSOS 2M6M`, `CANCELAMENTOS`; localiza colunas pelo **título**, nunca pela posição; recusa acima de 5.000 linhas.

- [ ] **Step 1: Testes que falham** (planilha sintética criada no próprio teste):

```ts
expect(valorEmCentavos('R$ 8 mil')).toBe(800000);
expect(valorEmCentavos('R$ 1.500,50')).toBe(150050);
expect(valorEmCentavos('uns 8 ou 10')).toBeNull();
expect(separarCasal('João Carlos (Gegê) e Hellen')).toEqual({ pessoa1: 'João Carlos (Gegê)', pessoa2: 'Hellen' });
expect(mentoriaDoRotulo('6M CASAL')).toEqual({ mentoria: '6M', variante: null, casal: true });
expect(mentoriaDoRotulo('2M / 2 ENCONTROS')).toEqual({ mentoria: '2M', variante: '2 encontros', casal: false });
expect(mentoriaDoRotulo('MENTORIA RDV + 1 BOTÃO')).toEqual({ mentoria: 'RDV', variante: '+1 botão', casal: false });
expect(mentoriaDoRotulo('NOVO FORMATO/ PASSO FUNDO').mentoria).toBeNull();
it('CPF nunca aparece em PlanilhaLida')
it('colunas fora de ordem são lidas pelo título')
it('duas respostas da mesma pessoa: vale a mais recente')
it('respostas do casal são pareadas pelo nome do cônjuge')
it('quem está em CANCELAMENTOS sai com status CANCELADO')
it('planilha acima de 5.000 linhas é recusada')
```

- [ ] **Step 2:** `pnpm --filter @npac/shared test` e `pnpm --filter @npac/api exec vitest run test/mentoria-ler-planilha.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. **Step 4:** Mesmos comandos → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-43): leitura do gerenciador e da planilha`.

### Tarefa 2.4: Importação na API e na tela
Status: ✅

**Files:** Create: `api/mentoria/importacao/importacao.controller.ts`, `importacao.service.ts`, `web/components/acompanhamento/importar-carteira.tsx`. Modify: `configuracoes/page.tsx`. Test: `apps/api/test/mentoria-v2-importacao.e2e.test.ts`, `web/e2e/acompanhamento-v2-importacao.spec.ts`.

**Interfaces — Produces:** `POST mentoria/carteira/importar/previa` e `POST mentoria/carteira/importar`, corpo `{ gerenciador?: { dashboard?, linhaDoTempo?, rdv? }, planilhaBase64?: string, decisoes?: { rotulos: Record<string, Mentoria>, casais: Record<string, { pessoa1: string; pessoa2: string | null }>, parecidos: Record<string, 'JUNTAR' | 'SEPARAR'>, status: Record<string, 'ATIVO' | 'CANCELADO' | 'CONCLUIDO'> } }`; resposta da prévia = `CarteiraPrevia` com totais.

- [ ] **Step 1: Testes que falham:**

```ts
it('só admin importa; demais 404')
it('corpo acima de 1 MB passa')                         // T1
it('etapas nascem ANTERIOR_AO_SISTEMA e a Fila não ganha item de boas-vindas')
it('status ATIVO, exceto cancelados')
it('valor ambíguo fica nulo, vai para legado e marca "completar"')
it('momento inicial com campo faltando nasce destravado')
it('importar o mesmo arquivo duas vezes não duplica nem altera o que foi editado') // Review Focus 2
it('só a planilha, sem .json, importa')
it('só o .json, sem planilha, importa')
it('rótulo sem mentoria exige decisão na confirmação')  // 400
```

- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-importacao.e2e.test.ts` → FAIL.
- [ ] **Step 3:** Implementar, em uma transação. Lista "completar a ficha" = RDV sem `data_idr` ou com campo marcado. Ações de 2M/6M importados: a Tarefa 3.1 liga.
- [ ] **Step 4:** Mesmo comando → PASS; e2e com fixture sintética → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-43): importação da carteira`.

---

## Parte 3 — Plano por mentoria e pausa

### Tarefa 3.1: Plano-modelo e geração de ações
Status: ⏳

**Files:** Create: migration `00NN_acompanhamento_v2_plano.sql`, `api/mentoria/plano.controller.ts`, `plano.service.ts`. Modify: `onboarding.service.ts`, `importacao.service.ts`, `inscricoes.service.ts`. Test: `packages/db/test/mentoria-v2-plano.test.ts`, `apps/api/test/mentoria-v2-plano.e2e.test.ts`.

**Interfaces — Produces:**
- Tabelas `mentoria_plano_modelo`, `mentoria_acoes` (único em `inscricao_id, plano_modelo_id`).
- Seed na migration: RDV = 12 linhas do PDF (mês 7 = `FLEXIVEL`, `reuniao_tipo = CARTOES_MILHAS`); 2M = `TRIMESTRAL_2M` nos meses 1, 4, 7, 10, 13; 6M = `MENSAL_6M` nos meses 1 a 12; 2M e 6M = pulseira nos meses 1, 7, 13, 19, 25, 37, 61 (Operação).
- SQL: `mentoria_mes_jornada(inscricao uuid, hoje date) → int`, `mentoria_data_prevista(inicio date, mes int, dias int) → date`, `mentoria_gerar_acoes(inscricao uuid, hoje date)`.
- `PlanoService.definirInicio(tx, inscricaoId, inicio: string)`: grava `inicio_jornada`, `termino_previsto`, chama `mentoria_gerar_acoes`. Usado pelas Tarefas 2.1, 2.4 e 4.2.
- Rotas: `POST mentoria/plano/lista`, `POST mentoria/plano/semana`, `PATCH mentoria/acoes/:id`, `GET|PUT mentoria/plano-modelo`, `PUT mentoria/inscricoes/:id/data-idr`.

- [ ] **Step 1: Testes que falham:**

```ts
expect(await dataPrevista('2026-01-31', 2, 0)).toBe('2026-02-28');
expect(await dataPrevista('2026-01-31', 13, 0)).toBe('2027-01-31');
it('RDV gera 12 ações')
it('2M gera reuniões em +0, +3, +6, +9, +12 e pulseiras só até o término')  // 5 + 3 ações
it('6M gera 12 reuniões mensais')
it('gerar duas vezes não duplica')
it('importado: data passada nasce anterior_ao_sistema; futura, não')
it('editar o modelo não reescreve ações criadas')
it('corrigir a IDR recalcula só as pendentes')
it('FLEXIVEL só atrasa depois do fim do mês 7')
it('mês da jornada depois do 12º continua calculando; tela mostra concluída')
```

- [ ] **Step 2:** `pnpm --filter @npac/db test -- mentoria-v2-plano` e `pnpm --filter @npac/api exec vitest run test/mentoria-v2-plano.e2e.test.ts` → FAIL.
- [ ] **Step 3:** Implementar; ligar `definirInicio` no fechamento do onboarding e na importação de 2M/6M.
- [ ] **Step 4:** Mesmos comandos → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-43): plano por mentoria`.

### Tarefa 3.2: Pausar e retomar
Status: ⏳

**Files:** Create: migration `00NN_acompanhamento_v2_pausas.sql`, `api/mentoria/pausa.service.ts`. Modify: `inscricoes.controller.ts`, `ficha.tsx`. Test: `apps/api/test/mentoria-v2-pausa.e2e.test.ts`.

**Interfaces — Produces:** tabela `mentoria_pausas`; `mentoria_dias_pausados(inscricao uuid, ate date) → int`; rotas `POST mentoria/inscricoes/:id/pausar` e `/retomar`. `mentoria_mes_jornada` e `mentoria_onboarding_base` passam a considerar as pausas.

- [ ] **Step 1: Testes que falham:**

```ts
it('pausa guarda o status anterior e retomar devolve')
it('segunda pausa aberta é recusada')                  // 409
it('retomar depois de 60 dias soma 60 ao término e às pendentes a partir do início da pausa')
it('ação feita ou já atrasada antes da pausa não muda')
it('anterior_ao_sistema não muda')
it('duas pausas somam no mês da jornada')
it('pausar e retomar no mesmo dia não muda datas')     // Review Focus 3
it('ação no dia exato do início da pausa é adiada')    // Review Focus 3
it('Operação recebe 404 ao pausar')
```

- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-pausa.e2e.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-43): pausar e retomar`.

### Tarefa 3.3: Aba Plano e edição do modelo
Status: ⏳

**Files:** Create: `web/app/(app)/acompanhamento/plano/page.tsx`, `web/components/acompanhamento/{plano-mentorado,plano-semana,plano-modelo-admin}.tsx`. Test: `web/e2e/acompanhamento-v2-plano.spec.ts`.

- [ ] **Step 1: Testes que falham:** `test('Duda marca os passos do mês 11 e a ação conclui')`, `test('"vence esta semana" lista as ações certas')`, `test('Configurações edita o plano do 2M')`, `test('Pausar na ficha tira o mentorado do plano da semana')`.
- [ ] **Step 2:** `pnpm --filter @npac/web e2e e2e/acompanhamento-v2-plano.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar. **Step 4:** Mesmo comando → PASS + capturas.
- [ ] **Step 5:** Commit `feat(NPAC-43): aba plano`.

---

## Parte 4 — Reuniões

### Tarefa 4.1: Reuniões e contatos na API
Status: ⏳

**Files:** Create: migration `00NN_acompanhamento_v2_reunioes.sql`, `api/mentoria/reunioes.controller.ts`, `reunioes.service.ts`, `contatos.controller.ts`. Test: `apps/api/test/mentoria-v2-reunioes.e2e.test.ts`, `packages/db/test/mentoria-v2-especialista.test.ts`.

**Interfaces — Produces:**
- Tabelas `mentoria_reunioes`, `mentoria_contatos`. `mentoria_ve` e `mentoria_edita` passam a tratar `ESPECIALISTA`.
- `mentoria_excluir_reuniao(reuniao uuid)`: só `AGENDADA` sem registro.
- Rotas: `POST mentoria/reunioes`, `POST mentoria/reunioes/agenda`, `POST mentoria/reunioes/controle-mensal`, `POST mentoria/reunioes/sem-reuniao`, `PATCH mentoria/reunioes/:id`, `POST mentoria/reunioes/:id/remarcar`, `DELETE mentoria/reunioes/:id`, `POST mentoria/contatos`.

- [ ] **Step 1: Testes que falham:**

```ts
it('estado segue AGENDADA → CONFIRMADA → LINK_ENVIADO → REALIZADA')
it('REALIZADA antes do horário → 400 "A reunião ainda não aconteceu"')
it('remarcar: antiga REMARCADA, nova AGENDADA ligada')
it('taxa de comparecimento = REALIZADA ÷ (REALIZADA + FALTOU)')
it('excluir só AGENDADA sem registro')
it('excluir a reunião da Manu tira o acesso dela àquela ficha')
it('MENTORADO_EXPERIENTE aceita condutor_inscricao_id sem usuário')
it('outros tipos exigem conduzida_por')
it('condutor pode ser usuário com cargo comercial, que segue sem acesso ao módulo')
it('Operação registra IDR conduzida pelo Leo')
it('Manu edita só as reuniões dela')
it('Manu marca a ação do mês 5 de quem é dela e recebe 404 nas outras')
it('interesse em renovar só em RENOVACAO')
it('controle mensal lista quem fez e quem falta, em todas as mentorias, com filtro')
it('sem reunião há 30 dias conta da importação quando não há reunião')
```

- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-reunioes.e2e.test.ts` e `pnpm --filter @npac/db test -- mentoria-v2-especialista` → FAIL.
- [ ] **Step 3:** Implementar. **Step 4:** Mesmos comandos → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-43): reuniões e contatos`.

### Tarefa 4.2: IDR inicia a jornada e reunião conclui ação
Status: ⏳

**Files:** Modify: `reunioes.service.ts`, `plano.service.ts`, `onboarding.service.ts`. Test: `apps/api/test/mentoria-v2-idr.e2e.test.ts`.

- [ ] **Step 1: Testes que falham:**

```ts
it('IDR às 21h de 10/03 grava data_idr 2026-03-10')     // Brasília
it('IDR às 23h30 de 10/03 grava data_idr 2026-03-10')
it('IDR realizada: status ATIVO, etapa concluída, ações criadas, na mesma transação')
it('segunda IDR realizada não duplica ações nem muda o início')
it('IDR FALTOU deixa a etapa aberta')
it('reunião TRIMESTRAL_2M realizada conclui a ação do período')
it('CARTOES_MILHAS realizada conclui a ação FLEXIVEL; segunda reunião não dá erro')
```

- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-idr.e2e.test.ts` → FAIL.
- [ ] **Step 3:** Implementar com `(inicio at time zone 'America/Sao_Paulo')::date`. **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-43): idr inicia a jornada`.

### Tarefa 4.3: Aba Reuniões
Status: ⏳

**Files:** Create: `web/app/(app)/acompanhamento/reunioes/page.tsx`, `web/components/acompanhamento/{reunioes-agenda,reuniao-registro,controle-mensal,sem-reuniao}.tsx`. Modify: `ficha.tsx`, `mentorados-lista.tsx` (coluna último contato: contato ou reunião realizada), `inscricoes.service.ts`. Test: `web/e2e/acompanhamento-v2-reunioes.spec.ts`.

- [ ] **Step 1: Testes que falham:** `test('Operação agenda, confirma e marca link enviado')`, `test('Manu entra e vê só as reuniões dela')`, `test('controle mensal filtra por mentoria')`, `test('campos internos ficam marcados como internos')`.
- [ ] **Step 2:** `pnpm --filter @npac/web e2e e2e/acompanhamento-v2-reunioes.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar. **Step 4:** Mesmo comando → PASS + capturas.
- [ ] **Step 5:** Commit `feat(NPAC-43): aba reuniões`.

---

## Parte 5 — Fila, avisos e fechamento

### Tarefa 5.1: Fila do dia na API
Status: ⏳

**Files:** Create: migration `00NN_acompanhamento_v2_fila.sql`, `api/mentoria/fila.controller.ts`, `fila.service.ts`, `sh/mentoria/fila.ts`. Test: `apps/api/test/mentoria-v2-fila.e2e.test.ts`.

**Interfaces — Produces:**
- Tabela `mentoria_fila_feitos`.
- `FILA_TIPOS = ['BOAS_VINDAS','PASSO_DEVIDO','PARADO','ENVIAR_CAIXA','CAIXA_ATRASADA','AGENDAR_IDR','LEMBRETE_IDR','LINK_IDR','ENVIAR_PME1','ACAO','FOTO_FAMILIA','AGENDA_MES','REUNIOES_6M','REUNIAO_HOJE']`.
- SQL `mentoria_fila(agora timestamptz)` (`SECURITY INVOKER`, respeita RLS) → `(chave, tipo, inscricao_id, referencia_id, responsavel_perfil, responsavel_id, vence_em, atrasado)`.
- Rotas: `POST mentoria/fila`, `POST mentoria/fila/feito` (`{ chave }`), `PUT mentoria/inscricoes/:id/pme1-enviado`.

- [ ] **Step 1: Testes que falham**, um por linha da tabela da §5, com relógio fixo:

```ts
it('inscrição nova gera BOAS_VINDAS; some ao enviar')
it('passo pendente há mais de 3 dias com o anterior concluído gera PASSO_DEVIDO')
it('passo curto ENVIADO há 4 dias gera PARADO; há 3 dias, não')
it('PME de aquecimento não gera PARADO')
it('formulário sem Caixa gera ENVIAR_CAIXA; atrasado depois de 3 dias')
it('Caixa enviada há 21 dias gera CAIXA_ATRASADA; há 20, não')
it('Caixa ENTREGUE sem IDR aberta gera AGENDAR_IDR; volta depois de FALTOU')
it('dia da IDR gera LEMBRETE_IDR e LINK_IDR; LINK_IDR sai com LINK_ENVIADO')
it('IDR do Leo: LINK_IDR vai só para a Operação')
it('ENVIAR_PME1 sai com pme1-enviado')
it('ação entra no dia; depois fica atrasada; anterior_ao_sistema nunca entra')
it('RDV no mês 10 sem foto gera FOTO_FAMILIA; 2M não')
it('reunião de hoje aparece para quem conduz e para a Operação, com o status')
it('dia 1º gera AGENDA_MES e REUNIOES_6M; saem por fila_feitos e voltam no mês seguinte')
it('PAUSADO e CANCELADO não aparecem')
it('importados não geram BOAS_VINDAS')
it('responsável desativado: item cai no perfil')       // Review Focus 5
it('Diretoria sem perfil vê tudo, sem repetir item')   // Review Focus 5
it('"hoje" muda à meia-noite de Brasília, não à de UTC')
```

- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-fila.e2e.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-43): fila do dia`.

### Tarefa 5.2: Aba Fila, mensagens-modelo e WhatsApp
Status: ⏳

**Files:** Create: migration `00NN_acompanhamento_v2_mensagens.sql`, `api/mentoria/mensagens.controller.ts`, `web/app/(app)/acompanhamento/fila/page.tsx`, `web/components/acompanhamento/{fila,whatsapp-botoes,mensagens-admin}.tsx`, `sh/mentoria/mensagens.ts`. Modify: `web/app/(app)/acompanhamento/page.tsx` (redirect `/acompanhamento/fila`). Test: `packages/shared/test/mentoria-mensagens.test.ts`, `web/e2e/acompanhamento-v2-fila.spec.ts`.

**Interfaces — Produces:** `renderMensagem(texto: string, pessoas: { nome: string; apelido: string | null }[]): string`; rotas `GET|PUT mentoria/mensagens`. `link_grupo` só aceita `https://chat.whatsapp.com/`.

- [ ] **Step 1: Testes que falham:**

```ts
expect(renderMensagem('Oi {nome}!', [{ nome: 'Ana Lima', apelido: 'Aninha' }])).toBe('Oi Aninha!');
expect(renderMensagem('Oi {nomes}!', [{ nome: 'Ana', apelido: null }, { nome: 'Bia', apelido: null }])).toBe('Oi Ana e Bia!');
test('Operação conclui um item e ele some da Fila')
test('WhatsApp copia o texto e o link não contém o texto')
test('casal: mensagem usa a versão casal')
test('pessoa sem WhatsApp não mostra botão; sem link do grupo não mostra "Grupo"') // Review Focus 4
test('Manu vê só os itens dela')
test('Leo não tem Fila')
```

- [ ] **Step 2:** `pnpm --filter @npac/shared test` e `pnpm --filter @npac/web e2e e2e/acompanhamento-v2-fila.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar; botões de WhatsApp também nas outras abas. **Step 4:** Mesmos comandos → PASS + capturas.
- [ ] **Step 5:** Commit `feat(NPAC-43): aba fila e mensagens-modelo`.

### Tarefa 5.3: Avisos no celular
Status: ⏳

**Files:** Create: migration `00NN_acompanhamento_v2_avisos.sql`, `api/mentoria/avisos.scheduler.ts`. Modify (**as 2 mudanças do D12**): `api/push/push.module.ts` (`@AllRoles()` em `PushController`), `web/app/(app)/mais/page.tsx` (link para quem tem `me.modules.mentoria` ou comercial); `apps/api/test/acompanhamento-sem-comercial.e2e.test.ts` (`LIBERADAS` ganha `/^\/api\/push\//`); serviços que mudam datas chamam `rearm()`. Test: `apps/api/test/mentoria-v2-avisos.e2e.test.ts`.

**Interfaces — Produces:** `MENTORIA_CLOCK`; `AvisosScheduler` com `rearm()`, `fire()`, `settled()` (mesmo desenho de `ReminderScheduler`); SQL `mentoria_aviso_proximo(agora timestamptz) → timestamptz`, `mentoria_aviso_reclamar(agora timestamptz)` → `(chave, user_ids)`, gravando em `mentoria_avisos_enviados`. Payload fixo: `{ title: 'Acompanhamento', body: 'Novos itens na Fila do dia', url: '/acompanhamento/fila', tag: 'mentoria-fila' }`.

- [ ] **Step 1: Testes que falham:**

```ts
it('etapa passa de 3 dias: um push para a Operação, uma vez só')
it('Caixa no 21º dia: um push')
it('ação no dia: push às 8h para o responsável')
it('IDR: push às 8h e 30 minutos antes')
it('dia 1º às 8h: push para a Operação')
it('payload nunca contém nome')
it('API parada: ao subir, envia só uma vez')
it('PAUSADO não recebe push')
it('importação não dispara push')
it('cargo Acompanhamento se inscreve no push; SDR continua igual')
```

- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-avisos.e2e.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. **Step 4:** Mesmo comando → PASS; `acompanhamento-sem-comercial` → PASS.
- [ ] **Step 5:** Commit `feat(NPAC-43): avisos no celular`.

### Tarefa 5.4: Exportação, exclusão, LGPD, transferência e fechamento
Status: ⏳

**Files:** Create: migration `00NN_acompanhamento_v2_exclusao.sql`, `api/mentoria/exportacao.controller.ts`, `carteira.controller.ts`, `web/components/acompanhamento/{exportar-botao,transferir-carteira}.tsx`. Modify: `CLAUDE.md` (mapa do Acompanhamento, regras, `mentoria_pode` → `mentoria_perfil`/`mentoria_admin`). Test: `apps/api/test/mentoria-v2-exclusao.e2e.test.ts`.

**Interfaces — Produces:** `mentoria_excluir_inscricao(inscricao uuid)`, `mentoria_anonimizar_inscricao(inscricao uuid)`; rotas `POST mentoria/exportar` (`{ aba, filtros }`), `DELETE mentoria/inscricoes/:id`, `POST mentoria/inscricoes/:id/anonimizar`, `POST mentoria/carteira/transferir`.

- [ ] **Step 1: Testes que falham:**

```ts
it('excluir inscrição: só admin, enfileira a mídia')
it('anonimizar apaga pessoais, cifrados, endereço e legado; mantém contagens')
it('CSV: admin e Acompanhamento; Operação 404')
it('CSV: contato só para admin; dor, sonho e anotações nunca')
it('CSV neutraliza fórmulas e grava auditoria')
it('transferir carteira move inscrições e ações pendentes')
```

- [ ] **Step 2:** `pnpm --filter @npac/api exec vitest run test/mentoria-v2-exclusao.e2e.test.ts` → FAIL.
- [ ] **Step 3:** Implementar e atualizar `CLAUDE.md`. **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5: Verificação final**, relatar a saída de cada um:

```bash
pnpm lint && pnpm typecheck
pnpm --filter @npac/shared test
pnpm --filter @npac/db test
pnpm --filter @npac/api test
pnpm --filter @npac/web e2e
```

Esperado: tudo verde, incluindo as suítes do CRM e o teste de `/leads` < 150 KB. Fluxo real por perfil no navegador (`duda`, `operacao`, `manu`, `leo`, `diretor`), capturas em 375/768/1024/1440.

- [ ] **Step 6:** Commit `feat(NPAC-43): exportação, exclusão e fechamento da fase 1`.
- [ ] **Step 7: Antes do deploy** (com o OK do Gabriel): rodar `infra/backup/backup.sh`; depois da migration, rodar o worker de mídia para apagar os arquivos antigos.
