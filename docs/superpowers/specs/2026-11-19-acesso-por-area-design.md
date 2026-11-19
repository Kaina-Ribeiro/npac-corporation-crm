# Spec: acesso por área (Head por área + conta Mestre)

NPAC-54. Pedido do Gabriel, 19/11/2026. Status: fases 1 e 2 mescladas (migrations `0072` e `0073`); M1 confirmada por
ele; as demais decisões marcadas "minha" são recomendações que ele pode trocar. Plano por fases:
`docs/plans/acesso-por-area.md`.

Código conferido na `release/v0.19` (commit `763bb4f`, última migration `0071`).

## Por que

- A Eduarda (Admin do Acompanhamento) pediu 3 contas no módulo e perguntou se ela mesma pode criá-las
  (áudio de 19/11). Hoje só a Diretoria cria conta do Acompanhamento.
- O CRM vai ganhar áreas. Cada área precisa de um Head que cuida das contas dela, com uma conta Mestre
  acima de todas. É o modelo de "admin delegado" (Google Workspace, Slack para empresas).
- Hoje o cargo é guardado de dois jeitos (comercial em `user.role`; Acompanhamento em `role` +
  `mentoria_perfis`) e ninguém pode estar em duas áreas.

## Objetivo e sucesso

1. A Eduarda entra no módulo, convida uma pessoa com cargo do Acompanhamento, aprova um pedido de acesso
   do Acompanhamento, troca cargo, redefine senha e desativa conta da área dela, sem a Diretoria.
2. O Head do Comercial faz o mesmo só no Comercial. Nenhum Head vê nem mexe em conta de outra área.
3. Só a Diretoria (Mestre) dá e tira Head, em qualquer área.
4. Uma pessoa pode ter cargo em duas áreas (ex.: Closer que também é Especialista), com um login só.
5. O cargo passa a morar em **um lugar só**: a tabela de membros por área.
6. Para quem já usa o sistema nada muda no que vê e no que pode fazer nos dados (leads, vendas,
   mentorados). Provado por teste de equivalência, conta por conta.

## Não-objetivos

- Criar cargo ou área pela tela. Cargos e áreas são fixos no código (`sh/cargos.ts`) e travados por teste.
- Cargo "Envios" e cargo "só a própria carteira": ficam fora. A Eduarda respondeu em 19/11: **1B** (a Maria dos envios
  só entra com o cargo Envios, junto da tela Envios físicos, fase 4 do Acompanhamento) e **2B** (a segunda Maria vê só a
  carteira dela; vira o alcance "Só a carteira" no cargo Acompanhamento, fase 3B do plano, entre a 3 e a 4, com as respostas dela lá). Com este desenho, cargo novo
  = uma entrada em `sh/cargos.ts` + a regra de dados dele.
- Religar MFA e o limite de tentativas de login (ver "Segurança", recomendação).
- Mudar o que cada cargo vê nos dados. A RLS de leads e de mentorados não muda de resultado.
- Consertar o `/api/team` (lista nomes para o cargo Acompanhamento; já anotado em outra spec).

## Anti-objetivos (seria falha mesmo funcionando)

- Um Head conseguir, por qualquer caminho (tela, API, função do banco, redefinir senha), mais acesso do
  que tem: virar Head de outra área, criar outro Head, ler dado de outra área.
- Alguém perder acesso no deploy, ou a Diretoria ficar trancada para fora.
- A regra existir em duas versões que divergem (uma no código, outra no banco).

## Decisões

| # | Decisão | Origem |
|---|---|---|
| D1 | A área é a peça central: cargo = (pessoa, área, cargo, é Head?). | Gabriel, 19/11 |
| D2 | Conta Mestre = Diretoria: vê e mexe em tudo, a única que dá e tira Head. | Gabriel, 19/11 |
| D3 | Cada área tem Head, que cria contas, aprova pedidos e gerencia cargos só da área dele. | Gabriel, 19/11 |
| D4 | Sem escalada: ninguém dá mais poder do que tem, nem mexe em conta do mesmo nível ou acima. | Gabriel, 19/11 |
| D5 | Cargos fixos por área, no código, travados por teste. | Gabriel, 19/11 |
| D6 | Envios é cargo do Acompanhamento (não é área própria); fora desta spec. | Gabriel, 19/11 ("Cargo do Acompanhamento") |
| D7 | A tabela única de membros entra **agora** (o "passo 2"), não depois. | Gabriel, 19/11 ("faz o passo 2 de uma vez") |
| D8 | Execução: uma sessão Opus 5.5 high por fase do plano. | Gabriel, 19/11 |
| D9 | Só a Diretoria dá e tira Head/Admin, também dentro da própria área (era a M1). | Gabriel, 19/11 ("A") |
| D10 | A Diretoria tem um registro compacto e fácil de ver do que aconteceu de importante com contas e acessos (conta criada, cargo dado…). | Gabriel, 19/11 |
| D11 | Cada linha do registro diz a área e o cargo: "Eduarda criou a conta de Maria · Acompanhamento, Operação". | Gabriel, 19/11 |
| D12 | Na lista de pessoas, ao lado de cada nome, "entrou há 2 horas" / "não entra há 12 dias", para ver quem usa e quem sumiu. Entradas no sistema não viram linha do registro. | Gabriel, 19/11 ("gostei da ideia") |
| D13 | Visual e textos da Fase 3: opções 1A (aba Perfis), 2A (Admin da Diretoria) e 3A (textos), detalhadas em "Telas". | Gabriel, 19/11 ("1A, 2A, 3A") |

### Decisões minhas, para o Gabriel conferir

Ele pediu para seguir sem mais perguntas. Cada uma tem o motivo e o que muda se ele trocar.

