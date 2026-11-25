# NPAC-77 — Versão no rodapé e janela de novidades

Pedido do Gabriel (25/11/2026): mostrar a versão que está no ar no rodapé da barra lateral e, a cada
atualização, uma janela "como no Cubeship" com as novidades em português simples.

- Protótipo aprovado: canvas "Versão e novidades", https://claude.ai/artifact/EhkXTCT3axduWVY8o9Tum6
  (decisões lado a lado) e o mock clicável `docs/prototipos/novidades/index.html` (mudanças reais de
  23 a 25/11, troca de pessoa e de última versão vista).
- Decisões do Gabriel (25/11): **1A, 2A, 3A, 4A**.

## Decisões

| # | Decisão | Escolha |
|---|---|---|
| D1 | Onde fica o número | Linha própria embaixo de Sair/Alternar tema: "• Versão 0.24.1 · O que mudou". Some com a barra recolhida. No celular, no cartão da conta do `/mais` e do `/acompanhamento/mais`. |
| D2 | Onde guarda o "já vi" | Na conta (banco). Viu no computador, o celular não mostra de novo. |
| D3 | Quem escreve | O Claude escreve as novidades no mesmo PR da mudança; o Gabriel lê e aprova no PR. |
| D4 | Versão só com mudança interna | A janela não abre; só o número do rodapé muda. |

## Como funciona

### O número

- Vem da tag que está no ar (`v0.24.1-rc`, `v0.24.1`, `v0.24.3-hf-rc`…). A tela mostra só `X.Y.Z`
  (`versaoNaTela` corta `-rc`, `-hf`, `-hf-rc`): a produção roda a última rc, que tem o mesmo número da final.
