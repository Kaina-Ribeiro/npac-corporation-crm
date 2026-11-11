# Integração do Google Forms com o CRM

Cada resposta enviada vai para o CRM, que acha ou cria o lead e avisa o dono e a liderança.
Regras e contrato: `docs/superpowers/specs/2026-11-10-forms-email-design.md`, Parte B.

## O que o CRM precisa (variáveis do app `api`)

| Variável | Para que serve |
|---|---|
| `FORMS_WEBHOOK_TOKEN` | Senha do webhook, com 32 caracteres ou mais. Sem ela a rota responde 404. |
| `FORMS_OWNER_USERNAME` | Usuário dono dos leads criados pelo formulário. Hoje: o do Igor. |

## Instalar no Google Forms (uma vez, com a conta dona do formulário)

1. Abra o formulário e clique em **⋮** (canto superior direito) → **Editor de scripts**.
2. Apague o conteúdo e cole o arquivo `docs/integracao-forms/apps-script.gs`.
3. Salve (ícone de disquete).
4. No menu da esquerda, abra **Configurações do projeto** (engrenagem).
5. Em **Propriedades do script**, clique em **Adicionar propriedade do script**.
6. Nome: `CRM_TOKEN`. Valor: o mesmo de `FORMS_WEBHOOK_TOKEN`. Salve.
7. Volte em **Editor** (`< >`), escolha a função `testarConexao` e clique em **Executar**.
8. Autorize quando o Google pedir. O registro deve terminar com "Conexão com o CRM funcionando".
9. No menu da esquerda, abra **Acionadores** (relógio) → **Adicionar acionador**.
10. Função: `aoEnviarFormulario`. Origem do evento: **Do formulário**. Tipo: **Ao enviar formulário**. Salve.

## Conferir

1. Envie uma resposta de teste com renda acima de 5 mil.
2. No CRM, confira o sino e o bloco "Formulários novos" da tela Hoje.
3. Apague o lead de teste na ficha.

## Se o título de uma pergunta não for reconhecido

O script acha as perguntas por palavras no título (bloco `CAMPOS`, no topo do arquivo) e lê a renda
pelos números do texto. Ajuste `CAMPOS` se precisar. Mudar uma pergunta no Forms nunca exige mudar
o CRM.

## Limite

O Forms só registra quem enviou. Quem abandona o preenchimento não gera aviso.

## Provisório, sem depender do CRM

No formulário: **Respostas** → **⋮** → **Receber notificações por e-mail**.