| # | Decisão minha | Motivo | Se trocar |
|---|---|---|---|
| M1 | ✅ Confirmada pelo Gabriel, virou D9: um Head não cria outro Head, nem na própria área. | — | — |
| M2 | **Head da área = quem já vê tudo nela.** No Comercial é o cargo Head (liderança). No Acompanhamento é o selo "Admin do Acompanhamento". Não nasce um terceiro tipo de poder. | Separar "gerencia pessoas" de "vê os dados" criaria 4 combinações por área. | Vira um selo novo por área e a regra dobra de tamanho. |
| M3 | **Nomes na tela não mudam**: "Head" no Comercial, "Admin do Acompanhamento" no módulo, "Diretoria" para a Mestre. "Mestre" e "Head da área" são nomes internos. | "Admin" é a palavra do PDF da Eduarda (C5 da spec de cargos). | Troca de rótulo em `sh/cargos.ts` e nas telas do módulo. |
| M4 | **Pôr uma pessoa em duas áreas é só da Diretoria.** O Head só enxerga contas da área dele. | Evita o Head precisar ver contas de outra área; caso raro. | O Head ganharia uma busca de "pessoas de outras áreas". |
| M5 | **Conta em duas áreas: senha, MFA e desativar só a Diretoria.** O Head de cada área ainda troca o cargo da área dele. | Redefinir a senha daria ao Head o login da pessoa na outra área (escalada). | Não recomendo trocar. |
| M6 | **A aba do módulo continua "Perfis"** e ganha Convidar, Pedidos de acesso, Redefinir senha e Desativar. | "Perfis" é o texto do PDF; não invento aba nova. | Renomear para "Equipe" é um rótulo. |
| M7 | **A coluna `user.role` continua existindo como resumo calculado**, sem ser a fonte. | 152 leituras em 45 arquivos e a sessão do Better Auth dependem dela; apagar não muda nada na tela. | Apagar de vez é uma fase extra (~3–4 dias). |
| M8 | **Sempre existe ao menos uma Diretoria ativa** (o banco recusa tirar ou desativar a última). | Evita trancar todo mundo para fora. | — |
| M9 | **Pedido de acesso: o Head vê e aprova só os da área dele**, e só com cargo dessa área. A Diretoria vê todos e pode aprovar em qualquer área. | D3. A área do pedido já existe (NPAC-52). | — |
| M10 | **O registro da D10 é um cartão "Acessos" no topo de Admin → Usuários, só para a Diretoria**, e não entra no sino. | O sino é dos avisos de lead (`notifications` aponta para a linha do tempo do lead); o cartão lê a auditoria que já existe. | Entrar no sino ou virar push é trabalho à parte (tabela de avisos nova). |
| M11 | ✅ Confirmada pelo Gabriel, virou D12: entradas no sistema não entram no quadro "Acessos"; aparecem como "entrou há X" na lista de pessoas. | — | — |
| M12 | **"Entrou há X" conta a última vez que a pessoa usou o sistema, não a última vez que digitou a senha.** | A sessão dura 30 dias (`expiresIn` em `api/auth/auth.ts`): quem usa todo dia sem sair apareceria como "não entra há 20 dias". | Contar só a digitação da senha é mais simples e engana. |
| M13 | **Quem vê o "entrou há X": a Diretoria (todas as contas) e o Head (as da área dele)**, nas duas listas (Admin → Usuários e aba Perfis do módulo). | É a equipe de cada um; a Eduarda precisa disso tanto quanto a Diretoria. | Só a Diretoria: some da aba Perfis. |

## Correções ao arquivo de contexto (`docs/plans/acesso-por-area-contexto.md`)

O contexto foi escrito sobre uma pasta local 17 commits atrás da release.

- ❌ "Pedido de acesso não tem área": **já tem** (`access_requests.area`, migration `0068`, NPAC-52), com
  tela própria `/login/acompanhamento/solicitar`. Pedidos antigos viraram `COMERCIAL`. A pergunta 5
  ("pedidos sem área") deixa de existir.
- ❌ "Mexe em 69 regras do banco do comercial": as políticas leem o cargo por **funções** (`app_role()`,
  `mentoria_perfil()`, `mentoria_admin()`, `mentoria_perfil_de()`). Leitura direta de `user.role` em SQL
  vivo: menos de 10 pontos. Dá para trocar a fonte sem reescrever política nenhuma.
- ✅ O achado confere: `mentoria_definir_perfil` (0045) aceita o selo de Admin vindo de qualquer Admin do
  módulo. Esta spec fecha.

## Caminhos considerados

| Caminho | O que é | Troca |
|---|---|---|
| 1. Só a regra | Regra única por área, dados onde estão (o antigo "Caminho 2"). | Mais curto, mas mantém dois jeitos de guardar cargo e não aceita pessoa em duas áreas. Descartado por D7. |
| **2. Trocar a fonte por baixo** ✅ | Tabela de membros vira a fonte; as funções do banco passam a ler dela **com o mesmo resultado**; políticas intocadas; `user.role` vira resumo. | Entrega tudo de D1–D7 com risco baixo: o comportamento antigo é comparado conta por conta. Fica um resumo calculado (M7). |
| 3. Reescrever tudo | Toda política e os 45 arquivos passam a perguntar "cargo X na área Y"; `user.role` e o enum somem. | Fim mais limpo, 2–3 semanas, troca as regras do comercial de uma vez com a equipe usando em prod. |

Escolhido: **2** (o Gabriel entregou o "como"; decisão minha).

## Modelo

### Dados

**Tabela nova `area_membros`** (fonte única do cargo):

