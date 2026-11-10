# Spec: e-mail do lead e aviso do Forms

Pedido do Igor, respostas de 10/11/2026: **4C+D, 5 (criar só acima de 5 mil), 6A**.
Plano de execução: `docs/superpowers/plans/2026-11-10-pedidos-igor.md`, Fase 4.

## Objetivo

Quando alguém terminar o Forms, o CRM guarda a resposta, acha ou cria o lead e avisa dentro do
CRM. Sucesso: Igor e liderança veem o aviso no sino e no bloco "Formulários novos" do Hoje, em
poucos segundos, sem abrir o Google Forms.

## Decisões

| Tema | Decisão | Origem |
|---|---|---|
| Contatos do Forms | WhatsApp, Instagram e e-mail | 4C+D |
| E-mail no lead | Campo novo na ficha e no cadastro, opcional | 4D |
| Sem lead correspondente, acima de 5 mil | Cria o lead | 5 |
| Sem lead correspondente, até 5 mil | Não cria e não guarda a resposta | 5 |
| Quem é avisado | Dono do lead + liderança | 6A |
| Dono do lead criado pelo Forms | Igor, por configuração (`FORMS_OWNER_USERNAME`) | 6 |
| Abandono do formulário | Não é detectável: o Forms só registra envio | Pedido |

**Suposições (corrigir se estiverem erradas):**

- Resposta que bate com lead existente de outro SDR continua desse SDR, que recebe o aviso. O lead
  não é transferido para o Igor.
- Resposta que bate com lead existente não altera nenhum dado do lead, e vale para qualquer renda.
- Resposta sem renda reconhecida conta como "não criar", com auditoria para percebermos o erro.

## Parte A: e-mail do lead

Segue as regras do telefone, porque é contato pessoal.

- **Banco:** `leads.email_enc` (bytea, AES-256-GCM) + `leads.email_bidx` (blind index HMAC, índice).
- **Normalização:** `trim` + minúsculas; Zod `z.email().max(254)`, em `sh/schemas/lead.ts` e
  `lead-update.ts`.
- **Duplicidade:** `lead_contact_taken` ganha `email_bidx` (função recriada, com as duas assinaturas);
  advisory lock `email:<bidx>` na mesma ordem determinística; a resposta não revela o dono.
- **Obrigatoriedade:** a regra "informe telefone ou Instagram" não muda; e-mail é adicional.
- **Timeline:** `email` entra em `timeline_fields_allowed`; nunca o valor.
- **LGPD:** `lgpd_anonymize` zera `email_enc` e `email_bidx`; o export LGPD inclui o e-mail.
- **CSV com contato** (só liderança): coluna "E-mail".
- **Busca:** `parseSearch` reconhece e-mail (tem `@` no meio e não começa com `@`) e busca pelo blind
  index. Placeholder: "Nome, WhatsApp, @instagram ou e-mail".
- **Privacidade:** e-mail nunca em URL, log ou analytics (o e2e existente já barra `@`).

## Parte B: recebimento do Forms

Fluxo: `Forms → Apps Script (ao enviar) → POST /api/webhooks/forms → CRM`.

### Contrato da API

`POST /api/webhooks/forms`, `@Public()`, cabeçalho `x-forms-token`.

```json
{
  "responseId": "id da resposta no Google",
  "submittedAt": "ISO 8601",
  "name": "texto",
  "phone": "opcional",
  "instagram": "opcional",
  "email": "opcional",
  "incomeBand": "R5_8K | R8_15K | R15_50K | R50K_PLUS | BELOW_5K | UNKNOWN",
  "answers": [{ "q": "pergunta", "a": "resposta" }]
}
```

- Zod `.strict()`, limites: nome 200, pergunta 300, resposta 5000, até 100 respostas.
- O Apps Script traduz o texto do Forms para esse contrato. Mudar uma pergunta no Forms mexe só no
  script, nunca na API.
- Token comparado com `timingSafeEqual`. Token errado ou integração desligada → **404**.
- Resposta 200 sem dado pessoal: `{ "status": "linked" | "created" | "discarded" | "duplicate" }`.
- O corpo nunca vai para log.

### Env (opcional, como o VAPID)

