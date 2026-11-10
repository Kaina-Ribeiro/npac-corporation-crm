# Acompanhamento v2 — Fase 1 (design)

> Status: **v5, 10/11/2026, aguardando aprovação do Gabriel** (revisão de fluxos: §13; respostas da Eduarda: D14, D15, D17) · ticket NPAC-43
> Fonte: PDF da Eduarda "Sistema de Gestão dos Mentorados — Especificação" (07/11/2026), texto em
> `docs/acompanhamento/especificacao-eduarda-2026-11-07.txt`. Spec > este documento > gosto.
> Nenhuma dúvida em aberto (§14).

## 0. Decisões (não revisitar)

| # | Decisão | Quem / quando |
|---|---|---|
| D1 | O módulo Acompanhamento atual (Dashboard, Linha do tempo, RDV, Backup) **é apagado e refeito**: telas, API, lógica e tabelas `mentoria_*`. **Nenhum dado** dele é migrado (código útil é reaproveitado, §2) | Gabriel, 10/11 |
| D2 | **CRM intocado**: cargos, admin, menus comerciais, leads, vendas e dados. Exceções: itens do Acompanhamento em `web/components/shell/nav-menu.tsx` e o push (D12) | Gabriel, 10/11 |
| D3 | **Perfil dentro do módulo** (`mentoria_perfis`), pensado como "acesso por módulo". Login continua com o cargo `ACOMPANHAMENTO` (ou `DIRETOR`) | Gabriel, 10/11 |
| D4 | Logins na Fase 1: Duda (Acompanhamento), Operação, Manu (Especialista). Leo (Mentor) tem conta só para aparecer como condutor de IDR, sem acesso até o painel (D14). Mentorado só na Fase 3 | Gabriel, 10/11 |
| D5 | Origem da inscrição ("compra confirmada"): **TODO**. Fase 1 = cadastro manual + importação | Gabriel, 10/11 |
| D6 | NPS, nível/selos, desafios mensais: **fast follow** (fora da Fase 1) | Gabriel, 10/11 |
| D7 | Reunião registra o combinado **em texto**; tarefas com "fiz" e cobrança chegam na Fase 2 (1A) | Gabriel, 10/11 |
| D8 | As 11 abas aparecem; as 5 fora da Fase 1 mostram "em breve" (2B) | Gabriel, 10/11 |
| D9 | WhatsApp: botão **copia** a mensagem-modelo e abre a conversa; texto nunca no link (3A) | Gabriel, 10/11 |
| D10 | Avisos na Fila do dia **e push** no celular (4B) | Gabriel, 10/11 |
| D11 | **Importar o `.json` do gerenciador atual da Eduarda** (artefato com Dashboard, Linha do tempo, RDV) | Gabriel, 10/11 |
| D12 | **Push liberado com 2 mudanças no CRM**: `@AllRoles()` no controller `push` (`api/push/push.module.ts`) e o link "Avisos neste aparelho" (`/conta/avisos`) também para o cargo Acompanhamento (`web/app/(app)/mais/page.tsx` e a própria página, se tiver trava). Nada muda para o comercial | Gabriel, 10/11 (G1) |
| D13 | **Duda é Admin.** Admin é um **selo sobre o perfil**, não um perfil à parte: Duda = ACOMPANHAMENTO + Admin (continua recebendo a Fila e as ações do Acompanhamento); Diretoria = Admin sem perfil operacional | Gabriel, 10/11 (G2) |
| D14 | Controle mensal só para 6M (4A) · Leo sem acesso até o painel ficar pronto (5C) · importados todos ATIVO (6B) · são **mentorias** RDV, 2M e 6M, não planos (7) · Prova das 10 Habilidades e 4 pilares **por pessoa** (8A) · cartões e milhas no início do 7º PME por padrão, mas variável (2A + áudio) | Eduarda, 10/11 |
| D15 | **Pausado existe e repõe o prazo**: o término anda pelo tempo parado (1C) · alerta da Caixa **20 dias depois do envio** (2A) · 2M e 6M passam pelas 6 etapas como regra, mas pode variar (3) | Eduarda, 10/11 |
| D16 | Planilha da equipe entra como segunda fonte da importação (§7); CPF nunca é importado; variantes guardadas em texto; quem cancelou entra CANCELADO | Gabriel e Eduarda, 10/11 |
| D17 | **2M tem acompanhamento mês a mês já na Fase 1 (1A)** · controle mensal vale para todas as mentorias (2C) · 2M e 6M usam as 6 etapas, pulando o que não se aplica (3B). Cadência de 2M, 6M e pulseiras lida da planilha (§5) | Eduarda, 10/11 |
| D18 | **Fila do dia: agenda de hoje no topo, depois lista por urgência (Atrasados, Hoje) e painel do item ao lado.** Tipo vira filtro, com "Minha fila / Equipe". Desenho em `docs/acompanhamento/prototipo/canvas/` | Gabriel, 10/11 |

## 1. Objetivo e sucesso

Tirar o dia a dia da equipe do Miro e das planilhas (objetivo da Fase 1 no PDF).

Pronto quando:
- A Duda abre a **Fila do dia** e vê tudo o que vence hoje, e cada item sai da Fila quando alguém o
  conclui (nenhum item fica preso sem ter como marcar feito).
- Cada mentorado tem **uma ficha** (individual ou casal) com inscrição, pessoas, momento inicial,
  onboarding, plano dos 12 meses, reuniões, contatos e histórico.
- A IDR realizada **inicia os 12 meses** e gera as 12 ações com a data certa (fuso de Brasília).
- A carteira atual entra pela **importação** sem redigitar e **sem inundar** a Fila.
- Cada perfil vê só o que a matriz da §3 permite.