| Coluna | Tipo | Regra |
|---|---|---|
| `user_id` | text, FK `user` | PK com `area` |
| `area` | text | `COMERCIAL` ou `ACOMPANHAMENTO` (as de `AREAS` em `sh/cargos.ts`) |
| `cargo` | text, pode ser nulo | Comercial: `SDR`, `CLOSER` ou `HEAD`, nunca nulo. Acompanhamento: `ACOMPANHAMENTO`, `OPERACAO`, `ESPECIALISTA`, `MENTOR` ou nulo (conta antiga "falta perfil") |
| `head` | boolean | Comercial: `head = (cargo = 'HEAD')`. Acompanhamento: o antigo `mentoria_perfis.admin`; exige cargo não nulo |
| `definido_por`, `definido_em` | text FK, timestamptz | Quem e quando |

**Coluna nova `user.mestre`** (boolean): a Diretoria. Quem é Mestre não tem linha em `area_membros`
(é Head de todas sem linha, como já é Admin do Acompanhamento sem linha hoje).

`can_prospect` / `can_close` ("Atua como SDR/Closer") continuam em `user`, com as mesmas regras.

**Invariantes (no banco):**
- Conta ativa que não é Mestre tem ao menos um vínculo (conferido no commit).
- Ao menos uma conta Mestre ativa (M8).
- `npac_app` não escreve em `area_membros` nem em `user.mestre` direto: só pelas funções abaixo.
- RLS de leitura em `area_membros`, no formato "uma vez por consulta" (regra da 0060–0061): a própria
  linha, a Mestre, ou o Head daquela área.

**Carga inicial (na mesma migration):**

| Hoje | Vira |
|---|---|
| `role = DIRETOR` | `mestre = true`, sem vínculo |
| `role` SDR, CLOSER ou HEAD | vínculo `COMERCIAL` com esse cargo (`head` só no HEAD) |
| `role = ACOMPANHAMENTO` com linha em `mentoria_perfis` | vínculo `ACOMPANHAMENTO`, cargo = perfil, `head` = `admin` |
| `role = ACOMPANHAMENTO` sem linha | vínculo `ACOMPANHAMENTO` com cargo nulo ("falta perfil") |

Contas desativadas também ganham vínculo (a ficha ainda mostra quem saiu).

### `user.role` vira resumo (M7)

Calculado por gatilho a partir da fonte: Mestre → `DIRETOR`; senão o cargo do Comercial, se houver;
senão `ACOMPANHAMENTO`. Serve a sessão do Better Auth, `isLeader`, `hasCommercialAccess` e a matriz
`can()`. Quem tem as duas áreas aparece com o cargo comercial no resumo; o acesso ao módulo vem do
vínculo, não do resumo.

O mesmo gatilho acerta, no mesmo UPDATE, as caixas que o cargo fixa (SDR `t/f`, Closer `f/t`, só
Acompanhamento `f/f`), para o `CHECK user_cargo_caixas` (0049) continuar valendo; as de Head e Diretoria
ficam como estão e a API grava o que foi escolhido.

### Funções do banco que trocam de fonte (mesma assinatura, mesmo resultado)

| Função | Passa a responder por |
|---|---|
| `app_role()` | Mestre → `HEAD`; cargo do vínculo Comercial; sem ele e com vínculo no Acompanhamento → `ACOMPANHAMENTO` (igual a hoje) |
| `mentoria_perfil()`, `mentoria_perfil_de(uid)` | cargo do vínculo Acompanhamento de conta ativa |
| `mentoria_admin()` | Mestre, ou vínculo Acompanhamento com `head` |
| Destinatários do push da Fila (0055, 0070) | vínculos do Acompanhamento |
| Aviso de formulário à liderança (0047) | Mestre e Head do Comercial |
| Qualquer outra função viva que leia `user.role` ou `mentoria_perfis` | a fonte nova |

Nenhuma política (`CREATE/ALTER POLICY`) é reescrita. Um teste-guarda varre as funções e políticas vivas
e falha se alguma, fora da lista de compatibilidade, ainda ler `user.role` ou a tabela `mentoria_perfis`.

**Funções novas (as únicas que escrevem cargo):**
- `area_definir_membro(alvo, area, cargo, head)`: cria ou troca o vínculo, aplicando a regra abaixo com
  quem está logado; atualiza o resumo.
- `area_remover_membro(alvo, area)`: tira de uma área (recusa se for a última da pessoa).
- `area_definir_mestre(alvo, valor)`: só a Mestre; ao virar Mestre os vínculos saem; ao deixar de ser,
  exige a área e o cargo de destino.
- `area_gerencia(alvo)`: "quem está logado pode mexer na conta inteira do alvo?" (para `push_purge_user`
  e afins).

### Compatibilidade enquanto as fases andam (sai na fase 5)

Prod está em uso. Depois da migration da fase 1, **a versão anterior do app tem de continuar funcionando**
(voltar o app sem voltar o banco). Para isso:

- `mentoria_perfis` vira uma visão **só de leitura** com as mesmas colunas, lendo `area_membros`. O
  app nunca escreveu nela direto (só por `mentoria_definir_perfil`); o seed (`seed-mentoria.ts`) e os
  testes que inserem nela passam a usar a função na fase 1.
- `mentoria_definir_perfil(alvo, perfil, admin)` continua existindo, por cima de `area_definir_membro`.
- Escrita direta em `user.role` (código antigo, seeds, testes que fazem `update "user" set role`) é
  traduzida por gatilho para o vínculo certo. Inserir usuário com `role` cria o vínculo.

## Regra única de "quem gerencia quem"

Uma função pura em `packages/shared/src/areas.ts` (sem zod, legível no cliente) e a gêmea em SQL dentro
das funções acima. As duas rodam a **mesma tabela de casos** (um arquivo de casos, dois testes).
`guardLeadership` (`api/admin/users.ts`) sai e dá lugar a ela.

