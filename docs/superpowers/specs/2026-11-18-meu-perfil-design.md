# Meu perfil (NPAC-53) — especificação curta

Origem: pedido do Gabriel de 18/11/2026 ("trocar foto, nome, e-mail e senha; o botão trocar senha sairia"), Fase 3 de
`docs/plans/pedidos-18-11.md`. Comparação feita com Linear, Attio e HubSpot (seção da Fase 3 do plano).
Protótipo: canvas "Meu perfil" (https://claude.ai/artifact/NP1nmGBCzto7wdRf1xuwKm, 15 quadros). Status: ✅ aprovado pelo
Gabriel em 18/11/2026 ("1A, 2A, 3A": protótipo como está; sem envio de e-mail, "peça à liderança"; foto também no Chat e
no Admin). Plano: `docs/superpowers/plans/2026-11-18-meu-perfil.md`. Revisão de design de 18/11 aplicada: senha recolhida, usuário e e-mail como texto, quadros de
estados, do celular do Acompanhamento e do tema escuro.

## Por quê

Hoje cada pessoa só troca a senha sozinha; nome e e-mail dependem da liderança no Admin e não há foto. A foto ajuda a
reconhecer quem é quem no Chat, na Equipe e nas listas do Acompanhamento. Uma tela de conta única, como nos CRMs de
referência, tira o "Trocar senha" solto do menu.

## O que entra

Tela **Meu perfil** em `/conta/perfil`, dentro da casca do app (sidebar no desktop; no celular, voltar para o Mais), para
todos os cargos, do comercial e do Acompanhamento.

| Bloco | Como funciona |
|---|---|
| Foto | Enviar (JPEG, PNG ou WebP do aparelho), recortar em círculo (arrastar + zoom; setas do teclado movem, − / + dão zoom), salvar; "Remover" volta à inicial. Sem foto, o botão é "Adicionar foto" e "Remover" some. |
| Nome | Salva ao sair do campo e mostra "Salvo" (`showToast()`). 2 a 80 caracteres. |
| Usuário | Só leitura, como texto com cadeado (sem caixa de campo): é o login. |
| E-mail | Texto com o endereço + "Trocar e-mail" → digita o novo → código de 6 dígitos enviado ao endereço novo → confirma → troca. |
| Senha | Recolhida: "•••••••• · Trocar senha". Abre ali mesmo senha atual + nova + confirmação, "Salvar senha" e "Cancelar". Os outros aparelhos saem da conta (como hoje). |
| Avisos neste aparelho | O link que já existe (`/conta/avisos`). "Autenticador" só com `MFA_LIGADO`. |

Celular: CRM com a barra de baixo do comercial; cargo Acompanhamento com as abas do módulo (Fila, Mentorados, +,
Reuniões, Mais) e "‹ Mais" voltando ao Mais do módulo. Tema escuro com os tokens de `.dark`.

Estados (quadro "Estados" do protótipo; textos meus, exceto o da senha, que já existe):

| Caso | Texto |
|---|---|
| Nome vazio | "Digite o seu nome." Nada é salvo; vale o nome anterior. |
| Imagem que não abre | "Não deu para abrir essa imagem. Use JPG, PNG ou WebP." |
| Senha atual errada | "Não foi possível trocar a senha. Confira a senha atual." |
| E-mail já usado | "Esse e-mail já está em uso." Não diz de quem; nenhum código sai. |
| Código errado | "Código errado. Confira e tente de novo." Os números somem; depois de 5 erros o código deixa de valer. |
| Código vencido | "Esse código venceu. Peça outro." + "Enviar outro código". |
| E-mail trocado | A janelinha fecha, "Salvo", a linha mostra o endereço novo e o antigo recebe um aviso. |

Menu: "Trocar senha" sai do rodapé da sidebar e do cartão do Mais (CRM e Acompanhamento); entra "Meu perfil". Clicar na
foto ou no nome também abre a tela. `/conta/senha` fica só para o primeiro acesso (troca obrigatória); quem abre sem
troca pendente vai para `/conta/perfil`.

## Onde a foto aparece

Toda bolinha com inicial de pessoa da equipe passa a mostrar a foto, quando houver:

- já têm inicial hoje: rodapé da sidebar, cartão do Mais (CRM e Acompanhamento), topo do Acompanhamento no celular,
  Equipe, feed da equipe no Dashboard, bolinha do closer na agenda do Hoje;
- não têm inicial hoje (proposta no protótipo): Chat (lista de conversas e mensagens dos outros), Admin (linha de cada
  usuário), responsável na lista de Mentorados e na Fila do Acompanhamento.

Mentorados (fotos da ficha) não mudam: já têm a deles (`Rostos`).

## Fora (só se o Gabriel pedir)

Sair dos outros aparelhos como ação separada, idioma, fuso, telefone, foto por URL, GIF animado.

## Desenho técnico

- **Banco** (migration 0069): tabela `user_photos` (`user_id` PK → `user` com `on delete cascade`, `bytes bytea`,
  `mime text`, `updated_at`) e a versão em `user.image` (texto curto, ex.: carimbo de tempo). A tabela `user` não tem
  RLS: só a API grava, pela sessão da própria pessoa. `npac_app` com SELECT/INSERT/UPDATE/DELETE em `user_photos`.
- **API** (`api/conta/*`, `@AllRoles()`):
  - `PATCH /api/me/profile { name }`.
  - `PUT /api/me/photo` (corpo binário, até 200 KB): tipo conferido pelos bytes (JPEG, PNG, WebP; nunca SVG), como em
    `api/mentoria/media-sniff.ts`; troca a versão. `DELETE /api/me/photo`.
  - `GET /api/users/:id/photo?v=<versão>`: qualquer pessoa logada (a equipe já vê os nomes uns dos outros);
    `Cache-Control: private, max-age=31536000, immutable` (exceção ao `no-store`: a URL muda a cada foto),
    `X-Content-Type-Options: nosniff`. Sem foto: 404.
  - E-mail: `POST /api/me/email/code { email }` gera 6 dígitos (hash na tabela `verification`, vale 10 min, 3 pedidos
    por hora por conta, 5 tentativas por código) e manda ao endereço novo pelo `MailSender`; `POST /api/me/email/confirm
    { code }` troca `user.email` (único; em uso → "Esse e-mail já está em uso"). Minha proposta: avisar o endereço antigo
    ("o e-mail da sua conta foi trocado"), sem o endereço novo no texto.
  - `/update-user` e `/change-email` do Better Auth ficam desligados (`disabledPaths`): o único caminho é o nosso, com
    validação e auditoria. A senha continua pelo `/change-password` do Better Auth.
  - Auditoria de cada ação (`user.name_changed`, `user.photo_set`, `user.photo_removed`, `user.email_code_sent`,
    `user.email_changed`), sem nome, e-mail nem foto.
- **DTOs**: quem mostra uma pessoa da equipe ganha `photo` (URL com a versão, ou `null`): `/api/me`, `/team`, Chat
  (conversas e autores), Admin, feed do Dashboard, closer do Hoje, responsáveis do Acompanhamento.
- **Web**:
  - Componente `Avatar` sem `'use client'` (foto ou inicial, mesmo tamanho e cor de hoje em cada tela).
  - Recorte num `<dialog class="dlg">` com `<canvas>`: reduz para 256 × 256, `toBlob('image/webp', 0.85)`; se o
    navegador não gerar WebP (Safari), JPEG 0,85. Tudo abaixo de 100 KB. Código carregado só no perfil
    (`next/dynamic`): o JS de `/leads` fica abaixo de 150 KB.
  - Depois de salvar, `router.refresh()` (a sidebar e o Mais pegam a foto nova).

## Ponto aberto (pergunta ao Gabriel)

O envio de e-mail está desligado até existir a conta Gmail do sistema. Sem `SMTP_HOST`, o campo E-mail faz o quê?
Minha proposta: mostra o e-mail atual só para ler, com "Para trocar, peça à liderança" (o Admin já edita o e-mail);
quando o envio ligar, aparece "Trocar e-mail" com o código, sem mudar código.

## Feito quando

- e2e de trocar foto, nome, senha e e-mail (com a caixa falsa do `MailSender`).
- Capturas em 375/768/1024/1440 de Meu perfil e de cada tela onde a foto aparece.
- `pnpm lint && pnpm typecheck` e as suítes de api, db, shared e web passando; JS de `/leads` < 150 KB gzip.
- `CLAUDE.md` atualizado no mesmo PR.
