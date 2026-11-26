# Plano NPAC-79 — Renovações (gestão do Acompanhamento, bloco 2)

Spec: `docs/superpowers/specs/2026-11-26-renovacoes-design.md`. Respostas da Eduarda: 1A, 2C, 3B, 4B, 5A, 6A, 7A, 8A.
Branch de cada parte a partir da `release/*` aberta; PR `feat(NPAC-79): …`; migration nova depois da última da release.

Status: spec aprovada (26/11/2026, G1–G6 como recomendados). Parte 1 ✅ (26/11/2026, migration 0092), Parte 2 ✅ (26/11/2026, telas),
Parte 3 ⏳ (Eduarda).

## Parte 1 — banco e API ✅

1. Migration: tabela `mentoria_renovacoes` (RLS de leitura no formato `(select …)`, `npac_app` só SELECT), área
   `RENOVACAO` em `mentoria_edita` (Admin, Acompanhamento com carteira), coluna `concluida_em` + gatilho, guarda que
   recusa status RENOVADO manual, `mentoria_gerar_acoes` com "a partir do mês", `mentoria_renovar`,
   `mentoria_renovacao_desfazer` (só Admin), leitura `mentoria_renovacoes_painel(hoje)` (lista + números, SECURITY
   INVOKER, `SET jit = off`).
2. Shared: tipos e regras puras (situação da conversa, mês "N de M", rótulos) em `sh/mentoria/renovacoes.ts`.
3. API `renovacoes.controller.ts`: `GET mentoria/renovacoes`, `POST inscricoes/:id/renovacoes`,
   `DELETE inscricoes/:id/renovacoes/ultima`; ficha traz `renovacoes` e `pode.renovar`/`pode.desfazerRenovacao`.
4. Testes: `db/test/mentoria-renovacoes.test.ts`, `rls-por-consulta`, `api/test/mentoria-v2-renovacoes.e2e.test.ts`.

Feita quando: as suítes do db e da API passam e a ficha devolve o término novo e as ações do novo ano.

Feito (26/11/2026), decisões tomadas na implementação (o resto como a spec):

- A tabela `mentoria_renovacoes` lê quem vê a ficha (como as pausas), para o selo "Renovado em" aparecer ao lado do
  status para todos; a **aba** é que fica só para Admin e Acompanhamento (`@Perfis` + `mentoria_ve_renovacoes()`).
- "Ação do novo ano" no desfazer = as que a renovação criou (`mentoria_renovacoes.acoes`); as do mês 13 que já nasciam
  no 1º ano (data no próprio término) ficam. O teto continua "data prevista ≤ término": a 1ª renovação da 2M cria
  13, 19 e 25 (o 25 cai no novo término, como o 13 no 1º ano).
- `mentoria_gerar_acoes(uuid, date)` passou a cortar em 12 × nº de renovações + 1: trocar a mentoria pela inscrição
  depois de renovar não cria os meses dos anos que já passaram.
- `concluida_em` só quando a ficha **muda** para Concluído; ficha que já nasce concluída (importação) fica sem data.
- Renovar e desfazer pedem a `version` da ficha (clique duplo = 409); desfazer só com a ficha Ativo e volta o término
  pela diferença de dias (pausa depois da renovação fica).
- Para a Parte 2: `GET mentoria/renovacoes` devolve `{ hoje, numeros, itens }` com `situacao`, `situacaoRotulo` e
  `mesRotulo` prontos; no cliente, importe de `@npac/shared/renovacoes` (fora do barril do módulo, pelo teto do `/leads`);
  os filtros são `filtrarRenovacoes` (no servidor da tela, pelo cookie) e os números não mudam com
  o filtro. A ficha traz `renovacoes` (ano em curso = `renovacoes.length + 1`, total `mesesDaJornada(n)`).

## Parte 2 — telas ✅

Feito (26/11/2026): janelinha 2 (botões + resumo), a sugestão seguida depois do "continua" do Gabriel. A aba começou como a
opção A (tabela); o Gabriel achou "meio sem graça" e, entre as 3 opções do canvas "Renovações e gestão"
(https://claude.ai/artifact/6fme7216tYSLNF878k6rjg), pediu "uma mistura do 1 com o 2": painel escuro com o anel do % e os
degraus da conversa (que filtram) + a linha do término de cada um, com a tabela embaixo. Capturas em
`docs/acompanhamento/prototipo/renovacoes/` (1–11 = comparação A/B/C e janelas; `build-*` = a final em 375/768/1024/1440,
claro e escuro). Textos novos da linha: "Quando cada um termina", "Cada rosto fica no dia do término, com a cor da situação
da conversa.", "Já terminou", "Hoje, DD/MM" e "Terminou" na legenda. Textos novos aprovados junto: subtítulo
da aba, "de N" e "últimos 12 meses" nos números, "Novo término" e "Meses 13 a 24" na janelinha, o texto do "Desfazer" e
"2º ano" no mês de quem renovou (a frase da API "O 24º mês começa em DD/MM" parecia data passada). Além do pedido:
Mentorados e Plano da semana mostravam "Jornada concluída" para quem renovou; a lista traz `renovacoes` e o rótulo segue
o ano (teste na API).

1. Aba `/acompanhamento/renovacoes` (números, lista, filtros lembrados em `AC_PREFS`), menu/Ctrl+K/Mais, redireciona o
   "Em breve".
2. Ficha: "Registrar renovação" (janelinha), selo "Renovado em DD/MM", "Mês 14 de 24", faixa do ano atual, "Desfazer".
3. Select de status sem "Renovado".
4. e2e `acompanhamento-renovacoes.spec.ts` (Duda, carteira, Operação) e capturas 375/768/1024/1440, claro e escuro.
5. CLAUDE.md atualizado.

Feita quando: e2e verde, capturas conferidas, roteiro no ITODEV com Admin, Acompanhamento e Operação.

## Parte 3 — PMEs do 2º ano ⏳ (depende da Eduarda)

Mensagem pronta (mandar quando a Parte 2 estiver no ITODEV, ou antes se o Gabriel quiser):

```
Duda, mais duas sobre a renovação, para o 2º ano:

*1. Depois de renovar, a pessoa continua recebendo PME todo mês?*
A) Sim, segue do 13º ao 24º PME (você cadastra os novos em Configurações > PMEs)
B) Sim, mas recomeça do 1º PME
C) Não recebe PME no 2º ano

*2. As ações de cada mês do 2º ano (o plano):*
A) Você cadastra os meses 13 a 24 em Configurações > Plano-modelo, quando quiser ⭐
B) Repete o plano do 1º ano
```