Quem faz → sobre quem → o quê:

| Ação | Mestre (Diretoria) | Head da área A | Demais |
|---|---|---|---|
| Ver contas | todas | só quem tem vínculo em A | como hoje (sem Admin) |
| Convidar conta nova | qualquer área e cargo, com ou sem Head | cargo de A, nunca Head | ❌ |
| Ver, aprovar e recusar pedido de acesso | todos; aprova em qualquer área | só pedidos de A; aprova com cargo de A, nunca Head | ❌ |
| Trocar o cargo de alguém na área A | ✅ | ✅ se o alvo não é Head | ❌ |
| Dar ou tirar Head | ✅ | ❌ | ❌ |
| Redefinir senha, MFA, desativar e reativar | ✅ | ✅ se o alvo **só** tem a área A e não é Head | ❌ |
| Pôr alguém em uma segunda área, ou tirar de uma | ✅ | ❌ (M4) | ❌ |
| Trocar alguém de área | ✅ | ❌ | ❌ |
| Dar ou tirar Diretoria | ✅ (não a própria; nunca a última) | ❌ | ❌ |
| Mexer no próprio cargo ou se desativar | ❌ | ❌ | ❌ |

Respostas da API: conta que o Head não enxerga (outra área, Diretoria) → **404**. Conta que ele enxerga
mas não pode mexer (outro Head da área, conta em duas áreas) → **403** com a frase do motivo. Casos que
já existem hoje mantêm o código e a mensagem de hoje.

O que não muda por área:
- **Comercial:** o Head continua liderança (vê todos os leads e vendas, relatórios, catálogo, transferir
  leads). "Atua como SDR/Closer" só em Head e Diretoria, logo só a Diretoria marca.
- **Acompanhamento:** o Admin continua com tudo que tem hoje no módulo (ver todos, LGPD, CSV com
  contato, transferir carteira). A regra de responsável e de condutor não muda.

**Fechamento do achado:** o selo de Admin do Acompanhamento passa a ser dado e tirado só pela Diretoria,
no banco (`area_definir_membro`) e na API (`PUT /mentoria/perfis` recusa mudar `admin` se quem pede não
é Mestre). A Eduarda continua trocando o perfil das pessoas; não cria nem derruba outro Admin.

## API

- **`/api/me`:** ganha `mestre` e `areas: [{ area, cargo, head }]`. `modules.mentoria` = Mestre ou
  vínculo no Acompanhamento. `role` continua vindo (resumo).
- **`admin/users` e `admin/access-requests`:** passam a aceitar o Head do Acompanhamento
  (`@AllRoles()` + guarda "Mestre ou Head de alguma área"; cargo do Acompanhamento sem Head continua
  recebendo 404). Cada rota carrega quem pede e o alvo e chama a regra única. O campo Cargo já diz a
  área (`CARGO_INFO[cargo].area`): o corpo das rotas não ganha campo novo.
  - `GET admin/users`: a Mestre recebe todas as contas, cada uma com `areas`; o Head recebe só as da
    área dele, com o cargo dessa área e `outraArea: true` quando a pessoa também está em outra (sem dizer
    qual cargo). `perfil` e `moduloAdmin` passam a vir também para o Head do Acompanhamento.
  - `PATCH admin/users/:id` com cargo de outra área = troca de área (só Mestre). Em conta com duas
    áreas responde 400 pedindo o caminho por área.
  - Novo, só Mestre: `PUT admin/users/:id/areas/:area` (`{ cargo, head? }`) e
    `DELETE admin/users/:id/areas/:area`.
  - `admin:manage` continua valendo para catálogo, etapas e transferir leads (Comercial).
- **Módulo:** `GET/PUT mentoria/perfis` continuam (troca de perfil pelo Admin). `MentoriaGuard` deixa de
  olhar o `role` e passa a aceitar a Mestre ou quem tem vínculo no Acompanhamento (o `PerfilGuard` já
  consulta o banco a cada pedido; a resposta dele ganha `membro`). Rotas do comercial não ganham
  consulta nova por pedido.
- **Leitores do cargo no código** que perguntam "é do Acompanhamento?" pelo `role`
  (`mentoria/perfis.service.ts`, `admin/users.ts`, `admin/cargo.ts`, `me.controller.ts`, `MFA_ROLES` em
  `session.guard.ts`, e no web `modules.mentoria`) passam a perguntar pelo vínculo; senão quem tem as
  duas áreas some das listas do módulo.
- **`push_purge_user`:** troca `app_role() = 'HEAD'` por `area_gerencia(alvo)`.
- **Auditoria:** as ações de hoje (`admin.user.invite`, `.update`, `admin.access_request.approve`,
  `mentoria.perfil.definido`) continuam, com os nomes dos campos e a `area` (não é dado pessoal).
  Novas: `area.membro.definido`, `area.membro.removido`, `area.mestre.definido`, com `area`, `cargo` e
  `head` (cargo não é dado pessoal). A aprovação de pedido passa a gravar o id da conta criada.
- **`GET admin/acessos`** (só Diretoria; os demais recebem 404): o registro da D10, descrito abaixo.

## Registro de acessos da Diretoria (D10)

Um cartão compacto para a Diretoria ver, sem procurar, o que mudou em contas e acessos. Não é um log
novo: lê a auditoria que já existe (`audit_log`), filtrada e escrita em português.

**O que entra** (uma linha por acontecimento, mais novo primeiro):