- `FORMS_WEBHOOK_TOKEN` (mínimo 32 caracteres): sem ele, a rota responde 404.
- `FORMS_OWNER_USERNAME`: usuário dono dos leads criados. Precisa existir, estar ativo e ter
  `canProspect`; se não, a resposta é recusada com 503 e auditoria, para o erro não passar em branco.

### Processamento (uma transação)

1. `responseId` já gravado → `duplicate`.
2. Normaliza telefone (E.164 BR), Instagram e e-mail; calcula os blind indexes.
3. `form_find_lead(phone_bidx, instagram, email_bidx)`, SECURITY DEFINER, ignora excluídos e
   anonimizados. Prioridade: telefone → Instagram → e-mail.
4. Achou → grava a resposta ligada ao lead, como o dono do lead (`withUser`). Status `linked`.
5. Não achou, `incomeBand` entre as faixas do CRM e telefone ou Instagram presentes → cria o lead e
   grava a resposta. Status `created`.
6. Não achou e não cumpre o item 5 → descarta. Auditoria `form.discarded`, só com o motivo
   (`LOW_INCOME`, `UNKNOWN_INCOME` ou `NO_CONTACT`). Status `discarded`.

**Lead criado:** dono = `FORMS_OWNER_USERNAME`, etapa `SONDAGEM`, origem nova `FORMULARIO` (rótulo
"Formulário"), faixa da resposta, perfil pelo gatilho existente, sem próximo contato. A origem vale
em filtros e na ficha, mas não aparece no cadastro manual.

### Banco

Tabela `form_responses`:

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid | PK |
| `response_id` | text | `UNIQUE`, idempotência |
| `lead_id` | uuid | FK `leads`, not null |
| `answers_enc` | bytea | JSON cifrado; a LGPD zera |
| `submitted_at` | timestamptz | horário do envio |
| `created_at` | timestamptz | default `now()` |

- RLS: `SELECT` para quem enxerga o lead. `npac_app` sem `UPDATE` e sem `DELETE`.
- `lead_timeline`: tipo novo `form.received`, `entity_id` = resposta, `fields` vazio.
- `notify_from_timeline`: para `form.received`, avisa dono + usuários ativos DIRETOR/HEAD e **não
  exclui o autor**. O autor registrado é o próprio dono, que com a regra atual ficaria sem aviso.
- `lead_source`: valor novo `FORMULARIO`, comparado como texto na migration.

### Telas

- **Sino:** texto "`<lead>` preencheu o formulário", sem nome de autor (`lib/activity-text.ts` e `inbox.tsx`).
- **Hoje:** bloco "Formulários novos" com os avisos `form.received` não lidos da pessoa, só nome e
  horário. Abrir a linha leva à ficha e marca como lido. Bloco oculto quando vazio.
- **Ficha:** card "Respostas do formulário", com perguntas e respostas decifradas.
- **Push:** "Novo formulário preenchido", sem nome ou contato. Depende do item 2 (`sw.js`) em produção.

## Configuração

Depois do deploy, uma vez:

1. Eu gero `FORMS_WEBHOOK_TOKEN` e defino as duas variáveis no Cubeship (com o seu sim).
2. Você abre o Forms → menu ⋮ → **Editor de scripts** e cola o script que eu entregar.
3. Em **Configurações do projeto → Propriedades do script**, cria `CRM_TOKEN` com o token.
4. Em **Acionadores → Adicionar**, escolhe "Do formulário" → "Ao enviar formulário" e autoriza.

**Provisório, já disponível:** Forms → **Respostas** → ⋮ → **Receber notificações por e-mail**.

**Dependência:** para escrever o script preciso do link do Forms, ou dos títulos exatos das perguntas
e das opções de renda. A API não depende disso.

## Testes

- API (e2e): token errado → 404; `linked` por telefone, Instagram e e-mail; `created`; `discarded`
  por cada motivo; `duplicate`; aviso chega ao dono e à liderança; o corpo não aparece em log.
- Banco: RLS de `form_responses`; `npac_app` sem UPDATE/DELETE; LGPD zera e-mail e respostas;
  duplicidade por e-mail.
- Web (e2e): e-mail no cadastro e na ficha; bloco do Hoje; card da ficha; nenhum `@` em URL.
