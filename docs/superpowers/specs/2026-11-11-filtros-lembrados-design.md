# Filtros lembrados (NPAC-46)

Data: 11/11/2026 · Pedido do Gabriel: "todas as opções de filtros, customização, seleção, parem de
ficar se perdendo quando eles trocam de aba. Quando aplicam um filtro e voltam ele some. Isso vale
para tudo, o projeto todo." · Escolha: **A, no aparelho** (cookie por pessoa).

## Objetivo

Quem aplica um filtro, escolhe uma aba ou um período numa tela encontra tudo igual quando volta:
- ao ir para outra tela do menu e voltar;
- ao trocar de aba dentro da tela (Agenda → Controle mensal → Agenda);
- ao dar F5 ou quando o celular recarrega o app.

Junto vai o item 4 da lista de acabamento: **filtro vale assim que é escolhido**, sem botão.

## Decisões (não rediscutir)

1. **Onde:** cookie no aparelho, um por pessoa e por tela (nome com hash do ID, como `npac_hoje`).
   Vale até a pessoa trocar ou limpar (1 ano). Outro aparelho começa do zero.
2. **Busca por texto só na memória da aba** (pode ter telefone, e-mail ou @): volta ao trocar de tela,
   some no F5. Nunca vai para cookie, URL ou armazenamento. A página da lista anda junto com a busca.
3. **Leads marcados para ação em massa não são lembrados** (risco de agir sobre um lead esquecido).
4. **"Limpar filtros"** aparece onde há filtro ativo e a tela ainda não tem como limpar.
5. **Aplicar na hora:** selects, datas e abas aplicam ao mudar. Saem os botões "Filtrar Hoje",
   "Buscar" do Pipeline e "Atualizar relatório". O texto da busca continua no Enter: telefone e
   e-mail só são achados inteiros, então buscar enquanto digita mostraria "nenhum lead" no meio.
6. **Semana da agenda e mês do Controle mensal valem só no mesmo dia** (são navegação, não filtro):
   no dia seguinte a tela abre na semana e no mês atuais. Os demais filtros não expiram.
7. **URL explícita vence:** link com parâmetro (`/leads?view=…`, `?aba=…` vindo da Fila ou do
   Ctrl+K) abre o que o link pede, e isso passa a ser o lembrado.
8. **Entrega em 2 PRs:** Comercial, depois Acompanhamento.

## O que cada tela lembra

### PR 1 — Comercial

| Tela | Lembra no aparelho | Só na memória | Muda no uso |
|---|---|---|---|
| Leads | filtro salvo aberto **ou** etapa, perfil, origem, SDR, closer, período, de/até, ordenar, direção | texto da busca, página | selects aplicam ao mudar; "Limpar filtros" |
| Pipeline | os mesmos filtros de Leads; coluna aberta no celular (colunas ocultas já lembra) | texto da busca | sai "Buscar"; busca no Enter; "Limpar filtros" |
| Hoje | SDR e closer (já lembra) | — | sai "Filtrar Hoje"; aplica ao mudar |
| Dashboard | Hoje/7 dias/mês e SDR escolhido (ordem dos cards já lembra) | — | — |
| Relatórios | período, de/até, SDR, closer, etapa, perfil, origem, produto | — | sai "Atualizar relatório"; "Limpar filtros" |
| Admin | aba (Usuários, Produtos, Etapas, Auditoria, LGPD) | — | — |
| Chat | conversa aberta | — | — |
| Playbook | — | texto da busca | — |

### PR 2 — Acompanhamento

| Tela | Lembra no aparelho | Só na memória |
|---|---|---|
| Fila | Minha/Equipe, grupo | — |
| Mentorados | mês, status, responsável, "completar a ficha" | — |
| Reuniões | aba aberta e os filtros de cada aba (Agenda: semana¹, condutor · Controle: mês¹, mentoria · Sem reunião: mentoria) | — |
| Plano | aba, mês da jornada | — |
| Configurações | aba, mentoria do plano-modelo | — |
| Onboarding | etapa escolhida, painel (Funil, Caixas, IDRs) | — |
| Ficha | aba (vale para qualquer ficha), filtro do histórico | mês do plano, por ficha² |