| Acontecimento | Linha na tela (exemplo) |
|---|---|
| Conta criada por convite | "Eduarda criou a conta de Maria Souza · Acompanhamento, Operação" |
| Pedido de acesso aprovado ou recusado | "Eduarda aprovou o pedido de Manu Alves · Acompanhamento, Especialista" |
| Cargo trocado | "Ana trocou o cargo de João Lima · Comercial, Closer" |
| Head/Admin dado ou tirado; Diretoria dada ou tirada | "Você deu Admin do Acompanhamento a Eduarda" |
| Pessoa posta em uma segunda área, ou tirada | "Você adicionou Sonia a outra área · Acompanhamento, Especialista" |
| Senha redefinida ou MFA zerado por outra pessoa | "Ana redefiniu a senha de Igor" |
| Conta desativada ou reativada | "Ana desativou a conta de João Lima" |

Toda linha que cria conta ou dá cargo termina com "· Área, Cargo" (D11), com os rótulos de
`AREA_LABEL` e `CARGO_INFO` (`sh/cargos.ts`).

**O que não entra:** logins, troca da própria senha, foto e nome do perfil, e tudo de lead, venda e
mentorado. Isso continua na aba Auditoria (M11).

**Regras:**

- Só a Diretoria vê. O Head não vê o cartão (pode entrar depois, só com a área dele).
- A auditoria continua sem nome e sem e-mail gravados: o nome de quem fez e de quem sofreu a ação é
  lido da conta na hora de mostrar. Acontecimentos antigos, gravados só com o nome dos campos, aparecem
  sem o detalhe ("Ana trocou o cargo de João Lima").
- A API devolve o tipo e os dados (`tipo`, quem, sobre quem, `area`, `cargo`, `head`, quando), 20 por
  página; a frase é montada no web, como em `lib/activity-text.ts`.
- "novo" marca o que aconteceu desde a última vez que a Diretoria abriu o cartão (cookie por pessoa,
  só no caminho do Admin, no padrão de `lib/user-cookie.ts`).

```
Acessos                                                   Ver tudo
hoje 14:02   Eduarda criou a conta de Maria Souza · Acompanhamento, Operação          novo
hoje 11:40   Eduarda aprovou o pedido de Manu Alves · Acompanhamento, Especialista   novo
ontem        Ana desativou a conta de João Lima
17/11        Você deu Admin do Acompanhamento a Eduarda
17/11        Ana redefiniu a senha de Igor
```

Cinco linhas no cartão; "Ver tudo" abre a lista inteira, paginada. ("Cartão" = um quadro com título
na tela, como os do Dashboard.)

### "Entrou há X" na lista de pessoas (D12)

Ao lado de cada nome, nas duas listas de equipe, um texto pequeno com a última vez que a pessoa usou o
sistema:

```
Maria Souza     [Operação ▾]      entrou há 2 horas
Manu Alves      [Especialista ▾]  não entra há 12 dias
Carla Dias      [Escolha o perfil ▾] · falta perfil      nunca entrou
```

- Conta o **uso** do sistema, não a digitação da senha (M12). Precisão de uns 15 minutos basta.
- O dado fica guardado na conta e não some quando a pessoa sai (as linhas de `session` são apagadas no
  Sair e ao desativar). Nada de gravar a cada pedido: no máximo uma gravação por pessoa a cada 15 minutos,
  fora das tabelas que avisam o canal ao vivo (`app_revision`).
- Textos: "entrou agora", "entrou há N minutos / horas", "entrou ontem", "entrou há N dias" até 6 dias,
  "não entra há N dias" a partir de 7, "nunca entrou". Conta desativada não mostra.
- Quem vê: Diretoria (todas) e Head (as da área dele) (M13). Vem em `GET admin/users` como
  `ultimoUso` (data ou nulo) e a frase é montada no web.

## Telas

Nada de tela nova de navegação: os dois lugares que já existem ganham a mesma lista de equipe.

**1. Comercial → Admin → Usuários (`web/components/admin.tsx`)**
- Head do Comercial: como hoje, só com as contas do Comercial (as do Acompanhamento saem da lista dele).
- Diretoria: todas as contas, com filtro "Comercial | Acompanhamento | Todas" e os cargos de cada área na
  linha. Na conta, "Adicionar a outra área" (rótulo novo, a confirmar com o Gabriel) abre o campo Cargo
  só com os cargos da área que falta.
- O interruptor "Admin do Acompanhamento" e o cargo "Head" continuam aparecendo só para a Diretoria.
- Diretoria: o cartão "Acessos" (D10) no topo da aba, acima da lista.
- Em cada linha da lista, o "entrou há X" (D12), também na aba Perfis do módulo.

**2. Acompanhamento → Configurações → Perfis (`components/acompanhamento/perfis-admin.tsx`)**

```
Perfis                                              [ Convidar ]
Pedidos de acesso (2)
  Maria Souza · maria.s · pediu há 2 h     Cargo [Operação ▾]  [Aprovar] [Recusar]

Equipe
  Eduarda Lima    Acompanhamento  · Admin do Acompanhamento
  Maria Souza     [Operação ▾]                 [Redefinir senha] [Desativar]
  Manu Alves      [Especialista ▾] · também no Comercial      (senha e conta: Diretoria)
  Carla Dias      [Escolha o perfil ▾] · falta perfil
```

- Convidar: nome, usuário, e-mail e Cargo (só os do Acompanhamento); mostra a senha temporária uma vez,
  como o Admin do CRM faz hoje.
- Pedidos de acesso: só os do Acompanhamento, com o mesmo campo Cargo.
- O Admin do módulo vê o selo "Admin do Acompanhamento" dos outros, sem interruptor. A Diretoria vê o
  interruptor.
- **Sai** a nota "Conta nova: a Diretoria cria o login no Admin do CRM, já com o perfil…" (deixa de ser
  verdade).
- CSS só sob `.ac`; a tela não entra no JS de `/leads` (limite de 150 KB).

