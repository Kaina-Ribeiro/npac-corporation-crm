# Spec: cargos em um passo

Pedido do Gabriel, 11/11/2026. Modelo aprovado na conversa ("Aprovo, escreve"); nome das caixas
escolhido por ele: **"Atua como SDR" / "Atua como Closer"**. Ele liberou mexer no Admin do CRM
(exceção ao D2 do Acompanhamento v2, "CRM intocado").

## Objetivo

Dar acesso a uma pessoa vira **uma decisão em uma tela**: escolher o **Cargo**. Sucesso:

- Conta nova do Acompanhamento já nasce com perfil; ninguém novo cai em "Peça ao Admin".
- "Prospecta" e "Fecha" somem das telas. Combinação sem sentido não existe mais (nem pela API, nem
  no banco).
- Convidar, aprovar pedido de acesso e trocar o cargo de alguém usam o mesmo campo e dão o mesmo
  resultado.

## Problemas de hoje (conferidos no código, 11/11)

- Cargo Acompanhamento em `Admin` (CRM) e perfil em `Acompanhamento → Configurações → Perfis`: dois
  passos, duas telas. Quem esquece o segundo deixa a pessoa em "Peça ao Admin".
- Para SDR e Closer as caixas só repetem o cargo. SDR sem "Prospecta" não cadastra lead; Closer com
  "Prospecta" vira dono de lead sem poder criar nenhum.
- Aprovar pedido como Head marca as duas caixas (`access-requests.tsx`: `role !== 'CLOSER'` /
  `role !== 'SDR'`); convidar um Head não marca nenhuma.
- Quatro palavras para a mesma ideia: "Papel" (Convidar), "cargo" (mensagens), "perfil" (módulo),
  e "Perfil" ainda é P0/P1/P2 do lead.
- "Admin" é a tela do CRM, o selo do módulo e a pessoa de "Peça ao Admin".

## Decisões

| # | Decisão | Origem |
|---|---|---|
| C1 | A palavra na tela é **Cargo**. "Papel" some. Dentro do módulo a aba continua **Perfis** (texto do PDF da Eduarda) | Gabriel, 11/11 |
| C2 | Um campo só, agrupado por área (tabela abaixo). Escolher um cargo do Acompanhamento grava cargo + perfil juntos | Gabriel, 11/11 |
| C3 | "Prospecta"/"Fecha" viram **"Atua como SDR"** / **"Atua como Closer"** e só aparecem para **Head e Diretoria** | Gabriel, 11/11 |
| C4 | SDR, Closer e Acompanhamento não têm caixa: o sistema define. API e banco recusam o resto | Gabriel, 11/11 |
| C5 | O selo do módulo aparece sempre com o nome inteiro: **"Admin do Acompanhamento"** | Gabriel, 11/11 |
| C6 | Cargo Acompanhamento **sem perfil é recusado** na API (convite, aprovação, troca). Contas antigas sem perfil ficam como estão, com selo "falta perfil" no Admin | Gabriel, 11/11 |
| C7 | A aba Perfis do módulo fica (a Duda é Admin do módulo e não entra no Admin do CRM), mas só **troca** o perfil de quem já está na equipe; não remove | Gabriel, 11/11 |
| C8 | Dicas de cada cargo entram agora, no próprio campo. **Glossário** (página) é passo separado, fora deste spec | Suposição (ele não respondeu; avisado) |
| C9 | Modelo de dados não muda: `user.role`, `can_prospect`, `can_close`, `mentoria_perfis`. Muda a regra de gravação e a tela | Desenho |

## O campo Cargo

| Área (grupo) | Cargo na tela | `role` | `perfil` | `can_prospect` / `can_close` | Dica (texto da tela) |
|---|---|---|---|---|---|
| Comercial | SDR | `SDR` | — | sempre `true` / `false` | Cadastra e trabalha os próprios leads e agenda reuniões. Não vê valores de venda. |
| Comercial | Closer | `CLOSER` | — | sempre `false` / `true` | Faz as reuniões e registra vendas e pagamentos. |
| Comercial | Head | `HEAD` | — | caixas | Vê e gerencia todo o comercial. Administra SDRs e Closers. |
| Comercial | Diretoria | `DIRETOR` | — | caixas | Tudo do Head. Dá cargos de liderança e é Admin do Acompanhamento. |
| Acompanhamento | Acompanhamento | `ACOMPANHAMENTO` | `ACOMPANHAMENTO` | sempre `false` / `false` | Cuida da jornada de todos os mentorados. |
| Acompanhamento | Operação | `ACOMPANHAMENTO` | `OPERACAO` | idem | Cadastra inscrições, onboarding, Caixa e agenda de reuniões. |
| Acompanhamento | Especialista | `ACOMPANHAMENTO` | `ESPECIALISTA` | idem | Vê só os mentorados das reuniões que conduz. |
| Acompanhamento | Mentor | `ACOMPANHAMENTO` | `MENTOR` | idem | Aparece como condutor das reuniões. Ainda sem acesso: o painel chega depois. |

