import type { FichaDTO, Responsavel } from '@npac/shared/mentoria';
import { notFound } from 'next/navigation';
import { Ficha } from '@/components/acompanhamento/ficha';
import { abaValida } from '@/components/acompanhamento/ui';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Ficha do mentorado' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FichaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  if (!(await sessaoDoModulo())) return null;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [ficha, responsaveis, { aba }] = await Promise.all([
    apiGet<FichaDTO>(`/api/mentoria/inscricoes/${id}`),
    apiGet<Responsavel[]>('/api/mentoria/responsaveis'),
    searchParams,
  ]);
  return <Ficha key={id} ficha={ficha} responsaveis={responsaveis} abaInicial={abaValida(aba)} />;
}
