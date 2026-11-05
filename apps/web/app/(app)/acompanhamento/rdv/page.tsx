import type { PaginaRdv } from '@npac/shared/mentoria';
import { RdvLista } from '@/components/acompanhamento/rdv-lista';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { apiPost } from '@/lib/api';

export const metadata = { title: 'Linha do tempo RDV' };

/** Módulo 3: pessoas ou casais da trilha RDV, A–Z. Busca por POST. */
export default async function RdvPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const inicial = await apiPost<PaginaRdv>('/api/mentoria/rdv/search', {});
  return <RdvLista inicial={inicial} />;
}
