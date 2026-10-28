import { eq } from 'drizzle-orm';
import type { Tx } from './client.js';
import { products, user } from './schema/index.js';

// Atribuições iniciais são dados de implantação, não regras de autorização.
const CATALOG = [
  ['RDV', 'Mentoria RDV', 1800000, 'ronaldo@npac.com.br'],
  ['MENTORIA_2M', 'Mentoria 2 Meses', 3000000, 'ronaldo@npac.com.br'],
  ['MENTORIA_6M', 'Mentoria 6 Meses', 8000000, 'ronaldo@npac.com.br'],
  ['NACAO_PROMO', 'Nação Promocional', 250000, 'sonia@npac.com.br'],
  ['NACAO_PADRAO', 'Nação Padrão', 300000, 'sonia@npac.com.br'],
  ['NACAO_COMPLETO', 'Nação Completo', 350000, 'sonia@npac.com.br'],
] as const;
export async function seedProducts(tx: Tx) {
  for (const [code, name, priceCents, email] of CATALOG) {
    const [closer] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!closer) throw new Error('Closer do catálogo não encontrado');
    await tx
      .insert(products)
      .values({ code, name, priceCents, closerId: closer.id })
      .onConflictDoNothing({ target: products.code });
  }
}