## 2. Limites com o CRM

- Acesso ao módulo como hoje: `MentoriaGuard` (cargo `DIRETOR`/`ACOMPANHAMENTO`, 404 aos demais),
  `@AllRoles()`, `RequiresMfa()` (vale com `MFA_LIGADO`). `me.modules.mentoria` (calculado pelo cargo
  em `me.controller.ts`) não muda.
- **Dentro** do módulo, o perfil decide o resto. Cargo `ACOMPANHAMENTO` sem perfil → tela "Peça ao
  Admin para definir seu perfil" (API: 404 em tudo menos `GET mentoria/eu`).
- Diretoria é **Admin automático** (sem linha em `mentoria_perfis`).
- **Conta nova** (ex.: segunda pessoa de Operação): a liderança do CRM cria o login com cargo
  Acompanhamento (fluxo atual do Admin ou do pedido de acesso); depois um Admin do módulo define o
  perfil. O módulo não cria logins.
- Reaproveitado (adaptado): `mentoria-crypto.ts`, `media-store.ts`, `media-sniff.ts`,
  `media-worker.ts`, `mentoria.guard.ts`, `cursor.ts`, `field-queue.ts`, `dedupe.ts`/`normalizar.ts`,
  `legado.ts` (leitura do formato antigo), `api/common/csv.ts` (só uso).
- Pontos compartilhados que **não** podem mudar de forma (§13 T1–T3): regex de limite de corpo da
  importação em `app.setup.ts`, export `seedMentoria` usado por `seed-cli.ts`, import do
  `MentoriaModule` em `app.module.ts`.
- Push (D12): hoje o controller `push` não tem `@AllRoles()` (cargo Acompanhamento recebe 404 ao se
  inscrever) e o link "Avisos neste aparelho" só aparece para o comercial. A parte 5 abre os dois ao
  cargo Acompanhamento; o teste `acompanhamento-sem-comercial` passa a esperar as rotas `push/*` como
  liberadas. O módulo lê `push_subscriptions` e usa `PushService`/`PUSH_SENDER`.
- Dupla função (ex.: SDR + Operação) fica para depois: exigiria mudar `me.controller.ts` e o guard.

## 3. Perfis e acesso (Fase 1)

| Perfil | Vê | Edita |
|---|---|---|
| Selo `admin` (Diretoria automático; Duda, D13; outros que um Admin indicar) — soma-se ao perfil | Tudo | Tudo, inclusive perfis, plano-modelo, mensagens-modelo, importação, destravar momento inicial, excluir inscrição, transferir carteira |
| `ACOMPANHAMENTO` (Duda) | Todos os mentorados | Inscrição, pessoas, endereço, momento inicial, onboarding, plano, reuniões, contatos, anotações |
| `OPERACAO` | Todos os mentorados | Cadastro de inscrição (com pessoas e contatos), endereço, onboarding, Caixa, agenda de reuniões (criar, confirmar, link, remarcar, excluir agendada), registro de IDR conduzida pelo Leo, contatos, anotações, itens da Fila do próprio perfil |
| `ESPECIALISTA` (Manu) | Só inscrições com alguma reunião conduzida por ela; as demais dão **404** | As próprias reuniões, as ações do plano com responsável Especialista (mês 5, "posicionamento entregue") e anotações nessas inscrições |
| `MENTOR` (Leo) | **Nada** até o painel ficar pronto (D14): tela "Seu painel chega em breve", API 404 | Nada. A conta existe para ele aparecer como **condutor** de IDR; quem registra é Duda ou Operação |

Banco (SQL manual, revisado à parte):
- `mentoria_perfil()` → perfil operacional do `app_user_id()` (linha de `mentoria_perfis`, exigindo
  cargo cru `ACOMPANHAMENTO` ativo; `DIRETOR` → nulo). `mentoria_admin()` → `DIRETOR` ativo ou
  `admin = true`. Substituem `mentoria_pode()`.
- `mentoria_ve(inscricao_id)` → admin, ou perfil ∈ {ACOMPANHAMENTO, OPERACAO}, ou
  (ESPECIALISTA e existe reunião conduzida por ela na inscrição).
- Nas policies e na API, "ADMIN" nesta spec quer dizer `mentoria_admin()`.
- **Condutor de reunião** pode ser qualquer usuário ativo do sistema, escolhido pelo nome (a planilha
  mostra reuniões feitas por Sônia e Ana, que têm cargo comercial). Sem perfil, ele não entra no
  módulo: quem registra é Duda ou Operação. O CRM não muda.
- As duas são `SECURITY DEFINER` com dono `npac_owner`, que tem BYPASSRLS (exigido em
  `0003_rls_hardening.sql`): a policy de `reunioes` pode chamar `mentoria_ve` sem recursão.
- Policies por tabela: SELECT por `mentoria_ve`; INSERT/UPDATE com `WITH CHECK` pela matriz.
  `npac_app` sem DELETE: exclusão só por funções `SECURITY DEFINER`.
- Invisível = inexistente = 404 (regra do CRM).

## 4. Dados da Fase 1

Prefixo `mentoria_`, `version` para PATCH (409 `VERSION_CONFLICT`, ver §13 T5), `criado_por`,
`criado_em`, `atualizado_em`. Visibilidade ao mentorado (Fase 3): `visivel_ao_mentorado` por
registro; em `reunioes`, por campo, fixo pela tabela do PDF. Texto sensível cifrado com AAD
(`MentoriaCrypto`). Dinheiro em centavos. Datas de calendário em `date` no fuso de Brasília.