**3. Quem tem as duas áreas**
- Navega como a Diretoria navega hoje: menu do comercial + a entrada do Acompanhamento.
- `/login` leva ao comercial e `/login/acompanhamento` ao módulo (já é assim, NPAC-52).
- Nas listas de equipe aparece com o cargo de cada área.

Textos novos de tela, todos a confirmar com o Gabriel antes da fase 3: "Adicionar a outra área",
"também no Comercial" / "também no Acompanhamento", "Conta em mais de uma área: só a Diretoria redefine
a senha ou desativa", "Só a Diretoria dá o selo de Admin do Acompanhamento", o título "Acessos", "Ver
tudo", "novo", as frases da tabela do registro de acessos e os textos do "entrou há X".

### Aprovado pelo Gabriel (19/11/2026, "1A, 2A, 3A") — D13

Opções mostradas em imagem, no visual real (3 por tela). Escolhidas:

- **1A, aba Perfis do módulo:** a lista de hoje. "Convidar" no canto de cima abre uma janelinha (Nome,
  E-mail, Usuário, **Perfil**). Cada linha com "Nova senha" e "Desativar"/"Reativar" à vista e "entrou há X"
  embaixo do nome. Pedidos de acesso num quadro acima da lista. Nota embaixo: "A Diretoria é Admin
  automaticamente. Só a Diretoria dá o selo de Admin do Acompanhamento." A Diretoria vê o interruptor; o
  Admin do módulo vê o selo "Admin do Acompanhamento" como etiqueta, sem interruptor. Sua própria linha
  leva "(você)" e não tem botões.
- **2A, Admin → Usuários da Diretoria:** quadro "Acessos" no topo, largura inteira, 5 linhas (data à
  esquerda, frase, "novo" à direita), "Ver tudo" abre janelinha paginada (20 por página, "Anterior" /
  "Próxima"). Embaixo, Convidar à esquerda e Equipe à direita, como antes; o filtro "Comercial |
  Acompanhamento | Todas" fica no título da Equipe (abre em "Todas", lembrado no aparelho); "entrou há X"
  no fim da linha cinza de cada pessoa.
- **3A, textos:** todos como listados abaixo.
  - Botões "Nova senha" (não "Redefinir senha": igual ao Admin do CRM), "Desativar"/"Reativar".
  - Data do quadro: "hoje 14:02", "ontem 09:10", "17/11". Lista vazia: "Nada por aqui ainda."
  - Frases (quem fez é o nome ou "Você"; conta apagada = "uma conta apagada"): "X criou a conta de Y ·
    Área, Cargo"; "X aprovou o pedido de Y · Área, Cargo"; "X recusou um pedido de acesso · Área" (o pedido
    recusado não guarda o nome); "X trocou o cargo de Y · Área, Cargo"; "X deu Head a Y" / "X tirou Head de
    Y"; "X deu Admin do Acompanhamento a Y" / "X tirou Admin do Acompanhamento de Y"; "X adicionou Y a outra
    área · Área, Cargo" / "X tirou Y do Área"; "X deu Diretoria a Y" / "X tirou a Diretoria de Y · Área,
    Cargo"; "X redefiniu a senha de Y"; "X resetou o MFA de Y"; "X desativou a conta de Y" / "X reativou a
    conta de Y"; evento antigo sem detalhe: "X alterou a conta de Y".
  - "Entrou há X": "entrou agora", "entrou há N minutos/horas" (até 24 h), "entrou ontem", "entrou há N
    dias" (até 6), "não entra há N dias" (7 ou mais, dias de calendário de Brasília), "nunca entrou".
  - "também no Comercial" / "também no Acompanhamento" e a frase "Conta em mais de uma área: só a
    Diretoria redefine a senha ou desativa" no lugar dos botões (só aparece com conta em duas áreas).
  - "Adicionar a outra área" fica para a Fase 4.

## Fase 3B — Alcance "só a carteira"

Pedido da Eduarda (19/11, "1A, 2A, 3A", plano, Fase 3B) e desenho do Gabriel (19/11, sessão coordenadora). Código conferido
na `release/v0.19` (`3fa5b4f`, última migration `0074`). Status: aprovado (formulário, textos e respostas (a)–(e), Gabriel 19/11).

**Carteira** = as inscrições em que a pessoa é a responsável (`mentoria_inscricoes.responsavel_id`).

### O que é

Palavras do Gabriel: "Eu sou a duda e tenho ADM acompanhamento - posso dar a maria o Cargo de Acompanhamento - com alcance
a carteira e envios por exemplo"; "eu ja to pensando com o sistema pronto".

- O cargo continua **Acompanhamento** (perfil `ACOMPANHAMENTO`, sem cargo novo; D5 vale). Cada pessoa com esse cargo ganha
  um **alcance**: "Todos os mentorados" (padrão, igual a hoje) ou "Só a carteira".
- Quem escolhe: a Diretoria e o Admin do Acompanhamento, pela regra única (mudar o alcance = trocar o cargo de alguém da
  área: o Head não mexe em outro Head nem no próprio). Não dá nem tira Admin (D9).
- **Volta a "Todos os mentorados"** quando o cargo deixa de ser Acompanhamento ou a pessoa ganha o selo de Admin, e não
  volta sozinha a "Só a carteira" se o cargo voltar ou o selo sair: é a volta para o lado mais aberto, de propósito (o
  alcance só existe no cargo Acompanhamento sem o selo). A linha da pessoa na aba Perfis mostra o alcance atual.
- Com "Só a carteira" a pessoa faz tudo o que o cargo Acompanhamento faz (1A), só nos mentorados da carteira. Fora dela,
  nada: mentorado de outra pessoa é **404**, como para a Especialista.
