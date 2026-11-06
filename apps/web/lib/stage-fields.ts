import type { LostReason } from '@npac/shared/enums';
import { parseCents } from '@npac/shared/money';
import { brasiliaInput } from './client-api';
import { stageFieldsKind } from './stage-kind';

export { stageFieldsKind, stageNeedsFields, type StageFieldsKind } from './stage-kind';

/**
 * Campos por etapa (NPAC-38): Agendados pedem a reunião, Agendou Pagamento pede data + produto +
 * valor, Sem Perfil pede o motivo. A API cobra só na troca de etapa (409 com mensagem).
 * Sem 'use client': só funções, usadas pelo componente `StageFields` e pelas janelinhas.
 */
/** Rótulo do próximo contato conforme a etapa. */
export const nextContactLabel = (stage: string) =>
  stage === 'NO_SHOW'
    ? 'Tentar remarcar em'
    : stage === 'AGENDOU_PAGAMENTO'
      ? 'Pagamento combinado para'
      : 'Próximo contato';

/** O que vai no corpo de `POST /leads` e `PATCH /leads/:id` junto com a etapa. */
export type StageFieldsBody = {
  /** `null` = campo mostrado e vazio (no PATCH, apaga). Ausente = a etapa não usa o campo. */
  nextContactAt?: string | null;
  meeting?: { scheduledAt: string; closerId: string };
  paymentProductId?: string;
  paymentAmountCents?: number;
  /** Pagamento parcial (NPAC-41): entrada já paga; `null` = não é parcial (no PATCH, apaga). */
  paymentEntryCents?: number | null;
  lostReason?: LostReason;
  lostReasonOther?: string;
};

/** Nomes dos campos no formulário (prefixo `sf_` para não colidir com os dados do lead). */
export const SF = {
  next: 'sf_next',
  meetingAt: 'sf_meeting_at',
  meetingCloser: 'sf_meeting_closer',
  product: 'sf_product',
  amount: 'sf_amount',
  partial: 'sf_partial',
  entry: 'sf_entry',
  reason: 'sf_reason',
  reasonOther: 'sf_reason_other',
} as const;

/**
 * Lê os campos da etapa do formulário. `changed`: a etapa vai mudar (ou é o cadastro); só então os
 * dados são obrigatórios (lead antigo na etapa sem os dados continua editável, 3A). `withMeeting`:
 * a troca é para um Agendado sem reunião marcada. Lança `Error` com a mensagem para o usuário.
 */
export function readStageFields(
  stage: string,
  form: FormData,
  { changed, withMeeting }: { changed: boolean; withMeeting: boolean },
): StageFieldsBody {
  const get = (name: string) => String(form.get(name) ?? '').trim();
  const kind = stageFieldsKind(stage);
  if (kind === 'MEETING') {
    if (!changed || !withMeeting) return {};
    const at = get(SF.meetingAt);
    const closerId = get(SF.meetingCloser);
    if (!at || !closerId) throw new Error('Informe a data, a hora e o closer da reunião.');
    const scheduledAt = brasiliaInput(at)!;
    if (new Date(scheduledAt).getTime() <= Date.now())
      throw new Error('Escolha um horário futuro para a reunião.');
    return { meeting: { scheduledAt, closerId } };
  }
  if (kind === 'PAYMENT') {
    const next = get(SF.next);
    const product = get(SF.product);
    const amount = get(SF.amount);
    if (changed && (!next || !product || !amount))
      throw new Error('Informe a data combinada, o produto e o valor.');
    if (Boolean(product) !== Boolean(amount))
      throw new Error('Informe o produto e o valor combinados.');
    const body: StageFieldsBody = { nextContactAt: brasiliaInput(next) ?? null };
    if (product) {
      const cents = parseCents(amount);
      if (cents <= 0) throw new Error('Informe um valor maior que zero.');
      body.paymentProductId = product;
      body.paymentAmountCents = cents;
      // Pagamento parcial (NPAC-41): a entrada já paga fica entre zero e o valor combinado.
      if (form.get(SF.partial) === 'on') {
        const entry = get(SF.entry);
        if (!entry) throw new Error('Informe quanto já foi pago de entrada.');
        const entryCents = parseCents(entry);
        if (entryCents <= 0 || entryCents >= cents)
          throw new Error('A entrada precisa ser maior que zero e menor que o valor combinado.');
        body.paymentEntryCents = entryCents;
      } else body.paymentEntryCents = null;
    }
    return body;
  }
  if (kind === 'REASON') {
    const reason = get(SF.reason) as LostReason | '';
    if (!reason) {
      if (changed) throw new Error('Escolha o motivo.');
      return {};
    }
    const other = get(SF.reasonOther);
    if (reason === 'OUTRO' && !other) throw new Error('Escreva o motivo.');
    return { lostReason: reason, ...(reason === 'OUTRO' ? { lostReasonOther: other } : {}) };
  }
  return { nextContactAt: brasiliaInput(get(SF.next)) ?? null };
}

/** ISO → valor de `datetime-local` em Brasília. */
export const toBrasiliaInput = (iso: string | null | undefined) =>
  iso
    ? new Date(iso)
        .toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })
        .replace(' ', 'T')
        .slice(0, 16)
    : '';

/** Centavos → texto do campo de valor ("1500,00"). */
export const centsInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