| Tabela | Campos principais |
|---|---|
| `perfis` | `user_id` (PK), `perfil` (ACOMPANHAMENTO, OPERACAO, ESPECIALISTA, MENTOR), `admin` (bool), quem/quando. Diretoria não precisa de linha |
| `inscricoes` | `tipo` (INDIVIDUAL, CASAL), `mentoria` (RDV, 2M, 6M; é o campo "Plano" do PDF, D14), `mentoria_variante` (texto curto: "2 encontros", "sem cronograma", "+1 botão", "novo formato"...), `data_compra` (+ `data_compra_aproximada` quando a origem só tinha mês), `data_idr` (nulo até a IDR), `inicio_jornada` (base de todo o calendário; RDV = IDR; 2M/6M = IDR, ou o dia em que o onboarding fechou, ou a data de início importada), `termino_previsto` (**guardado**; início + 12 meses, editável; pausa e renovação mudam), `valor_centavos`, `forma_pagamento` (texto curto), `status_financeiro` (EM_DIA, EM_ATRASO, QUITADO), `status` (ONBOARDING, ATIVO, PAUSADO, CANCELADO, CONCLUIDO, RENOVADO), `responsavel_id`, `origem` (NACAO_MILIONARIA, CLUBE_DA_RIQUEZA, INSTAGRAM, INDICACAO, nulo), `link_pasta`, `link_grupo` (convite do grupo individual do WhatsApp), `pme1_enviado_em`, `erros_pme1_concluidos_em` (fora do travamento do momento inicial), `foto_familia_midia_id`, `importada` |
| `pessoas` | `inscricao_id`, `ordem` (1 ou 2; 2 só em CASAL), nome, apelido, `foto_midia_id`, nascimento, cidade, UF, WhatsApp (cifrado + índice cego), e-mail (cifrado + índice cego), Instagram, profissão, `ocupacao` (EMPREGADO, AUTONOMO, EMPRESARIO), filhos (quantidade, idades), familiaridade com tecnologia (BAIXA, MEDIA, ALTA), melhor horário, canal preferido, tamanho da pulseira |
| `enderecos` | `inscricao_id`, endereço (cifrado), CEP, `origem` (FORMULARIO_CAIXA, MANUAL) |
| `momento_inicial` | `inscricao_id` (PK), data, recebe/mês, custo mensal, tem dívidas, valor das dívidas, guardado (centavos), dor, sonho, meta de 12 meses (cifrados), `travado_em`/`travado_por` |
| `avaliacoes` | `pessoa_id`, `tipo` (PROVA_10_HABILIDADES, PILARES), `momento` (INICIAL na Fase 1; mês 4, mês 8 e final depois), data, notas fé/saúde/dinheiro/relacionamentos (0–10) ou resultado da Prova. **Uma por pessoa**, também no casal (D14). A INICIAL trava junto com o momento inicial |
| `pausas` | `inscricao_id`, `inicio`, `fim` (nulo = pausa em curso, **uma aberta por inscrição**), `status_anterior`, motivo (cifrado), quem pausou/retomou |
| `onboarding_etapas` | `inscricao_id`, `etapa` (BOAS_VINDAS, GRUPOS, AQUECIMENTO, PME_AQUECIMENTO, CAIXA, IDR), `status` (PENDENTE, ENVIADA, CONCLUIDA, DISPENSADA, ANTERIOR_AO_SISTEMA), `enviada_em`, `concluida_em` + campos da etapa (data do grupo, formulário preenchido, grupos Avisos/Clube/Nação, aulas concluídas e data, PME de aquecimento enviado/concluído). **CAIXA e IDR são derivadas** (só leitura): CAIXA segue o envio físico (ENVIADO → ENVIADA, ENTREGUE → CONCLUIDA); IDR segue a reunião de IDR; a única escrita manual nelas é DISPENSADA (§5) |
| `envios_fisicos` | `inscricao_id`, `tipo` (CAIXA, PRESENTE_FAMILIA, KIT, CERTIFICADO), enviado em, rastreio, entregue em, `status` (PREPARANDO, ENVIADO, ENTREGUE). Fase 1 usa só CAIXA |
| `plano_modelo` | `mentoria` (RDV, 2M, 6M), `mes` (1 em diante), `reuniao_tipo` (nulo se a ação não for reunião), foco, ação, `itens` (passos da coluna "registro no sistema", ex.: mês 11 = foto recebida, presente produzido, enviado, entregue), `responsavel_perfil`, `gatilho` (INICIO_MES, FIM_PME, FLEXIVEL), `dias_para_executar`, `segue_calendario`, ativo. Seed RDV = as 12 linhas do PDF; mês 7 (cartões e milhas) = FLEXIVEL (Eduarda, 10/11). Seed 2M e 6M = cadência da §5 |
| `acoes` | `inscricao_id`, `plano_modelo_id` (**único por inscrição**), mês, `data_prevista`, `responsavel_perfil`, `responsavel_id` (nulo = qualquer pessoa do perfil), `status` (PENDENTE, FEITA; "atrasada" é calculado), `itens_feitos`, `anterior_ao_sistema` (bool), feita em/por, evidência (link ou mídia), observação (cifrada) |
| `reunioes` | `inscricao_id`, `tipo` (IDR, ACOMP_2PME, POSICIONAMENTO, MENTORADO_EXPERIENTE, CARTOES_MILHAS, MENSAL_6M, TRIMESTRAL_2M, ACOMP_EMERGENCIA, RENOVACAO), `conduzida_por` (usuário; nulo só em MENTORADO_EXPERIENTE), `condutor_inscricao_id` (o mentorado experiente, em MENTORADO_EXPERIENTE), início (timestamptz), duração, `plataforma` (ZOOM, MEET), link, `status` (AGENDADA, CONFIRMADA, LINK_ENVIADO, REALIZADA, FALTOU, REMARCADA), `remarcada_para_id`, resumo, metas definidas/ajustadas, combinado da semana, o que cobrar na próxima, trava, anotação interna (cifrados), humor 1–5, interesse em renovar (só RENOVACAO) |
| `contatos` | `inscricao_id`, feito por, quando, `canal` (WHATSAPP, LIGACAO, EMAIL, REUNIAO, OUTRO), motivo, respondeu, tempo de resposta (min), observação (cifrada) |
| `anotacoes` | `inscricao_id`, autor, texto (cifrado), quando. Append-only |
| `mensagens_modelo` | nome, `momento` (BOAS_VINDAS, PASSO_1, PASSO_2, PASSO_3, LEMBRETE_IDR, EVENTO, OUTRO), texto individual, texto casal, canal. Marcadores `{nome}` / `{nomes}` |
| `fila_feitos` | `chave` (PK: tipo do item + alvo + data, ex. `agenda-mes:2026-12`), feito por, quando. Conclui itens da Fila que não têm estado próprio |
| `historico` | `inscricao_id`, ator, quando, tipo, **nomes** dos campos. Nunca valores. Append-only |
| `legado` | `inscricao_id` (PK), dados do gerenciador antigo que só têm tela nas fases 2–4 (status de engajamento, antes/depois, eventos, conquistas, quadros, endereços de mídia antiga, valores que não viraram número), JSON cifrado, importado em |
| `midia`, `midia_exclusao` | Recriadas (arquivo fora do banco em `MEDIA_DIR`, só o endereço no registro, fila de exclusão) |
| `avisos_enviados` | chave do aviso (PK), enviado em. Push uma vez só |