- **Destino (não entra na 3B): extras por pessoa** (o "+ envios" do Gabriel), caixinhas de uma lista fechada no código. A
  coluna, a API e a linha "Extras" na tela nascem com o primeiro extra real, porque o formato dele ainda não se sabe. **Envios:**
  cargo próprio (D6, resposta 1B da Eduarda) ou caixinha é decisão da fase da tela Envios físicos (fase 4 do Acompanhamento):
  quem só faz envios não cabe bem em "Acompanhamento + caixinha".
- Caminhos considerados e descartados: cargo novo fixo `CARTEIRA` (repetiria nas guardas da API, na regra de responsável, na
  transferência e no push tudo o que já vale para o Acompanhamento) e permissões livres por tela e por pessoa (2–3 semanas,
  desfaz a D5, abre caminho de escalada e pesa na RLS com prod em uso).

### Na tela (desenho A, Gabriel 19/11: "Opção A"; textos "Acessos", "Carteira", "Todos os mentorados")

A primeira versão ("Alcance: Todos os mentorados / Só a carteira" e "Acompanhamento · só a carteira" nas listas) foi
reprovada pelo Gabriel: "cara n era para ser Acompanhamento - só carteira. isso ta feio, n ta profissional / Era Cargo
Acompanhamento - acessos: lista de tags que terá, uma delas nesse caso seria "Carteira"". Ficou o desenho A:

- Aba Perfis do módulo, na linha da pessoa com cargo Acompanhamento sem o selo: **"Acessos"** e duas tags de escolha única,
  **"Carteira"** e **"Todos os mentorados"** (sempre uma marcada: ✓ e o fundo de seleção dourado; a outra só a borda; clicar
  troca na hora; setas do teclado trocam). Alinhado à caixa do cargo (abaixo dela no computador; linha própria no celular).
  O mesmo campo no **Convidar** e ao **aprovar pedido de acesso** (com "Todos os mentorados" marcado). Outros cargos não
  mostram o campo.
- Nas listas (Admin → Usuários e o cartão do Mais do módulo): o selo do cargo continua "Acompanhamento"; ao lado, a tag
  neutra **"Carteira"** (só a borda), só para quem tem a carteira. Quem vê todos fica só com o selo. O nome "Acompanhamento
  da carteira" (3A da Eduarda) não vira cargo (pendência: avisar a Eduarda).
- Quadro "Acessos" da Diretoria: a frase da troca de cargo de hoje ("… · Acompanhamento, Acompanhamento") com a mesma tag ao
  lado: "Carteira" quando entra na carteira, "Todos os mentorados" quando sai dela; sem frase nova.
- Destino, sem construir: outras tags na mesma linha de "Acessos" quando houver o primeiro extra real (ex.: Envios).

| Tela, para quem tem "Só a carteira" | O que muda |
|---|---|
| Fila | Só itens da carteira, só "Minha fila" (sem o botão "Equipe") |
| Mentorados, Ficha, Plano, Reuniões, PMEs e ciclos | Só a carteira; o filtro "Responsável" não aparece |
| Cadastro de mentorado (2A) | Responsável = ela, fixo (o campo mostra o nome dela, sem trocar) |
| Configurações | O mesmo que o cargo Acompanhamento já vê |

**Continua só do Admin:** excluir e anonimizar, transferir carteira, Perfis, Importação, catálogo de PMEs, CSV com contato.

### Banco (como a regra entra)

- `area_membros.alcance` text, `TODOS` por padrão; `CARTEIRA` só com área e cargo `ACOMPANHAMENTO` (CHECK). Trocar para outro
  cargo volta a `TODOS`. Gravação só por `area_definir_membro` (ganha o parâmetro, com a versão antiga chamando a nova), com
  a regra única e auditoria (`area.membro.definido` com `alcance`).
- `mentoria_so_carteira()`: quem está logado tem alcance `CARTEIRA`. Visibilidade por RLS, nunca por filtro em JS:
  - `mentoria_ve_todas()` deixa de valer para quem tem "só a carteira".
  - A lista da 0061 (`mentoria_ids_especialista()`, ou uma `mentoria_ids_visiveis()` com nome honesto) passa a devolver a
    carteira dela. **A dica do plano serve em parte:** cobre as 12 políticas de leitura que já usam essa lista sem reescrevê-las.
    Reuniões, tarefas, metas e check-ins decidem pelo perfil e ganham `OR inscricao_id = any ((select …)::uuid[])`. Os
    catálogos (Plano modelo, PMEs, mensagens) não mudam: o perfil continua `ACOMPANHAMENTO`.
  - Funções por linha (`mentoria_ve`, `mentoria_edita`, `_reuniao`, `_acao`, `_tarefa`, `_meta`, `mentoria_midia_*`): no
    `WHEN 'ACOMPANHAMENTO'`, "e (não é só a carteira ou a inscrição está na carteira)".
  - Funções `SECURITY DEFINER` que devolvem dado de inscrição sem passar pela RLS (semáforo, `mentoria_semaforo_lote`, % do
    PME, `mentoria_fila` e o que mais aparecer na varredura): conferir uma a uma e recortar.
- Inserir inscrição com "só a carteira": só com `responsavel_id` = ela mesma (política de INSERT, não só a API).
- Responsável, transferência de carteira e o casamento do item da Fila com o perfil não mudam (o perfil é `ACOMPANHAMENTO`).
- Push da Fila endereçado "a todos do perfil" (sem responsável ativo): quem tem "só a carteira" só recebe o da carteira
  (pergunta c).
- Testes: equivalência (alcance `TODOS` = hoje, conta por conta), `rls-por-consulta`, casos novos no arquivo da regra única.

### Quando a inscrição sai da carteira (d, aprovado)

