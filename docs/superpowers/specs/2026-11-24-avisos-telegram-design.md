# Avisos pelo Telegram (NPAC-74)

Pedido: Igor (SDR, iPhone antigo), 24/11/2026: os avisos do celular atrasam e somem; quer "algo em tempo real,
igual o bot que ele fez no Telegram". O NPAC-71 consertou o nosso lado do Web Push, mas aviso de site instalado
no iPhone nunca tem a prioridade de um app. Gabriel: "quero que a própria pessoa possa conectar o dela lá".
Bots criados pelo Igor no `@BotFather` em 24/11: `npac_itodev_bot` (ITODEV) e `npac_oficial_bot` (produção).

## Suposições (sem resposta explícita do Gabriel; produção só com o sim dele)

- **S1. Texto igual ao do push de hoje**, com o nome do lead ("Ana agendou João Silva"), nunca telefone,
  Instagram, e-mail ou valor. A mensagem de bot fica legível nos servidores do Telegram (não é cifrada de ponta a
  ponta). Trocar para "sem o nome" é uma linha: `TELEGRAM_SEM_NOME` em `api/telegram/telegram.ts` (hoje `false`)
  manda só um texto genérico por tipo ("Novo aviso no CRM") e o botão.
- **S2. Telegram além do aviso do aparelho**: quem conecta continua recebendo o push do navegador também.

## Como funciona

```
Meu perfil → "Conectar Telegram" → POST /api/me/telegram/code → t.me/<bot>?start=<código>
→ a pessoa toca em "Começar" → Telegram → POST /api/webhooks/telegram (segredo no cabeçalho)
→ telegram_conectar(hash do código, chat cifrado) → vínculo pessoa ↔ chat → resposta do bot
```

- **Código**: 32 bytes aleatórios em base64url (43 caracteres, o `start` aceita até 64), uso único, 10 minutos.
  Só o SHA-256 fica no banco (`telegram_codigos`, uma linha por pessoa: pedir de novo troca o anterior).
- **Vínculo** (`telegram_vinculos`): uma linha por pessoa; id do chat cifrado (`FieldCrypto`, AES-256-GCM) e
  índice cego (HMAC de `telegram:<id>`) único: um Telegram fica ligado a uma pessoa por vez (quem conectou por
  último). RLS: cada um vê e apaga só o seu; gravação só pela função `telegram_conectar` (SECURITY DEFINER, roda
  **só sem sessão**, `app_user_id() IS NULL`, como as funções do legado da Evolução) e o pedido de código só por
  `telegram_codigo` (com sessão). Conta desativada não conecta. Desativar a pessoa apaga o vínculo e o código
  (`push_purge_user`).
- **Webhook** `POST /api/webhooks/telegram` (`@Public`): confere `X-Telegram-Bot-Api-Secret-Token` com
  comparação de tempo constante antes de olhar o corpo; sem as variáveis ou com segredo errado/ausente, 404.
  Responde sempre 200 a um pedido autenticado (o Telegram repete o que não recebe 2xx). Só trata mensagem de
  chat **privado** que começa com `/start`; o resto ignora. Nada do que chega vai para log.
- **Envio**: `PushService.notify(userIds, payload)` (o ponto único de todo aviso: lembretes, sino, Chat, Forms,
  Fila do Acompanhamento) chama também `TelegramService.notify`. Para quem tem vínculo: `<b>title</b>` + `body`
  (HTML escapado) e o botão "Abrir no CRM" (`WEB_ORIGIN` + `url`; só com `https:`, porque o Telegram recusa botão
  com `http://localhost`). Lê o vínculo como a própria pessoa (RLS), fecha a transação e envia em paralelo, com
  10 s de limite. Erro no Telegram não atrapalha o push nem a tela. **403** (a pessoa bloqueou o bot) apaga o
  vínculo. Log: `telegram enviado: 200 api.telegram.org`, `telegram recusado: <código> api.telegram.org`,
  `telegram sem resposta: <erro> api.telegram.org`; nunca o chat, o texto, o token ou dado da pessoa.
- **Webhook registrado sozinho**: ao subir, com as variáveis e `WEB_ORIGIN` em `https:`, a API chama
  `setWebhook` com `WEB_ORIGIN/api/webhooks/telegram`, o segredo e `allowed_updates: ["message"]`. Nada de
  `curl` manual.
