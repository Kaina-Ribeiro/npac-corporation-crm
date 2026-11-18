import { eq } from 'drizzle-orm';
import type { Tx } from './client.js';
import { products, user } from './schema/index.js';

// Atribuições iniciais são dados de implantação, não regras de autorização.
// Último número: renda extra do SDR por venda (NPAC-48, valores do Igor em 17/11/2026).
const CATALOG = [
  ['RDV', 'Mentoria RDV', 1800000, 'ronaldo@npac.com.br', 7000],
  ['MENTORIA_2M', 'Mentoria 2M', 3000000, 'ronaldo@npac.com.br', 9000],
  ['MENTORIA_6M', 'Mentoria 6M', 8000000, 'ronaldo@npac.com.br', 12000],
  ['NACAO_PROMO', 'Nação Promocional', 250000, 'sonia@npac.com.br', 500],
  ['NACAO_PADRAO', 'Nação Padrão', 300000, 'sonia@npac.com.br', 1000],
  ['NACAO_COMPLETO', 'Nação Completo', 350000, 'sonia@npac.com.br', 2000],
] as const;
export async function seedProducts(tx: Tx) {
  for (const [code, name, priceCents, email, sdrBonusCents] of CATALOG) {
    const [closer] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!closer) throw new Error('Closer do catálogo não encontrado');
    await tx
      .insert(products)
      .values({ code, name, priceCents, sdrBonusCents, closerId: closer.id })
      .onConflictDoNothing({ target: products.code });
  }
}