Troca de responsável ou transferência pelo Admin: na hora, a inscrição some para ela (Fila, lista, ficha = 404), com
tarefas, reuniões e metas juntas. O que ela registrou fica no histórico da inscrição, com o nome dela.

### Respostas do Gabriel (19/11)

- (a) CSV de Mentorados para quem tem "só a carteira": ✅ **só da carteira**, sem contato, como o cargo Acompanhamento (Gabriel, 19/11, "A: só da carteira").
- (b) Fila: ✅ **só "Minha fila"**, sem o botão "Equipe" (Gabriel, 19/11, "A: só Minha fila").
- (c) Push da Fila: ✅ **só dos mentorados da carteira**; o push "a todos do perfil" de mentorado de outra pessoa não chega a ela (Gabriel, 19/11, "A: só os dela").
- (d) Inscrição tirada da carteira: ✅ **some na hora**, como acima (Gabriel, 19/11, "A: some na hora").
- (e) Trocar a responsável de um mentorado da carteira: ✅ **não**; o campo "Responsável" fica só para leitura para ela (no
  banco: UPDATE de `responsavel_id` recusado para quem tem "só a carteira"). Trocam o Admin, quem tem "Todos os mentorados"
  e a Operação, como hoje (Gabriel, 19/11, "A").

## Segurança

- Invisível e inexistente → 404; a regra roda no servidor e de novo no banco.
- Redefinir senha derruba as sessões do alvo (já é assim) e o Head nunca redefine a de outro Head, da
  Diretoria ou de conta com outra área (M5).
- Auditoria sem nome nem e-mail, como hoje.
- **Recomendação fora desta spec:** com Heads criando contas, religar o MFA para Diretoria e Heads
  (`MFA_LIGADO`) e ter duas contas de Diretoria. Hoje MFA e limite de login estão desligados.

## Testes e verificação

- **Equivalência (fase 1):** para cada conta do seed (diretor, ana, ronaldo, ale, murilo, igor, sonia,
  carla, duda, operacao, manu, leo) e uma desativada, `app_role()`, `mentoria_perfil()`,
  `mentoria_admin()` e `mentoria_perfil_de()` dão o mesmo antes e depois da migration (no padrão de
  `db/test/fila-equivalencia.test.ts`). As suítes de RLS existentes passam sem edição.
- **Guardas:** `rls-por-consulta` cobre a política nova; teste-guarda de "ninguém lê `user.role`";
  `migrations.test.ts` (idx e `when`); `acompanhamento-sem-comercial` continua varrendo todas as rotas,
  agora com o caso "Acompanhamento sem Head recebe 404 em `admin/*`".
- **Regra única:** a tabela de casos roda na função pura e na SQL; inclui todas as linhas da tabela
  acima e os anti-objetivos (Head tenta dar Head, mexer em outro Head, mexer em outra área, redefinir
  senha de conta em duas áreas, tirar a última Diretoria).
- **Compatibilidade:** `update "user" set role = …`, `mentoria_definir_perfil(…)` e
  `select … from mentoria_perfis` continuam funcionando depois da fase 1.
- **API (e2e):** cada ação por Mestre, Head do Comercial e Head do Acompanhamento; 404 e 403 nos casos
  da regra; `admin.e2e`, `cargos.e2e` e `access-requests.e2e` atuais continuam passando.
- **Web (Playwright):** a Duda convida uma Operação, que entra direto no módulo; a Duda aprova um pedido
  do Acompanhamento; a Duda não vê o interruptor de Admin; a Ana (Head) não vê contas do Acompanhamento;
  a Diretoria põe a Sonia como Especialista e a Sonia vê os dois menus. Sempre pelo caminho real: login →
  onde cai → cliques no menu.
- **Capturas** 375 / 768 / 1024 / 1440 de Admin → Usuários e da aba Perfis.
- **"Entrou há X":** e2e da API: depois de um pedido autenticado, `ultimoUso` da pessoa em
  `GET admin/users` fica dentro do último minuto; dois pedidos seguidos gravam uma vez só; Sair não
  apaga; o Head só recebe o das contas da área dele. Teste de unidade das frases (agora, minutos, horas,
  ontem, dias, "não entra há", "nunca entrou").
- **Registro de acessos:** e2e da API: cada ação da tabela gera uma linha em `GET admin/acessos`, com
  tipo, área e cargo; login e ação de lead não aparecem; Head e demais cargos recebem 404; nenhum nome
  ou e-mail gravado em `audit_log`. Playwright: a `duda` cria uma conta e o `diretor` vê a linha com
  "novo" no cartão; ao reabrir, sem "novo".
- **Desempenho:** `pnpm perf:seed` + `scripts/perf/medir.sh` em `/api/leads` e no Dashboard do SDR:
  mediana dentro de ±10% do número de `docs/plans/desempenho.md`.
- **Antes de prod (cada fase):** roteiro completo no ITODEV, um login por cargo; contagem de contas por
  cargo antes e depois da migration (SQL de leitura pelo Cubeship). Prod só com o sim do Gabriel.

## O que fica para quem constrói

- Nome exato de gatilhos, índices e da guarda nova; como evitar o laço entre os dois gatilhos de
  compatibilidade.
- Se a lista de equipe do módulo reaproveita componentes de `admin.tsx` ou ganha componente próprio
  (critério: não pesar em `/leads` e seguir o visual do módulo).
- Formato do arquivo de casos da regra única.
- Número da migration: a próxima livre depois da `0071` (renumerar se a release andar; regra do `when`).

## Ao terminar cada fase

Atualizar a seção "Papéis e acesso" do `CLAUDE.md` no mesmo PR (fonte do cargo, regra única, quem cria
conta) e o status da tarefa em `docs/plans/acesso-por-area.md`.