Regras:
- **Mês da jornada** = calculado de `inicio_jornada` e hoje (fuso de Brasília), **descontando os dias pausados**, com **uma** implementação
  (SQL) e testes de fim de mês (IDR em 31/01). Depois do mês 12 mostra "jornada concluída"; mudar o
  status para CONCLUIDO/RENOVADO é manual.
- **Momento inicial travado** ao ser salvo como concluído: gatilho bloqueia UPDATE; só
  `mentoria_destravar_momento()` (ADMIN) libera, com histórico. Importado com campo faltando nasce
  destravado.
- **Índice cego** de WhatsApp/e-mail: HMAC com chave derivada de `MENTORADO_ENCRYPTION_KEY`
  (contexto próprio). Telefone normalizado para E.164 BR; e-mail em minúsculas antes do HMAC.

## 5. Regras automáticas da Fase 1

A Fila é **calculada na leitura** (SQL), sem job nem polling. Um item sai quando o estado que o gerou
muda (etapa enviada, reunião criada, ação feita) ou, se não houver estado, por `fila_feitos`. O push
usa **um único timer** para o próximo aviso (padrão `ReminderScheduler`, relógio injetável
`MENTORIA_CLOCK`), rearmado ao subir a API e depois de cada escrita que muda datas. Texto do push
**sem dado pessoal**: "Acompanhamento: novos itens na Fila do dia". "Hoje" e "8h" são de Brasília.

Só entram inscrições com status ONBOARDING ou ATIVO: PAUSADO some da Fila e do push (D15).

| Gatilho | Item / efeito | Fila de quem | Sai quando | Push |
|---|---|---|---|---|
| Inscrição cadastrada (não importada, qualquer mentoria, D15) | Cria as 6 etapas; "criar grupo e enviar boas-vindas" (individual/casal) | Operação | Etapa BOAS_VINDAS enviada | — |
| Etapa de mensagem (1→4) PENDENTE com a anterior concluída há mais de 3 dias | "Equipe devendo o próximo passo" | Operação | Etapa enviada | Sim, 1x |
| Passo curto (BOAS_VINDAS, GRUPOS, AQUECIMENTO) ENVIADO há mais de 3 dias sem conclusão | "Parado há N dias" | Operação | Etapa concluída | Sim, 1x |
| Caixa enviada há **mais de 20 dias** sem entrega (o PME de aquecimento corre junto e não alerta sozinho) (D15) | "Caixa não recebida há N dias" | Operação | Caixa ENTREGUE | Sim, 1x |
| Formulário preenchido e Caixa ainda não enviada | "Enviar a Caixa"; depois de 3 dias vira alerta | Operação | Envio ENVIADO | Sim, 1x ao virar alerta |
| Caixa ENTREGUE ou dispensada, etapa IDR não dispensada e nenhuma IDR em aberto (futura e AGENDADA/CONFIRMADA/LINK_ENVIADO) | "Agendar a IDR" (volta após FALTOU ou REMARCADA sem nova) | Operação | IDR em aberto criada | — |
| Dia da IDR, 8h | "Lembrete de manhã ao mentorado" (mensagem LEMBRETE_IDR) | Operação | `fila_feitos` | Sim |
| Dia da IDR, 30 min antes | "Enviar o link" | Operação + quem conduz, se for Duda | Reunião LINK_ENVIADO | Sim |
| IDR REALIZADA | Na mesma transação: `data_idr` = `inicio_jornada` = **data de Brasília** do início, status ATIVO, ações do plano da mentoria, item "enviar o 1º PME". **Idempotente**: só a primeira IDR realizada inicia | Operação | `pme1_enviado_em` preenchido | — |
| Data prevista de uma ação (não `anterior_ao_sistema`) | Ação do mês; depois da data, "atrasada" | Responsável ou o perfil | Ação FEITA | Sim, 1x no dia |
| Mês 10 da jornada (RDV) e sem foto da família | "Pedir a foto da família" (presente do mês 11) | Operação | Foto anexada | — |
| Todo dia 1º, 8h | "Enviar a arte da agenda" e "agendar as reuniões mensais 6M" | Operação | `fila_feitos` | Sim |
| Reunião hoje | Reunião com status e "link enviado?" | Quem conduz (se tiver acesso) + Operação | Reunião fora do dia | — |

