import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { leads, meetings, products, user, type Tx } from '@npac/db';
import {
  MEETING_ORIGIN_BY_STAGE,
  stageAllowedForBand,
  type IncomeBand,
  type LostReason,
  type Role,
} from '@npac/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';

/**
 * Campos por etapa (NPAC-38, pedido do cliente de 05/11/2026): Agendados pedem a reunião,
 * Agendou Pagamento pede data + produto + valor (+ entrada já paga, se parcial: NPAC-41), Sem Perfil pede o motivo. A API recusa a troca
 * de etapa sem eles (409), como a Venda; leads que já estão na etapa ficam como estão (3A).
 * O SDR informa só produto, closer e se já pagou entrada; o closer completa o resto (item 13).
 */
export const meetingRequired = () =>
  new ConflictException({
    code: 'MEETING_REQUIRED',
    message: 'Para mover para Agendado, informe a data, a hora e o closer da reunião.',
  });
export const paymentRequired = (message = 'informe a data combinada, o produto e o valor.') =>
  new ConflictException({
    code: 'PAYMENT_REQUIRED',
    message: `Para mover para Agendou pagamento, ${message}`,
  });
export const reasonRequired = () =>
  new ConflictException({
    code: 'REASON_REQUIRED',
    message: 'Para mover para Sem perfil, escolha o motivo (e escreva qual, se for Outro).',
  });

/** "Descobrindo renda" (Igor, 10/11/2026): só em Criando Relacionamento e sem reunião nem venda. */
export const incomeRequired = (action = 'mudar a etapa') =>
  new ConflictException({
    code: 'INCOME_REQUIRED',
    message: `O lead está em Descobrindo renda. Informe a faixa de renda antes de ${action}.`,
  });
export function assertIncomeStage(band: IncomeBand, stageKey: string) {
  if (!stageAllowedForBand(band, stageKey)) throw incomeRequired();
}
/** Reunião e venda só depois de descobrir a renda. */
export async function assertIncomeKnown(tx: Tx, leadId: string, action: string) {
  const [row] = await tx.select({ band: leads.incomeBand }).from(leads).where(eq(leads.id, leadId));
  if (row?.band === 'DESCOBRINDO') throw incomeRequired(action);
}

/** O que o pedido traz para a etapa (cadastro ou PATCH). */
export interface StageFieldsInput {
  meeting?: { scheduledAt: Date; closerId: string };
  paymentProductId?: string;
  paymentAmountCents?: number;
  paymentEntryCents?: number | null;
  paymentCloserId?: string;
  paymentEntryPaid?: boolean;
  lostReason?: LostReason;
  lostReasonOther?: string;
  nextContactAt?: Date | null;
}

/** Estado atual do lead nos campos da etapa (vazio no cadastro). */
export interface StageState {
  paymentProductId: string | null;
  paymentAmountCents: number | null;
  paymentEntryCents: number | null;
  paymentEntryPaid: boolean;
  lostReason: LostReason | null;
  lostReasonOther: string | null;
  nextContactAt: Date | null;
}