¹ Só no mesmo dia (decisão 6). ² Cada mentorado está num mês diferente da jornada; o padrão segue
sendo o mês atual dele.

## Como funciona

**Ferramenta comum (`web/lib/screen-prefs.ts`, sem `'use client'`):**
- Cada tela declara as chaves que lembra e um validador por chave (lista de etapas, IDs da equipe
  ou de produtos, data `AAAA-MM-DD`, valores do enum).
- Grava `chave=valor&…` no cookie da tela (`Path` = rota da tela, `SameSite=Lax`, `Secure` no https),
  por `savePreference` de `lib/user-cookie.ts`. Valor padrão não é gravado; tudo padrão apaga o cookie.
- Ao ler, descarta chave desconhecida, valor inválido, ID de quem saiu ou não atua mais na função,
  etapa excluída e filtro que o cargo não vê na tela (ex.: produto para SDR).

**Dois jeitos, conforme a tela já funciona hoje:**
1. *Estado na tela* (Leads, Pipeline, Hoje, Dashboard, Relatórios, Admin, Chat, grupo da Fila,
   Mentorados, Onboarding, histórico da ficha): o servidor lê o cookie e já busca os dados filtrados (sem "piscar"); a
   tela grava o cookie a cada mudança.
2. *Estado na URL* (Reuniões, Plano, Configurações, aba da Fila e da Ficha): o cookie guarda a última
   URL de cada aba. Sem nenhuma chave lembrada na URL (clique no menu), vale a salva; com alguma, vale
   a URL. Os links das abas levam a URL salva daquela aba.

**Voltar do navegador:** o Next reaproveita a página antiga; ao montar, a tela compara o cookie com o
que o servidor usou e, se mudou, reaplica (como o Pipeline já faz com as colunas).

**Memória da aba (`web/lib/screen-memory.ts`, cliente):** busca, página e mês do plano da ficha ficam
num mapa do módulo, por pessoa e tela. Sobrevivem à navegação dentro do app; somem no F5 e ao sair.

## Casos de borda

- Filtro salvo apagado, ou filtro que a API recusa (400): a tela abre sem ele e apaga o cookie.
- Pessoa que sai da equipe, etapa ou produto excluído: o filtro cai sozinho na leitura.
- Troca de cargo: o que o cargo novo não vê na tela é ignorado.
- Duas pessoas no mesmo navegador: cada uma tem o seu cookie (hash do ID); a memória é por ID.
- Cookie com mais de 1 KB não é gravado (defesa; os filtros reais ficam bem abaixo).

## Privacidade

- Cookie só com chaves, IDs e datas, nunca nome, contato ou texto digitado.
- `Path` por tela: o cookie não vai para `/api/*`, então não chega à API nem aos logs dela.
- Valor do cookie é entrada não confiável: validado na leitura e de novo pela API (RLS).

## Testes

- e2e em `e2e/preferencias.spec.ts`, um por tela: aplicar (sem botão) → outra tela pelo menu → voltar
  pelo menu → igual; F5 → igual; "Limpar filtros" → limpo também ao voltar; voltar do navegador → o
  mais recente.
- Busca: volta ao trocar de tela, some no F5; `context.cookies()` e a URL nunca têm o termo.
- Outro usuário no mesmo navegador não herda nada.
- Reuniões: semana de ontem não volta hoje (relógio do teste).
- Suítes existentes ajustadas onde clicavam nos botões que saem; teste do JS de `/leads` < 150 KB
  segue passando (se passar, compenso no próprio código, sem subir o limite).
- Capturas 375/768/1024/1440 das telas que mudaram.

## Fora do escopo

- Lembrar em outro aparelho (opção C).
- Os outros itens da lista de acabamento (tabela de Leads, `confirm()`, "Salvo", página de erro…).

## CLAUDE.md

Atualizar a linha "Cookies em vez de localStorage" com os cookies novos, a regra "busca só na memória"
e os dois jeitos (estado na tela / última URL por aba).