- **Ordem do onboarding:** os passos de mensagem (BOAS_VINDAS → GRUPOS → AQUECIMENTO →
  PME_AQUECIMENTO) seguem em ordem: um passo só é ENVIADO com o anterior CONCLUIDO. A **Caixa corre
  em paralelo** (o PDF diz que o PME de aquecimento é feito "enquanto a caixa não chega"): pode ser
  enviada assim que o formulário estiver preenchido. A IDR só é agendada com a Caixa entregue.
- **Variação em 2M e 6M** (D15): as 6 etapas nascem como no RDV, mas a equipe pode marcar qualquer
  uma como DISPENSADA (ADMIN, ACOMPANHAMENTO, OPERACAO; com histórico). Dispensada conta como
  concluída para liberar a próxima e não gera item nem alerta. Com todas CONCLUIDA ou DISPENSADA, a
  inscrição vira ATIVO, mesmo sem IDR (`inicio_jornada` = o dia em que fechou; gera as ações). No RDV não se dispensa: a IDR é quem inicia os 12 meses.
- **Pausar e retomar** (D15; ADMIN e ACOMPANHAMENTO, por ação própria, nunca por PATCH de status):
  - Pausar: abre `pausas`, guarda o status anterior, status PAUSADO. Some da Fila e do push.
  - Retomar: fecha a pausa e volta ao status anterior. Na mesma transação, soma os dias parados a
    `termino_previsto` e às ações PENDENTES com data a partir do início da pausa; ações feitas,
    já atrasadas antes da pausa e `anterior_ao_sistema` não mudam. Rearma o timer do push.
  - Várias pausas somam. Mês da jornada e correção da IDR consideram todas.
  - Onboarding: dias parado contam de `enviada_em` ou da última retomada, o que for mais recente.
  - Reunião marcada dentro da pausa continua na agenda, fora da Fila; a equipe remarca.
- **Data prevista das ações** = início do mês da jornada (`inicio_jornada` + (mês−1) meses) +
  `dias_para_executar`. Nascem só as ações com data até `termino_previsto`; as seguintes ficam para
  a renovação (Fase 4).
  Gatilho FIM_PME usa o calendário na Fase 1; o ajuste pelo PME chega na Fase 2.
