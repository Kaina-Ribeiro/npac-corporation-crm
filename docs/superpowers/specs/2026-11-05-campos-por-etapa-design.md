# Campos por etapa — design

Status: **aprovada** (Gabriel, 05/11/2026: "1A 2A 3A" nas decisões abaixo) · nada implementado.

Fonte: pedido do cliente de 05/11/2026 (print do formulário "Novo lead") e respostas "1A, 2A, 3A" +
"no Outro do Sem Perfil, caixa para escrever o motivo". Regra: fazer o que foi pedido, sem extras.

## Pedido (resumo fiel)

- Ao mudar a etapa para **Agendado Direto** ou **Agendado do Follow**, o campo "Próximo contato"
  vira **data e hora da reunião**.
- Cada etapa pede o campo do seu sentido.
- **1A:** vale no cadastro **e** na ficha do lead.
- **2A:** Agendou Pagamento pede **data combinada do pagamento + produto + valor**.
- **3A:** Sem Perfil pede **motivo**: Sem renda · Sem interesse · Não respondeu · Outro. **Outro**
  abre uma caixa para escrever o motivo.

## Campos por etapa

| Etapa (`key`) | Campos | Obrigatório | Ao salvar |
|---|---|---|---|
| `SONDAGEM`, `EM_FOLLOW`, etapas criadas (`C_…`) | Próximo contato | não | igual a hoje |
| `AGENDADO_DIRETO` / `AGENDADO_FOLLOW` | Data e hora da reunião · Closer da reunião | sim | cria a reunião (origem `DIRETO` / `FOLLOW`) na mesma transação; lembretes rearmados |
| `AGENDOU_PAGAMENTO` | Data combinada do pagamento · Produto · Valor (R$) | sim | data vai para `next_contact_at` (cobrança aparece no Hoje); produto e valor no lead |
| `NO_SHOW` | Tentar remarcar em | não | vai para `next_contact_at` (só muda o rótulo) |
| `PERDIDO` (Sem Perfil) | Motivo · texto se "Outro" (≤ 80) | sim | limpa `next_contact_at` (sai do Hoje) |
| `VENDA` | — | — | continua só pelo registro da venda (`SALE_REQUIRED`) |

Detalhes:

- **Agendado com reunião já marcada** (futura, não cancelada, sem resultado): não pede de novo; mostra
  "Reunião marcada: 12/11, 15:00 com Sônia".
- **Valor** começa com o preço do produto (`products.price_cents`) e pode ser editado; centavos inteiros
  (`sh/money.ts`).
- **Registrar venda** de um lead em Agendou Pagamento já abre com o produto e o valor combinados.
- **Saiu da etapa:** produto, valor e motivo são apagados (são o estado atual, não histórico). A
  timeline registra só os nomes dos campos, como hoje.

## Regras no servidor (o web não é a única barreira)

Mesmo padrão da Venda: a API recusa a etapa sem os dados dela.

- `POST /leads` e `PATCH /leads/:id` aceitam, junto com `stageKey`:
  - `meeting: { scheduledAt, closerId }` para os dois Agendados;
  - `paymentProductId`, `paymentAmountCents` (+ `nextContactAt`) para Agendou Pagamento;
  - `lostReason`, `lostReasonOther` para Sem Perfil.
- Faltou → 409 com mensagem em português (`MEETING_REQUIRED`, `PAYMENT_REQUIRED`, `REASON_REQUIRED`).
- Reunião criada pelo mesmo código de `meetings.service.ts` (closer ativo com `canClose`, horário
  futuro, `recordActivity('meeting.scheduled')`, `reminders.rearm()` depois do commit).

## Banco (migration 0037)

- `leads.payment_product_id` (FK `products`), `leads.payment_amount_cents` (> 0): os dois juntos e só
  com etapa `AGENDOU_PAGAMENTO` (CHECK não vê a etapa, que é FK; regra na API + teste).
- Enum `lead_lost_reason` (`SEM_RENDA`, `SEM_INTERESSE`, `NAO_RESPONDEU`, `OUTRO`) + `leads.lost_reason`
  e `leads.lost_reason_other` (CHECK: texto só com `OUTRO`, 1–80, como `source_other`).
- `lgpd_anonymize` apaga `lost_reason_other` (texto livre do titular).
- **Closer:** hoje o gatilho `leads_guard_closer_fields` só deixa o closer mudar `stage_id`. Como é o
  closer quem marca Agendou Pagamento e Sem Perfil depois da reunião, o gatilho passa a aceitar
  também `payment_*`, `lost_reason*` e `next_contact_at` junto da etapa.

## Telas

- **Cadastro e ficha** (`lead-form.tsx`, `lead-detail.tsx`): os campos trocam ao escolher a etapa.
- **Pipeline (arrastar e seletor) e célula da lista** (`pipeline.tsx`, `leads-browser.tsx`): mudar
  para Agendado, Agendou Pagamento ou Sem Perfil **abre uma janelinha com os campos da etapa**;
  cancelar devolve o card/célula à etapa antiga. Um componente só para os campos, usado no cadastro,
  na ficha e na janelinha.
- **Ação em massa:** tira os dois Agendados e Agendou Pagamento (dados de cada lead); **Sem Perfil
  fica**, pedindo um motivo (e o texto, se Outro) que vale para todos os selecionados.
- **Leads que já estão** nessas etapas sem os dados **ficam como estão**: os campos só são exigidos
  na próxima mudança de etapa (a API só cobra quando `stageKey` muda). Nada de migração de dados.

## Decisões fechadas (Gabriel, 05/11/2026)

1. Pipeline e lista: janelinha com os campos (1A).
2. Massa: sem Agendados e Agendou Pagamento; Sem Perfil com motivo para todos (2A).
3. Leads existentes ficam como estão; exige só na próxima mudança (3A).

## Testes (antes do código)

- API: cada etapa sem os dados → 409; com os dados → lead + reunião numa transação (falha da reunião
  desfaz o lead); closer marca Agendou Pagamento e Sem Perfil; saiu da etapa → campos limpos.
- Banco: CHECK do motivo, gatilho do closer, LGPD apaga o texto.
- Playwright: cadastro em Agendado Direto cria a reunião; Sem Perfil + Outro exige o texto.

## Ordem

1. Fechar e commitar o **perfil pela faixa** (mesmo arquivo `lead-form.tsx`).
2. Migration 0037 + testes do banco.
3. API (cadastro, PATCH, 409s) + testes.
4. Telas (cadastro, ficha, pipeline/lista conforme resposta 1, massa conforme 2).
5. Suítes, Playwright, prints 375/768/1024/1440.
