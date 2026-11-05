import type { FichaDetalhe } from '@npac/shared/mentoria';
import { notFound } from 'next/navigation';
import { FichaView } from '@/components/acompanhamento/ficha-view';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { ApiError, apiGet } from '@/lib/api';

export const metadata = { title: 'Ficha' };

/** Ficha da Linha do tempo. A URL leva só o UUID; abrir grava `mentoria.open` (D35). */
export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const { id } = await params;
  const ficha = await apiGet<FichaDetalhe>(`/api/mentoria/fichas/${encodeURIComponent(id)}`).catch(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    },
  );
  return <FichaView inicial={ficha} />;
}