- **Gatilho FLEXIVEL** (mês 7, cartões e milhas; Eduarda, 10/11: "não é algo engessado, é
  personalizado"): no início do mês entra na Fila como "combinar a reunião de cartões e milhas"; a
  equipe escolhe quando (antes, no início ou no fim do PME, uma ou mais reuniões). A ação conclui com
  uma reunião CARTOES_MILHAS realizada ou à mão; só vira atrasada se o mês 7 acabar sem nenhuma. Data sugerida: início do 7º PME (D14).
- **Plano de 2M e 6M** (D17; cadência medida nas abas REUNIÕES e PULSEIRAS da planilha; a Duda ajusta
  no plano-modelo):
  - 2M: reunião TRIMESTRAL_2M em +0, +3, +6, +9 e +12 meses.
  - 6M: reunião MENSAL_6M todo mês, de +0 a +11.
  - 2M e 6M: pulseira em +0, +6 e +12 meses (responsável Operação). As de +18, +24, +36 e +60 ficam
    no modelo e nascem com a renovação.
  - Ação com `reuniao_tipo` conclui sozinha quando uma reunião desse tipo é realizada no período.
- **Reunião fora do protocolo**: qualquer tipo de reunião pode ser marcada a qualquer momento, quantas
  vezes for preciso ("se eu sinto que o mentorado tem necessidade, eu faço", Eduarda, 10/11).
- **Corrigir a IDR** (data errada ou realizada por engano), só ADMIN/ACOMPANHAMENTO: recalcula
  `data_idr` e as datas das ações **pendentes**; feitas ficam como estão; histórico registra.
- Editar o plano-modelo **não reescreve** ações já criadas; vale para as próximas IDRs.
- Responsável desativado no CRM ou sem perfil: o item cai na Fila do perfil; ADMIN transfere a carteira.
- Reunião só vira REALIZADA/FALTOU depois do horário (400 "A reunião ainda não aconteceu").
- Fora da Fase 1: semáforo, cobranças, convites de aula, gatilhos de PME, lista de renovações de 60
  dias, "mensagem sem resposta há 1 hora" (TODO, depende da integração do WhatsApp).

## 6. Telas

Abas (desktop: sidebar via `nav-menu.tsx`; celular: rodapé com as principais + "Mais"):

| # | Aba | Fase 1 |
|---|---|---|
| 1 | Fila do dia | ✅ itens da §5 (D18): agenda de hoje, depois Atrasados e Hoje, com filtro por tipo e "Minha fila / Equipe". Cada linha tem a ação principal; o painel do item traz a ação, o link da ficha e a mensagem pronta (no celular abre em tela cheia). Cada perfil vê a sua; Leo não tem acesso na Fase 1 |
| 2 | Mentorados | ✅ foto, nome ("A e B" no casal), individual/casal, mês da jornada, status, responsável, último contato (contato ou reunião realizada); filtros por mês, status, responsável; lista "completar a ficha". PME atual, semáforo e % do PME entram na Fase 2 |
| 3 | Ficha do mentorado | ✅ Inscrição · Pessoas · Momento inicial · Jornada (onboarding, mês, ações) · Histórico (reuniões, contatos, envios, anotações, alterações). Mudar individual ↔ casal (adiciona ou remove a pessoa 2, com confirmação). Pausar e retomar (ADMIN e ACOMPANHAMENTO). ADMIN: excluir inscrição (com confirmação, sem desfazer) |
| 4 | Onboarding | ✅ funil das 6 etapas, dias parado por pessoa, caixas em trânsito, IDRs a agendar; dispensar etapa (2M e 6M) |
| 5 | Plano dos 12 meses | ✅ por mentorado e por mês (prevista, data, responsável, passos, feita); "vence esta semana" |
| 6 | Reuniões | ✅ agenda da semana por responsável, registro, controle mensal (quem teve reunião realizada no mês; todas as mentorias, com filtro, D17), sem reunião há mais de 30 dias, taxa de comparecimento |
| 7–11 | PMEs e ciclos · Linha do tempo e conquistas · Envios físicos · Eventos e agenda · Renovações e gestão | em breve (a Caixa é tratada no Onboarding) |
| — | Configurações (só ADMIN) | perfis, plano-modelo, mensagens-modelo, importação, transferir carteira |

Reuniões:
- **Remarcar** = a reunião atual vira REMARCADA e nasce uma nova AGENDADA ligada (`remarcada_para_id`).
  Taxa de comparecimento = REALIZADA ÷ (REALIZADA + FALTOU).
- **Marcada por engano**: AGENDADA sem registro pode ser excluída por ADMIN, ACOMPANHAMENTO e OPERACAO
  (função, com confirmação). Assim a Manu não ganha acesso permanente por erro.
- "Próxima reunião" no registro cria a próxima AGENDADA.
- **Sem reunião há mais de 30 dias** conta da última reunião realizada; sem nenhuma, da IDR ou da
  data de importação. Sem isso, a carteira importada inteira apareceria no primeiro dia.

Em todas as abas:
- **Busca** por nome, telefone ou e-mail (POST). Telefone e e-mail acham só o valor **completo**
  (índice cego); a tela avisa "número com DDD".
- **WhatsApp**: botão "Grupo" abre `link_grupo` (onde o PDF manda as mensagens); botão por pessoa abre
  `wa.me/<número>` sem texto. Ambos copiam antes a mensagem-modelo (individual ou casal) com o nome.
- **Histórico** de alterações (quem, quando, quais campos).
- **Exportar planilha** (CSV): ADMIN e ACOMPANHAMENTO, auditado, fórmulas neutralizadas; WhatsApp e
  e-mail só para ADMIN; dor, sonho e anotações nunca saem.
- Salvar ao sair do campo, pela fila de salvamento.

Visual: a parte 1 começa por **protótipo** (Fila do dia, Mentorados, Ficha) aprovado pelo Gabriel antes
do código de tela. Padrão premium do CRM (tokens de `globals.css`).

## 7. Importação do gerenciador atual

- Entrada: os 3 `.json` exportados do gerenciador da Eduarda (Dashboard, Linha do tempo, RDV), lidos
  por `legado.ts` (adaptado). Só ADMIN. Rota no formato `mentoria/<recurso>/importar(/previa)`.
- Casamento entre os 3 arquivos pelo **nome normalizado**; a prévia mostra contagens, quem casou, quem
  não casou e **nomes parecidos** para decidir (ex.: "Gegê e Hellen").
- **Casal**: a prévia sugere separar o nome em duas pessoas (por " e "); o ADMIN confirma ou corrige
  antes de gravar.
- Nome já cadastrado no v2 é ignorado. Mostra o total antes de gravar e pede confirmação.

| Dado antigo | Vai para |
|---|---|
| Nome, tipo, tipo de mentoria, data de entrada | `inscricoes` (tipo; `mentoria`: RDV, 2M e 6M direto; outros valores, como IDR e PME, a prévia agrupa por valor e o ADMIN escolhe a mentoria de cada grupo, com o texto original em `legado`; `data_compra`, com dia 1 + "aproximada" quando só há mês) + `pessoas` |
| Diagnóstico RDV: renda, guardado, dívidas, sonhos, filhos, trabalho, idade | `momento_inicial` e `pessoas`. Valor que não vira número limpo ("R$ 8 mil" vira 800000; texto ambíguo não) fica nulo, vai para `legado` e marca "completar" |
| Link da pasta | `inscricoes.link_pasta` |
| Status, antes/depois, eventos, conquistas, quadros | `legado` (sem tela até as fases 2–4) |
| Fotos e vídeos | Não recuperáveis (eram endereços da ferramenta antiga): listados em `legado` |

- Importados **não** passam pelo onboarding: as 6 etapas nascem ANTERIOR_AO_SISTEMA e não há item
  de boas-vindas. Status **ATIVO** (D14), exceto quem consta como cancelado na planilha, que entra
  CANCELADO (D16; a prévia mostra e o ADMIN pode trocar). Quem já terminou: a Duda ajusta na ficha. `data_idr` nula. Lista "completar a ficha" = RDV sem data da IDR, ou importado com campo
  marcado "completar" (2M e 6M não precisam de IDR).
- Quando a Duda informa a data da IDR de um importado RDV, as 12 ações nascem; as de data **anterior
  ao dia em que a data foi informada** vêm com `anterior_ao_sistema = true` (fora da Fila e do push;
  a Duda marca se quiser). Só as futuras alertam.
- 2M e 6M importados: `inicio_jornada` = data de início da planilha; as ações nascem na hora, com a
  mesma regra de `anterior_ao_sistema` (passadas não alertam, futuras sim).

**Segunda fonte: planilha da equipe (`.xlsx`, D16).** Mesmo fluxo de prévia e confirmação, só ADMIN,
leitura só no servidor. Lê 3 abas; as demais ficam na planilha até a fase delas.

| Aba e coluna | Vai para |
|---|---|
| RESPOSTASFORMS: nome completo, como gosta de ser chamado, telefone, e-mail, Instagram | `pessoas` |
| RESPOSTASFORMS: endereço | `enderecos` (origem FORMULARIO_CAIXA) |
| RESPOSTASFORMS: nome do cônjuge, cônjuge participa | `tipo` CASAL e pessoa 2 (pareia as duas respostas do casal; a prévia confirma) |
| RESPOSTASFORMS: maior sonho, maior medo | `momento_inicial`: sonho e dor |
| RESPOSTASFORMS: tamanho da pulseira | `pessoas` |
| RESPOSTASFORMS: link da foto, motivação, camiseta, livros | `legado` |
| RESPOSTASFORMS: **CPF** | **Ignorado: nunca é lido para gravação** |
| PROCESSOS 2M6M: data de início, mentoria | `data_compra` e, em 2M/6M, `inicio_jornada`; `mentoria` + `mentoria_variante` ("6M CASAL" = 6M + CASAL; rótulo sem mentoria clara, como "novo formato", a prévia agrupa e o ADMIN escolhe) |
| PROCESSOS 2M6M: status | `legado` (semáforo é Fase 2) |
| CANCELAMENTOS | `status` CANCELADO |

- Mais de uma resposta da mesma pessoa: vale a mais recente pelo carimbo de data.
- Campo presente nas duas fontes: a planilha preenche contato e endereço; o gerenciador, o diagnóstico.
- Testes só com planilha sintética. O arquivo real nunca entra no repo, em log ou em ferramenta.

## 8. Rascunho das fases seguintes (não implementar)

- **Fase 2, cobrança:** `pmes`, `ciclos`, `metas`, `tarefas`, `checkins` (BotConversa: TODO verificar
  integração), `semaforo_historico`; tarefas nascem da reunião; Fila ganha cobranças e semáforo;
  "10 erros do 1º PME" passa para o ciclo 1.
- **Fase 3, área do mentorado:** app separado com login próprio (usuários externos, fora de `user`
  do CRM); `pessoas.usuario_id`; visibilidade já existe.
- **Fase 4, entregas:** `linha_do_tempo_entregas`, `conquistas`, `indicadores_financeiros`,
  `avaliacoes`, `eventos`, `eventos_participacao`, `padrinhos` (liga com `condutor_inscricao_id`),
  `renovacoes` (muda `termino_previsto`), painel de gestão e painel do Leo.
- **Fast follow:** NPS, nível/selos, desafios mensais, comentários e reconhecimento do Leo.
- **TODOs abertos:** origem da compra (D5); "mensagem sem resposta há 1 hora" (integração Meta).

## 9. Segurança

- Runtime `npac_app`; toda consulta em `withUser`; RLS pela §3; sem DELETE direto.
- Contato, termo de busca e conteúdo pessoal nunca em URL, log ou push.
- Histórico só com nomes de campos. API com `Cache-Control: no-store`. SSE só `{ type }`.
- LGPD: `mentoria_anonimizar_inscricao()` (ADMIN) apaga pessoais, cifrados, endereço, legado e
  enfileira mídia; mantém contagens.
- Limpeza do módulo antigo apaga as tabelas antigas **também em produção** e os arquivos antigos de
  `MEDIA_DIR` (§13 T4): rodar o backup cifrado (`infra/backup`) antes do deploy.

## 10. Testes e critério de pronto

- `@npac/db`: RLS por perfil (Manu 404 fora das dela, Leo 404 em tudo, Operação sem momento inicial,
  sem DELETE), travamento do momento inicial, unicidade das ações, migrations (`idx`/`when`).
- `@npac/api`: e2e por perfil e por regra da §5 com `MENTORIA_CLOCK` e `PUSH_SENDER` falsos. Casos
  obrigatórios: IDR às 21h e às 23h30 (data de Brasília), IDR em 31/01, segunda IDR não duplica ações,
  IDR FALTOU devolve "agendar a IDR", item sem estado sai por `fila_feitos`, importação com fixture
  sintética **não cria item na Fila** e não manda push, corrigir IDR recalcula só pendentes, pausar tira da Fila
  e do push, retomar estende o término e as ações pendentes e desconta do mês da jornada, duas pausas
  somam, RDV recusa dispensar etapa, 2M com etapas dispensadas vira ATIVO sem IDR, Caixa alerta só
  depois de 20 dias do envio, importação da planilha nunca grava CPF e pareia casal, 2M gera reuniões em +0, +3, +6, +9 e +12
  meses, 6M gera reuniões mensais, pulseiras só até o término.
  Teste que varre rotas `mentoria/*` (guard + MFA) continua; importação acima de 1 MB passa.
- `@npac/shared`: dias parado, prazos por etapa, conversão de valores do legado, separação de nomes de casal.
- `@npac/web`: Playwright por aba e por perfil; capturas 375/768/1024/1440; `acompanhamento-sem-comercial`
  continua verde; dois usuários editando campos diferentes da mesma ficha não perdem dado.
- Seed: `duda` (ACOMPANHAMENTO + admin), `operacao`, `manu` (ESPECIALISTA), `leo` (MENTOR), `diretor` (admin)
  e mentorados de exemplo em cada etapa, individual e casal, um importado.
- Suítes do CRM inalteradas e verdes. `CLAUDE.md` (mapa e regras do Acompanhamento) atualizado.

## 11. Divisão da Fase 1 (uma sessão por parte)

1. **Base:** protótipo; apagar o módulo antigo (tabelas, mídia, testes, telas); perfis e RLS;
   inscrições, pessoas, endereços, momento inicial; Mentorados, Ficha, busca, histórico;
   Configurações > Perfis; seed.
2. **Onboarding + importação (gerenciador e planilha):** etapas (ordem + Caixa em paralelo + dispensar em 2M/6M), Caixa, prazos; aba Onboarding;
   importação do gerenciador.
3. **Plano dos 12 meses:** plano-modelo por mentoria (RDV, 2M, 6M; seed + edição, passos), ações geradas na IDR, correção da IDR,
   pausar e retomar; aba Plano.
4. **Reuniões:** tipos, estados, remarcar, excluir agendada, registro, regra IDR → início; aba
   Reuniões; Especialista restrita.
5. **Fila do dia + avisos:** Fila, `fila_feitos`, mensagens-modelo, WhatsApp (grupo e pessoa),
   exportação, push (com as 2 mudanças do D12), transferir carteira; abas "em breve".

## 12. Suposições (validar com a Eduarda)

- `status_financeiro` = EM_DIA, EM_ATRASO, QUITADO (o PDF não lista os valores).
- `termino_previsto` de 2M e 6M: início + 12 meses, editável (a planilha mostra o ciclo de 12 meses).
- Responsável padrão das ações: perfil ACOMPANHAMENTO → responsável da inscrição; OPERACAO e
  ESPECIALISTA → qualquer pessoa do perfil.
- Textos das mensagens-modelo: a Duda cadastra; o seed traz só os nomes dos momentos.
- Uma ação por mês (como o PDF diz), com os passos da coluna "registro no sistema" como checklist.

## 13. Revisão de 10/11/2026 (o que mudou e por quê)

Fluxos que quebravam:
- **F1** Ordem estrita das 6 etapas travava a Caixa até o PME de aquecimento acabar; o PDF diz que
  correm juntos. Agora a Caixa é paralela (§5).
- **F2** Importados ganhavam onboarding novo (180 itens de boas-vindas) e ações atrasadas de meses
  passados (centenas de alertas e push). Agora ANTERIOR_AO_SISTEMA / `anterior_ao_sistema` (§7).
- **F3** Itens "enviar o 1º PME", "lembrete da IDR" e "arte do dia 1º" não tinham como ser marcados.
  Agora `pme1_enviado_em` e `fila_feitos` (§4, §5).
- **F4** IDR às 21h vira o dia seguinte em UTC: `data_idr` e as 12 ações sairiam um dia adiantadas.
  Agora data de Brasília + teste (§5, §10).
- **F5** Reunião com mentorado experiente exigia um usuário como condutor; o padrinho não tem login.
  Agora `condutor_inscricao_id` (§4).
- **F6** "10 erros do 1º PME" ficava dentro do momento inicial, que trava na IDR, mas acontece no mês 1.
  Agora fora do travamento (§4).
- **F7** Etapas CAIXA e IDR tinham estado próprio e podiam divergir do envio e da reunião. Agora derivadas.
- **F8** Manu não conseguia marcar a ação do mês 5; Operação não podia preencher o endereço da Caixa.
  Matriz corrigida (§3).
- **F9** Leo conduz IDR, mas é só leitura: agora Duda ou Operação registram; Leo não recebe "enviar link".

Fluxos que faltavam: IDR que falta ou é remarcada; corrigir data da IDR; segunda IDR; reunião marcada
por engano; remarcar; excluir inscrição duplicada; individual ↔ casal; responsável desativado; regra
"mês 10 pede a foto da família"; link da IDR minutos antes (não às 8h); mensagens no grupo individual
(não no privado); "equipe devendo o próximo passo"; status PAUSADO/CANCELADO fora da Fila; conta nova.

Riscos técnicos:
- **T1** `app.setup.ts` só dá 25 MB à rota `/api/mentoria/<x>/importar(/previa)`; outra forma de rota
  cai no limite de 1 MB (413) ou obriga a mexer em arquivo compartilhado.
- **T2** `seed-cli.ts` importa `seedMentoria` de `seed-mentoria.ts`: manter o nome do export.
- **T3** `app.module.ts` importa `MentoriaModule`: manter o nome e o caminho.
- **T4** Apagar as tabelas antigas deixa arquivos órfãos em `MEDIA_DIR`: a parte 1 apaga a mídia antiga
  de forma explícita.
- **T5** `version` por linha + salvar ao sair do campo: duas pessoas editando campos diferentes da mesma
  linha geram 409 falso. A fila de salvamento recarrega e reaplica o campo se o outro não o mudou.
- **T6** Mês da jornada calculado em SQL e em JS daria resultados diferentes no fim do mês: uma
  implementação só (SQL).
- **T7** Push: controller sem `@AllRoles()`; resolvido por D12 (parte 5).

## 14. Em aberto

Para a Eduarda: ✅ todas respondidas em 10/11 (E1 a E9, ver D14 e D15).

Para o Gabriel:
- ~~**G1** Push exige mexer no CRM~~ → liberado em 10/11 (D12).
- ~~**G2** Quem é Admin além da Diretoria?~~ → a Duda, em 10/11 (D13).
