import type { PaginaFichas } from '@npac/shared/mentoria';
import { FichasLista } from '@/components/acompanhamento/fichas-lista';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { apiPost } from '@/lib/api';

export const metadata = { title: 'Linha do tempo' };

/** Módulo 2: fichas de evolução antes e depois, A–Z. Busca por POST. */
export default async function LinhaDoTempoPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const inicial = await apiPost<PaginaFichas>('/api/mentoria/fichas/search', {});
  return <FichasLista inicial={inicial} />;
}
