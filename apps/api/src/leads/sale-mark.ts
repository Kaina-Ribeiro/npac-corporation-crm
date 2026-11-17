import { products, sdrSaleMarks, type Tx } from '@npac/db';
import type { AuthUser } from '@npac/shared';
import { eq } from 'drizzle-orm';

/**
 * Venda marcada pelo SDR (NPAC-48): grava a renda extra do SDR do lead com o valor do catálogo de
 * hoje (1A). Vale para "Marcar venda" na ficha e para o cadastro em Venda Fechada. A saída (lead
 * deixa a Venda, venda estornada) é por gatilho no banco (0066).
 */
export async function recordSaleMark(
  tx: Tx,
  u: AuthUser,
  mark: { leadId: string; sdrId: string; productId: string; meetingId: string },
) {
  const [p] = await tx
    .select({ bonusCents: products.sdrBonusCents })
    .from(products)
    .where(eq(products.id, mark.productId));
  await tx.insert(sdrSaleMarks).values({ ...mark, bonusCents: p?.bonusCents ?? 0, markedBy: u.id });
}