export const EMPTY_STAGE_STATE: StageState = {
  paymentProductId: null,
  paymentAmountCents: null,
  paymentEntryCents: null,
  paymentEntryPaid: false,
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

/** O que o closer do lead grava sem trocar a etapa, para completar o pagamento (item 13). */
export const PAYMENT_COMPLETION_FIELDS = [
  'stageKey',
  'nextContactAt',
  'paymentAmountCents',
  'paymentEntryCents',
] as const;

/** Nome do campo na timeline (lista fechada no banco; nunca o valor). */
export const timelineField = (k: string) =>
  k === 'paymentProductId' ||
  k === 'paymentAmountCents' ||
  k === 'paymentEntryCents' ||
  k === 'paymentEntryPaid' ||
  k === 'paymentCloserId'
    ? 'payment'
    : k === 'lostReasonOther'
      ? 'lostReason'
      : k;

export interface ResolvedStageFields {
  /** Valores a gravar no lead (já limpos fora da etapa). */
  values: StageState;
  /** Reunião a criar depois de gravar o lead (mesma transação). */
  meeting?: { scheduledAt: Date; closerId: string; origin: 'DIRETO' | 'FOLLOW' };
  /** Closer escolhido pelo SDR (vai em `leads.closer_id`). */
  closerId?: string;
  /** O SDR entregou o pagamento a um closer: registrar `payment.pending` depois de gravar. */
  notifyCloser?: boolean;
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
    role: Role;
    /** Closer atual do lead (nulo no cadastro). */
    closerId?: string | null;
    /** Saindo de Agendou Pagamento: a data combinada não vira próximo contato (item 13). */
    leavingPayment?: boolean;
  },
): Promise<ResolvedStageFields> {
  const { target, changed, input, old } = opts;
  const sdr = opts.role === 'SDR';
  // Closer do lead pela etapa é coisa do SDR; a liderança usa `closerId`.
  if (input.paymentCloserId !== undefined) {
    if (!sdr) throw new BadRequestException('Use o closer do lead.');
    if (target !== 'AGENDOU_PAGAMENTO') throw new ForbiddenException();
  }
  const values: StageState = {
    ...EMPTY_STAGE_STATE,
    nextContactAt:
      input.nextContactAt !== undefined
        ? input.nextContactAt
        : opts.leavingPayment
          ? null
          : old.nextContactAt,
  };
  let meeting: ResolvedStageFields['meeting'];
  let closerId: string | undefined;
  let notifyCloser = false;

  const origin = MEETING_ORIGIN_BY_STAGE[target];
  if (origin && changed) {
    if (input.meeting) meeting = { ...input.meeting, origin };
    else if (!opts.leadId || !(await hasOpenMeeting(tx, opts.leadId))) throw meetingRequired();
  }

  if (target === 'AGENDOU_PAGAMENTO' && sdr) {
    Object.assign(values, sdrPaymentValues(input, old, changed));
    const closer = input.paymentCloserId ?? opts.closerId ?? null;
    if (values.paymentProductId !== null && !closer)
      throw paymentRequired('informe o produto e o closer.');
    if (input.paymentProductId) await assertActiveProduct(tx, input.paymentProductId);
    if (input.paymentCloserId) {
      await assertActiveCloser(tx, input.paymentCloserId);
      closerId = input.paymentCloserId;
      notifyCloser = changed || closerId !== opts.closerId;
    }
  } else if (target === 'AGENDOU_PAGAMENTO') {
    // Completar o pagamento do SDR pede a data combinada junto com o valor.
    const completing =
      !changed && old.paymentAmountCents === null && input.paymentAmountCents !== undefined;
    if (
      (changed &&
        (!input.nextContactAt ||
          !input.paymentProductId ||
          input.paymentAmountCents === undefined)) ||
      (completing && !values.nextContactAt)
    )
      throw paymentRequired();
    values.paymentProductId = input.paymentProductId ?? old.paymentProductId;
    values.paymentAmountCents = input.paymentAmountCents ?? old.paymentAmountCents;
    if (values.paymentAmountCents !== null && values.paymentProductId === null)
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
    // Quem tem o valor decide pela entrada; sem mexer nela, vale o que o SDR marcou.
    values.paymentEntryPaid =
      values.paymentEntryCents !== null ||
      (!changed && input.paymentEntryCents === undefined && old.paymentEntryPaid);
    if (input.paymentProductId) await assertActiveProduct(tx, input.paymentProductId);
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

  return { values, meeting, closerId, notifyCloser };
}

/**
 * Agendou Pagamento pelo SDR (item 13, 2A): só produto, closer e "já pagou uma entrada". Valor,
 * entrada e data são do closer e da liderança; depois de completado, o SDR não mexe mais.
 */
function sdrPaymentValues(
  input: StageFieldsInput,
  old: StageState,
  changed: boolean,
): Partial<StageState> {
  if (
    input.paymentAmountCents !== undefined ||
    input.paymentEntryCents !== undefined ||
    input.nextContactAt !== undefined
  )
    throw new ForbiddenException('Valor, entrada e data do pagamento ficam com o closer.');
  if (
    !changed &&
    old.paymentAmountCents !== null &&
    (input.paymentProductId !== undefined ||
      input.paymentCloserId !== undefined ||
      input.paymentEntryPaid !== undefined)
  )
    throw new ForbiddenException('O closer já completou este pagamento.');
  if (changed && (!input.paymentProductId || !input.paymentCloserId))
    throw paymentRequired('informe o produto e o closer.');
  return {
    paymentProductId: input.paymentProductId ?? (changed ? null : old.paymentProductId),
    paymentAmountCents: changed ? null : old.paymentAmountCents,
    paymentEntryCents: changed ? null : old.paymentEntryCents,
    paymentEntryPaid: input.paymentEntryPaid ?? (changed ? false : old.paymentEntryPaid),
    nextContactAt: changed ? null : old.nextContactAt,
  };
}

async function assertActiveProduct(tx: Tx, id: string) {
  const [p] = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, id), eq(products.active, true)));
  if (!p) throw new BadRequestException('Produto inválido');
}

async function assertActiveCloser(tx: Tx, id: string) {
  const [c] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, id), eq(user.active, true), eq(user.canClose, true)));
  if (!c) throw new BadRequestException('O closer precisa ser um usuário ativo que fecha vendas');
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
