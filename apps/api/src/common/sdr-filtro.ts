import type { AuthUser } from '@npac/shared';

/**
 * Filtro de SDR (NPAC-66, Igor 23/11/2026): o SDR vê só os próprios números, qualquer que seja o
 * `sdrId` pedido (um cookie antigo com outro SDR também cai aqui). Liderança e closer escolhem.
 * A RLS já limita o SDR aos leads dele; isto fecha também as vendas e marcações por `sdr_id`.
 */
export const sdrDoFiltro = (u: Pick<AuthUser, 'id' | 'role'>, pedido: string | undefined) =>
  u.role === 'SDR' ? u.id : pedido;