- Local e e2e (sem tag): "dev".
- Como a tag chega à API (T1, decidido em 25/11/2026): **o adaptador Cubeship do release-kit grava
  `APP_VERSION=<tag>` no app antes de cada deploy** (opção 2; PR do kit
  https://github.com/Kaina-Ribeiro/release-kit/pull/17, vale para todos os repositórios no `@v1`).
  - Opção 1 conferida e descartada: o Cubeship sabe a ref (`get_app` → `ref: v0.24.1-rc`, e cada deploy
    guarda `git_branch`/`git_sha`), mas não a passa ao container (`get_app_env` não lista nada do build).
  - Opção 3 descartada: `.git` está no `.dockerignore` e o Cubeship reaproveita a imagem pelo commit.
  - A chave do deploy (papel Deploy) já gerencia apps com segredos: nenhum segredo nem painel novo.
  - A gravação nunca derruba um deploy: se o Cubeship recusar, o log avisa e o deploy segue (o rodapé
    mostra "dev"). Só o `APP_VERSION` é tocado; o rollback pela Actions → Deploy grava a tag antiga.
  - Até a release do kit (`v1.3.0`, precisa do sim do Gabriel: move o `v1` de todos os repositórios), o
    ITODEV e a produção mostram "dev".
- A API lê `APP_VERSION` (`api/config/env.ts`) e devolve em `GET /api/me` (`versao`, já em X.Y.Z). O web
  não precisa de build arg nova.

### As novidades

- Arquivo `packages/shared/src/novidades.ts` (`@npac/shared/novidades`, sem zod), a mais nova primeiro:
  ```ts
  { id: 'npac-75-dashboard', data: '2026-11-25', para: ['acompanhamento'], tipo: 'novo',
    titulo: 'Onboarding agora é Dashboard, com engajamento',
    texto: 'No topo: total de mentorados e quantos estão Engajados…',
    onde: 'Acompanhamento → Dashboard', href: '/acompanhamento/onboarding' }
  ```
- `tipo`: `novo` (dourado), `melhorou`, `corrigido` (cinza), `acao` ("Faça isso", escuro; sobe para o
  bloco "Precisa de você" no topo da janela).
- `para` (quem vê), regra pura `novidadeVisivel(n, pessoa)` com teste de casos:
  - `todos`;
  - `comercial`: quem tem o comercial (`hasCommercialAccess`);
  - `sdr`: SDR e liderança; `closer`: Closer e liderança;
  - `acompanhamento`: quem abre o módulo (`modules.mentoria`); `acompanhamento-admin`: selo de Admin
    do Acompanhamento e Diretoria;
  - opcional `perfis` para recortar dentro do módulo (ex.: Especialista não vê o Dashboard).
  - A Diretoria vê tudo.
- **Agrupamento por data, não por versão** (S1): o número final só existe depois do merge, então a
  janela agrupa por "Atualização de 25/11". O número da versão fica no rodapé e no histórico do topo.
- `id` único e estável; o teste confere ids únicos, datas em ordem, textos sem e-mail/telefone e
  `href` interno.

### O "já vi"

- Coluna `user.novidades_vista text` (id da mais nova que a pessoa viu). Sem RLS, como o resto de `user`.
- Não vistas = as entradas visíveis acima desse id. Id que sumiu do arquivo = tudo visto (não despeja
  histórico).
- **Quem já existia na subida** (S2, corrigido em 25/11/2026: o ITODEV mostrou que a primeira metade anulava a
  segunda): a 0089 grava `npac-75-dashboard` (a entrada logo abaixo de `npac-77-versao`) em toda conta com a coluna
  vazia, e no ITODEV também em quem já tinha `npac-77-versao`. A primeira janela da equipe é só a da própria
  novidade, uma vez; nada mais antigo.
- **Conta criada depois** (coluna vazia): a primeira leitura grava a mais nova e não abre janela; o histórico fica em
  "Ver versões anteriores".
- `POST /api/me/novidades/vista { ate: id }` (`@AllRoles()`), chamada por "Entendi", pelo X, pelo Esc,
  por clicar fora e pelo link "Abrir" de um item. Só avança (id mais novo que o atual). Sem auditoria.
- `user` não está no canal ao vivo: outra aba aberta continua com a janela até recarregar (aceito).

### A janela

- Abre sozinha uma vez, ao carregar uma tela do app, se houver não vista para a pessoa (D4: sem nada
  para ela, não abre). Não abre no login, na troca de senha obrigatória nem nas telas de impressão.
- Desenho do protótipo: título "O que mudou no CRM", subtítulo com a quantidade, itens com ícone,
  etiqueta, texto e "onde fica" (link que fecha e navega), rodapé "Ver versões anteriores" + "Entendi".
- Mais de uma atualização não vista: tudo numa janela, separado por data; "Faça isso" no topo.
- Celular: folha de baixo (`<dialog class="dlg">` com o movimento do app, `closeWithMotion`).
- O "O que mudou" do rodapé abre a mesma janela no modo histórico (todas as entradas que a pessoa vê).
- **Peso de JS** (teto do `/leads`): a janela e o histórico entram por `next/dynamic`, só quando há não
  vista ou no clique. O botão do rodapé é um componente cliente mínimo. O layout passa só ids e contagem;
  o texto vem com o componente.

### Processo (D3)

- PR com mudança visível para a equipe acrescenta a entrada em `novidades.ts` no mesmo PR, e a descrição
  do PR traz a seção "Novidades para a equipe" com o texto. O Gabriel aprova lendo o PR.
- PR sem mudança visível: nada no arquivo (D4 acontece sozinho).
- Regra no `CLAUDE.md` e seção no modelo de PR.

## Suposições (confirmadas pelo Gabriel, 25/11: "Sim, começa")

- **S1** Agrupar por data ("Atualização de 25/11") em vez de "Versão 0.24.1 · 25/11", como estava no protótipo.
- **S2** Na subida e para conta nova, ninguém recebe o histórico antigo de uma vez; a primeira janela é a desta novidade (quem já existia: 0089; conta criada depois: vazia → a mais nova).
- **S3** As entradas de 23 a 25/11 do mock entram no arquivo como histórico.

## Fora do escopo

- Editor de novidades dentro do CRM.
- Aviso por push ou Telegram de versão nova.
- Avisar a aba aberta na hora do deploy (precisa recarregar).
