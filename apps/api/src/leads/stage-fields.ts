import { BadRequestException, ConflictException } from '@nestjs/common';
import { meetings, products, type Tx } from '@npac/db';
import { MEETING_ORIGIN_BY_STAGE, type LostReason } from '@npac/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';

/**
 * Campos por etapa (NPAC-38, pedido do cliente de 05/11/2026): Agendados pedem a reunião,
 * Agendou Pagamento pede data + produto + valor (+ entrada já paga, se parcial: NPAC-41), Sem Perfil pede o motivo. A API recusa a troca
 * de etapa sem eles (409), como a Venda; leads que já estão na etapa ficam como estão (3A).
 */
export const meetingRequired = () =>
  new ConflictException({
    code: 'MEETING_REQUIRED',
    message: 'Para mover para Agendado, informe a data, a hora e o closer da reunião.',
  });
export const paymentRequired = () =>
  new ConflictException({
    code: 'PAYMENT_REQUIRED',
    message: 'Para mover para Agendou pagamento, informe a data combinada, o produto e o valor.',
  });
export const reasonRequired = () =>
  new ConflictException({
    code: 'REASON_REQUIRED',
    message: 'Para mover para Sem perfil, escolha o motivo (e escreva qual, se for Outro).',
  });

/** O que o pedido traz para a etapa (cadastro ou PATCH). */
export interface StageFieldsInput {
  meeting?: { scheduledAt: Date; closerId: string };
  paymentProductId?: string;
  paymentAmountCents?: number;
  paymentEntryCents?: number | null;
  lostReason?: LostReason;
  lostReasonOther?: string;
  nextContactAt?: Date | null;
}

/** Estado atual do lead nos campos da etapa (vazio no cadastro). */
export interface StageState {
  paymentProductId: string | null;
  paymentAmountCents: number | null;
  paymentEntryCents: number | null;
  lostReason: LostReason | null;
  lostReasonOther: string | null;
  nextContactAt: Date | null;
}

export const EMPTY_STAGE_STATE: StageState = {
  paymentProductId: null,
  paymentAmountCents: null,
  paymentEntryCents: null,
  lostReason: null,
  lostReasonOther: null,
  nextContactAt: null,
};

/** Campos que acompanham a troca de etapa (o closer só os grava junto dela). */
export const STAGE_DATA_FIELDS = [
  'nextContactAt',
  'paymentProductId',
  'paymentAmountCents',
  'paymentEntryCents',
  'lostReason',
  'lostReasonOther',
] as const;

/** Nome do campo na timeline (lista fechada no banco; nunca o valor). */
export const timelineField = (k: string) =>
  k === 'paymentProductId' || k === 'paymentAmountCents' || k === 'paymentEntryCents'
    ? 'payment'
    : k === 'lostReasonOther'
      ? 'lostReason'
      : k;

export interface ResolvedStageFields {
  /** Valores a gravar no lead (já limpos fora da etapa). */
  values: StageState;
  /** Reunião a criar depois de gravar o lead (mesma transação). */
  meeting?: { scheduledAt: Date; closerId: string; origin: 'DIRETO' | 'FOLLOW' };
}

/**
 * Resolve os campos da etapa de destino. `changed`: a etapa muda (ou é o cadastro); só então os
 * dados são exigidos. Fora da etapa, pagamento e motivo são apagados (são estado atual).
 */
export async function resolveStageFields(
  tx: Tx,
  opts: {
    leadId?: string;
    target: string;
    changed: boolean;
    input: StageFieldsInput;
    old: StageState;
  },
): Promise<ResolvedStageFields> {
  const { target, changed, input, old } = opts;
  const values: StageState = {
    ...EMPTY_STAGE_STATE,
    nextContactAt: input.nextContactAt !== undefined ? input.nextContactAt : old.nextContactAt,
  };
  let meeting: ResolvedStageFields['meeting'];

  const origin = MEETING_ORIGIN_BY_STAGE[target];
  if (origin && changed) {
    if (input.meeting) meeting = { ...input.meeting, origin };
    else if (!opts.leadId || !(await hasOpenMeeting(tx, opts.leadId))) throw meetingRequired();
  }

  if (target === 'AGENDOU_PAGAMENTO') {
    if (
      changed &&
      (!input.nextContactAt || !input.paymentProductId || input.paymentAmountCents === undefined)
    )
      throw paymentRequired();
    values.paymentProductId = input.paymentProductId ?? old.paymentProductId;
    values.paymentAmountCents = input.paymentAmountCents ?? old.paymentAmountCents;
    if ((values.paymentProductId === null) !== (values.paymentAmountCents === null))
      throw new BadRequestException('Informe o produto e o valor combinados');
    // Pagamento parcial (NPAC-41): a entrada já paga fica abaixo do valor combinado.
    values.paymentEntryCents =
      input.paymentEntryCents !== undefined
        ? input.paymentEntryCents
        : changed
          ? null
          : old.paymentEntryCents;
    if (
      values.paymentEntryCents !== null &&
      (values.paymentAmountCents === null || values.paymentEntryCents >= values.paymentAmountCents)
    )
      throw new BadRequestException('A entrada precisa ser menor que o valor combinado');
    if (input.paymentProductId) {
      const [p] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, input.paymentProductId), eq(products.active, true)));
      if (!p) throw new BadRequestException('Produto inválido');
    }
  }

  if (target === 'PERDIDO') {
    const reason = input.lostReason ?? (changed ? null : old.lostReason);
    const other =
      reason !== 'OUTRO'
        ? null
        : input.lostReasonOther !== undefined
          ? input.lostReasonOther
          : changed || input.lostReason !== undefined
            ? null
            : old.lostReasonOther;
    if ((changed || input.lostReason !== undefined) && (!reason || (reason === 'OUTRO' && !other)))
      throw reasonRequired();
    values.lostReason = reason;
    values.lostReasonOther = other;
    // Sem Perfil sai do Hoje.
    if (changed) values.nextContactAt = null;
  }

  return { values, meeting };
}

/** Reunião marcada: futura, não cancelada e sem resultado. Agendado com ela não pede outra. */
async function hasOpenMeeting(tx: Tx, leadId: string) {
  const [m] = await tx
    .select({ id: meetings.id })
    .from(meetings)
    .where(
      and(
        eq(meetings.leadId, leadId),
        isNull(meetings.canceledAt),
        isNull(meetings.outcome),
        gt(meetings.scheduledAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(m);
}