- **Ligar e desligar**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` e `TELEGRAM_WEBHOOK_SECRET` (Zod, as três
  juntas; o segredo com 32+ caracteres `A-Z a-z 0-9 _ -`). Sem elas, tudo desligado: `GET /api/me/profile` traz
  `telegram: null`, a seção não aparece e as rotas dão 404 (como o e-mail sem `SMTP_HOST`).
- **Só de ida**: responder ao bot não faz nada além do `/start`.
- Auditoria `user.telegram_connected` / `user.telegram_disconnected`, sem nome nem chat.

## Rotas (todas `@AllRoles()`: vale também para o cargo Acompanhamento)

| Rota | O que faz |
| --- | --- |
| `GET /api/me/profile` | ganha `telegram: null \| { connected, since }` |
| `POST /api/me/telegram/code` | novo código → `{ url, expiresAt }` |
| `GET /api/me/telegram` | `{ connected, since }` (a tela confere enquanto espera o "Começar") |
| `POST /api/me/telegram/test` | manda o aviso de teste; sem vínculo, 409 |
| `DELETE /api/me/telegram` | desconecta |
| `POST /api/webhooks/telegram` | recebe o `/start` |

## Tela (Meu perfil, seção nova entre "Senha" e "Este aparelho")

Esperando o "Começar": a tela confere `GET /api/me/telegram` ao voltar para a aba e a cada 4 s, até 10 minutos
(sem escrita no banco nem auditoria). Estados: desconectado, esperando, conectado, erro.

## Textos novos (aprovar antes de produção)

Tela:

- Título "Avisos pelo Telegram"; explicação "Os mesmos avisos do CRM, na hora, no seu Telegram."
- Desconectado: "Não conectado." + botão **Conectar Telegram**.
- Esperando: "Abra o Telegram e toque em “Começar”. Esta tela muda sozinha quando der certo." + **Abrir o
  Telegram** + **Cancelar**.
- Venceu a espera: "O link venceu. Toque em “Conectar Telegram” de novo."
- Conectado: "Conectado desde DD/MM." + **Enviar aviso de teste** + **Desconectar**.
- Teste enviado: "Enviado. Confira o Telegram."
- Erros: "Não deu para falar com o Telegram. Tente de novo." · "Conecte o Telegram antes do teste."

Bot:

- `/start` com código válido: "Pronto, {primeiro nome}! Os avisos do NPAC CRM vão chegar aqui."
- `/start` com código vencido, usado ou errado: "Esse link não vale mais. No CRM, abra “Meu perfil” e toque em
  “Conectar Telegram” de novo."
- `/start` sem código: "Para receber os avisos do NPAC CRM aqui, abra o CRM, vá em “Meu perfil” e toque em
  “Conectar Telegram”."
- Aviso: o `title` em negrito, o `body` embaixo (se houver) e o botão **Abrir no CRM**.
- Aviso de teste: "Aviso de teste do NPAC CRM" / "Se chegou, está tudo certo."

## Riscos conhecidos (revisão de segurança, 24/11)

- Quem pegar o link do bot (print, encaminhado) e tocar em "Começar" antes da dona, nos 10 minutos, recebe os avisos
  dela. O link só aparece logado e é de uso único; a dona vê "Conectado" sem ter tocado e pode desconectar.
- "Conectar" e "Enviar aviso de teste" não têm limite por pessoa; o abuso só alcança o próprio Telegram.
- O token do bot vai no caminho da URL da Bot API: `TELEGRAM_API_URL` só aceita `https:` (ou `http://localhost` nos
  testes).

## Fora desta versão

- Responder pelo Telegram, escolher quais avisos vão para lá, silenciar horários.
- O Chat aberto e em foco no navegador não segura o aviso do Telegram (o push do Chrome segura).

## Testes

- Banco `db/test/telegram.test.ts`: RLS (vê e apaga só o seu; sem INSERT/UPDATE direto), `telegram_codigo` só
  com sessão, `telegram_conectar` só sem sessão, uso único, vencido, conta desativada, um Telegram por pessoa,
  `push_purge_user` apaga.
- API `api/test/telegram.e2e.test.ts` com `MemoryTelegramSender`: código, webhook com segredo certo/errado/
  ausente, `/start` válido, inválido, vencido e sem código, envio junto com o push, 403 apaga, teste, desconectar,
  404 sem as variáveis.
- e2e `e2e/telegram.spec.ts`: conectar (o teste faz o papel do Telegram chamando o webhook), aviso de teste,
  desconectar; capturas em 375/768/1024/1440, claro e escuro.
