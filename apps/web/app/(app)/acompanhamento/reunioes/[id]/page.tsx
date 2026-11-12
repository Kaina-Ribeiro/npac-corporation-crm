import type { Condutor, ReuniaoDTO } from '@npac/shared/mentoria';
import { notFound } from 'next/navigation';
import { ReuniaoRegistro } from '@/components/acompanhamento/reuniao-registro';
import { lerEu, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Reunião' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReuniaoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await sessaoDoModulo())) return null;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [reuniao, condutores, eu] = await Promise.all([
    apiGet<ReuniaoDTO>(`/api/mentoria/reunioes/${id}`),
    apiGet<Condutor[]>('/api/mentoria/reunioes/condutores'),
    lerEu(),
  ]);
  return <ReuniaoRegistro key={id} reuniao={reuniao} condutores={condutores} eu={eu} />;
}
