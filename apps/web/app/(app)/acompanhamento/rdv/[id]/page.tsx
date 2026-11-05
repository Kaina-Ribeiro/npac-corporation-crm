import type { RdvDetalhe } from '@npac/shared/mentoria';
import { notFound } from 'next/navigation';
import { IndicadorSalvo } from '@/components/acompanhamento/indicador-salvo';
import { RdvFicha } from '@/components/acompanhamento/rdv-ficha';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { ApiError, apiGet } from '@/lib/api';

export const metadata = { title: 'Ficha RDV' };

/** Ficha do RDV. A URL leva só o UUID; abrir grava `mentoria.open` (D35). */
export default async function RdvFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const { id } = await params;
  const pessoa = await apiGet<RdvDetalhe>(`/api/mentoria/rdv/${encodeURIComponent(id)}`).catch(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    },
  );
  return (
    <>
      {/* A ficha não tem H1 de módulo: o indicador fica numa linha própria no topo. */}
      <div className="flex justify-end">
        <IndicadorSalvo />
      </div>
      <RdvFicha inicial={pessoa} />
    </>
  );
}