- **Caixas (só Head e Diretoria):** "Atua como SDR" (`can_prospect`: pode ser dono de leads) e
  "Atua como Closer" (`can_close`: aparece nas listas de closer). Dica de cada uma ao lado.
- **Interruptor (só cargos do Acompanhamento):** "Admin do Acompanhamento" (`mentoria_perfis.admin`).
  A Diretoria já é Admin sem linha.
- Quem pode escolher o quê não muda: Head só dá SDR e Closer; liderança e Acompanhamento só a
  Diretoria (`guardLeadership`).

Fonte única dos rótulos, dicas e do mapa cargo ↔ (`role`, `perfil`): `packages/shared/src/cargos.ts`
(sem zod, legível no cliente). Admin, pedido de acesso, Mais e Equipe leem dali.

## Regras de gravação

Um resolvedor só (`apps/api/src/admin/cargo.ts`), usado por convite, aprovação de pedido e PATCH:

1. `SDR` → `can_prospect = true`, `can_close = false`. `CLOSER` → o inverso. `ACOMPANHAMENTO` →
   os dois `false`. Valor contrário no corpo: **400** "Esse cargo não aceita essa opção".
2. `HEAD` / `DIRETOR` → usa o que veio; sem vir, **mantém** o que a pessoa tinha (SDR promovido a
   Head continua "Atua como SDR" e com os leads). Conta nova sem informar: `false` / `false`.
3. `ACOMPANHAMENTO` exige `perfil` (**400** "Escolha o perfil do Acompanhamento"); `moduloAdmin`
   opcional (padrão `false`). `perfil`/`moduloAdmin` com outro cargo: 400.
4. Cargo + caixas + perfil gravam **na mesma transação**. O perfil vai por
   `mentoria_definir_perfil(alvo, perfil, admin)` com `app.user_id` = quem está fazendo (a função
   exige `mentoria_admin()`; só a Diretoria dá esse cargo, então passa).
5. Sair do cargo Acompanhamento apaga a linha do perfil (`mentoria_definir_perfil(alvo, null, false)`).
6. PATCH só de `perfil`/`moduloAdmin` em quem já é Acompanhamento: permitido (Diretoria).
7. Auditoria: `admin.user.invite` / `admin.user.update` / `admin.access_request.approve` com os
   **nomes** dos campos (`role`, `perfil`, `moduloAdmin`, `canProspect`, `canClose`), e
   `mentoria.perfil.definido` como hoje. Sem valores pessoais.
8. Trocar para cargo que não atua como SDR com leads abertos: **não bloqueia** (a liderança vê os
   leads). A tela pede confirmação: "Fulano tem N leads. Depois, passe em 'Passar leads para…'".
   O botão "Passar leads para…" aparece sempre que a pessoa tem leads.

### API

- `POST /admin/users`, `PATCH /admin/users/:id`, `POST /admin/access-requests/:id/approve`: aceitam
  `role`, `perfil?`, `moduloAdmin?`, `canProspect?`, `canClose?` (schema Zod compartilhado em
  `sh/schemas/account.ts`), sempre pelo resolvedor.
- `GET /admin/users`: cada pessoa do Acompanhamento vem com `perfil` e `moduloAdmin` **quando quem
  pede é a Diretoria** (lido com `withUser`; a RLS de `mentoria_perfis` só deixa o Admin do módulo
  ler os outros). Para o Head vem `null` e a etiqueta fica "Acompanhamento".
- `PUT /mentoria/perfis`: `perfil` deixa de aceitar `null` (400). A função do banco continua
  aceitando `null`, usada pela regra 5.
- `POST /leads`: o 403 "Seu usuário não prospecta" fica inalcançável (SDR sempre atua; Closer não
  tem `lead:create`); remover o ramo e o teste dele.

### Banco (migration nova)

1. Normaliza: `SDR` → `t/f`, `CLOSER` → `f/t`, `ACOMPANHAMENTO` → `f/f`.
2. `CHECK` em `"user"`: SDR ⇒ `can_prospect AND NOT can_close`; CLOSER ⇒ o inverso;
   ACOMPANHAMENTO ⇒ nenhum; HEAD/DIRETOR livres. Comparar o cargo como texto.
3. Seeds e testes que criam SDR/Closer com outra combinação: ajustar.

**Número da migration:** a última no main é `0048`. A `feat/NPAC-43-parte-3-plano` (worktree, ainda
não mergeada) pode usar `0049`: conferir; quem entrar depois renumera e refaz `when` (regra do
CLAUDE.md, teste "idx e `when` crescem juntos").

