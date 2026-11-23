import { deals, meetings, pipelineStages, products, sdrSaleMarks, type Tx } from '@npac/db';
import type { AuthUser } from '@npac/shared';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';

/**
 * Venda marcada pelo SDR (NPAC-48): grava a renda extra do SDR do lead com o valor do catálogo de
 * hoje (1A). Vale para "Marcar venda" na ficha, para o cadastro em Venda Fechada e para a venda
 * registrada de um lead em Agendou Pagamento (NPAC-59). A saída (lead deixa a Venda, venda
 * estornada) é por gatilho no banco (0066).
 */
export async function recordSaleMark(
  tx: Tx,
  u: AuthUser,
  mark: { leadId: string; sdrId: string; productId: string; meetingId: string; markedAt?: Date },
) {
  const [p] = await tx
    .select({ bonusCents: products.sdrBonusCents })
    .from(products)
    .where(eq(products.id, mark.productId));
  await tx.insert(sdrSaleMarks).values({ ...mark, bonusCents: p?.bonusCents ?? 0, markedBy: u.id });
}

/**
 * NPAC-59 (Igor, 23/11/2026, "A"): quem põe o lead em Agendou Pagamento com o produto já fez a venda
 * do SDR. Ao registrar a venda (closer ou liderança), o SDR do lead ganha a renda extra do produto
 * informado no pagamento (a renda segue o produto do SDR, 17/11), ligada à reunião realizada mais
 * recente, na data do registro. Sem reunião realizada ou com marcação ativa, nada muda. Chame antes
 * de limpar os campos do pagamento no lead.
 */
export async function recordPaymentSaleMark(
  tx: Tx,
  u: AuthUser,
  lead: { id: string; sdrId: string; stageId: string; paymentProductId: string | null },
) {
  if (!lead.paymentProductId) return;
  const [stage] = await tx
    .select({ key: pipelineStages.key })
    .from(pipelineStages)
    .where(eq(pipelineStages.id, lead.stageId));
  if (stage?.key !== 'AGENDOU_PAGAMENTO') return;
  const [active] = await tx
    .select({ id: sdrSaleMarks.id })
    .from(sdrSaleMarks)
    .where(and(eq(sdrSaleMarks.leadId, lead.id), isNull(sdrSaleMarks.canceledAt)));
  if (active) return;
  const [meeting] = await tx
    .select({ id: meetings.id })
    .from(meetings)
    .where(
      and(eq(meetings.leadId, lead.id), eq(meetings.outcome, 'DONE'), isNull(meetings.canceledAt)),
    )
    .orderBy(desc(meetings.scheduledAt), desc(meetings.id))
    .limit(1);
  if (!meeting) return;
  await recordSaleMark(tx, u, {
    leadId: lead.id,
    sdrId: lead.sdrId,
    productId: lead.paymentProductId,
    meetingId: meeting.id,
  });
}

/** A renda extra do SDR existe desde 17/11/2026 (0066); a 0079 usa o mesmo corte. */
const RENDA_DESDE = new Date('2026-11-17T03:00:00Z');

/**
 * NPAC-62: a reunião realizada lançada depois (horário passado) completa a venda que já estava
 * registrada sem ela. Lead em Venda, venda ativa vinda de Agendou Pagamento, fechada depois da
 * reunião e desde 17/11, sem marcação ativa: o SDR do lead ganha a renda extra do produto da venda,
 * na data da venda (como a 0079).
 */
export async function recordLoggedMeetingSaleMark(
  tx: Tx,
  u: AuthUser,
  lead: { id: string; sdrId: string; stageId: string },
  meeting: { id: string; scheduledAt: Date },
) {
  const [stage] = await tx
    .select({ key: pipelineStages.key })
    .from(pipelineStages)
    .where(eq(pipelineStages.id, lead.stageId));
  if (stage?.key !== 'VENDA') return;
  const [active] = await tx
    .select({ id: sdrSaleMarks.id })
    .from(sdrSaleMarks)
    .where(and(eq(sdrSaleMarks.leadId, lead.id), isNull(sdrSaleMarks.canceledAt)));
  if (active) return;
  const [deal] = await tx
    .select({ productId: deals.productId, closedAt: deals.closedAt })
    .from(deals)
    .innerJoin(pipelineStages, eq(pipelineStages.id, deals.previousStageId))
    .where(
      and(
        eq(deals.leadId, lead.id),
        isNull(deals.reversedAt),
        eq(pipelineStages.key, 'AGENDOU_PAGAMENTO'),
        gte(deals.closedAt, RENDA_DESDE),
      ),
    )
    .limit(1);
  if (!deal || meeting.scheduledAt > deal.closedAt) return;
  await recordSaleMark(tx, u, {
    leadId: lead.id,
    sdrId: lead.sdrId,
    productId: deal.productId,
    meetingId: meeting.id,
    markedAt: deal.closedAt,
  });
}