**Produção (a conferir antes do deploy, não agora):** contar quem a normalização mudaria:
`select role, can_prospect, can_close, count(*) from "user" group by 1,2,3`. No dev (11/11) não há
nenhum caso: 5 SDR `t/f`, 3 Closer `f/t`, 1 Acompanhamento `f/f`. Se houver SDR que também fecha em
produção, avisar o Gabriel antes de aplicar.

## Telas

**Admin → Usuários (`web/components/admin.tsx`)**

- Convidar: rótulo "Papel" → **"Cargo"**; `<select>` com `<optgroup>` "Comercial" e
  "Acompanhamento" (Head vê só SDR e Closer, sem grupo do Acompanhamento). Abaixo do campo, a dica
  do cargo escolhido. Caixas "Atua como…" só com Head/Diretoria escolhido; interruptor "Admin do
  Acompanhamento" só com cargo do Acompanhamento.
- Linha da Equipe: mesmas regras. SDR, Closer e Acompanhamento sem caixa nenhuma. Etiqueta mostra
  o cargo real ("Operação", "Especialista"…, verde como hoje) e "Admin do Acompanhamento" quando
  tiver o selo. Conta antiga sem perfil: selo **"falta perfil"** e o campo pede a escolha.
- Confirmações: dar liderança (como hoje), dar cargo do Acompanhamento ("lê dados sensíveis de
  mentorados"), e a da regra 8.
- Mensagens de sucesso: "Fulano agora é Operação", "Ana agora atua como SDR", "…não atua mais como
  Closer".

**Pedidos de acesso (`web/components/access-requests.tsx`)**: mesmo campo e mesmas regras; some o
padrão que marcava as duas caixas.

**Mais (`web/app/(app)/mais/page.tsx`) e Equipe (`(comercial)/equipe/page.tsx`)**: "Prospecta" /
"Fecha" → "Atua como SDR" / "Atua como Closer", só em Head e Diretoria (SDR e Closer mostram só o cargo).

**Acompanhamento → Configurações → Perfis (`components/acompanhamento/perfis-admin.tsx`)**

- Lista igual; a opção "Sem perfil" só existe para conta antiga sem perfil (como "Escolha o
  perfil", desabilitada). Interruptor com `aria-label` "Admin do Acompanhamento para <nome>".
- Nota: "Conta nova: a Diretoria cria o login no Admin do CRM, já com o perfil. Aqui você troca o
  perfil de quem já está na equipe."

**Tela "Peça ao Admin" (`components/acompanhamento/sem-acesso.tsx`)**: fica como rede de segurança
para conta antiga. Texto de apoio: "Seu login funciona, mas falta o perfil no Acompanhamento. A
Diretoria ou um Admin do Acompanhamento define isso."

**Dropdown:** segue o padrão do CRM (`appearance: base-select` em `globals.css`); conferir o
`<optgroup>` com esse visual e no Safari (visual do sistema).

## Testes e verificação

- `@npac/shared`: mapa cargo ↔ (`role`, `perfil`) e o resolvedor de caixas.
- `@npac/api` (e2e): convite, aprovação e PATCH de cada cargo; Acompanhamento sem perfil → 400;
  caixa contrária → 400; promover SDR a Head mantém `can_prospect`; sair do Acompanhamento apaga o
  perfil; Head continua 403 para liderança e Acompanhamento; `GET /admin/users` sem perfil para Head;
  `PUT /mentoria/perfis` com `null` → 400. O teste `acompanhamento-sem-comercial` continua passando.
- `@npac/db`: `CHECK` recusa as combinações erradas; migration normaliza; "idx e `when` crescem juntos".
- `@npac/web` (Playwright, `e2e/admin.spec.ts` e o do módulo): convidar Operação e entrar direto no
  módulo, sem passar por "Peça ao Admin"; caixas só em Head/Diretoria; aprovar pedido como Head sem
  caixa marcada; Duda troca um perfil na aba Perfis.
- Capturas 375 / 768 / 1024 / 1440 do Admin (Convidar, Equipe, pedido de acesso) e da aba Perfis.
- Ao fechar: `pnpm lint && pnpm typecheck` e as suítes de `shared`, `db`, `api`; JS de `/leads`
  continua < 150 KB.

## Fora deste spec

- Página **Glossário** (Mais + Ctrl+K) com os mesmos textos de `cargos.ts`: passo seguinte.
- Vazamento do `/api/team` para o cargo Acompanhamento (já anotado) e religar MFA / limite de login.
- Renomear enums, tabelas ou as colunas `can_prospect` / `can_close`.

## Ao terminar

Atualizar o `CLAUDE.md` (seção "Papéis e acesso": cargo em um passo, caixas só da liderança, `CHECK`)
e o `docs/spec.md` §1 (tabela "Prospecta?" / "Faz reunião").
