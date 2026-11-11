import type { AcaoDTO } from '@npac/shared/mentoria';
import { notFound } from 'next/navigation';
import { PlanoAcao } from '@/components/acompanhamento/plano-acao';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Ação do plano' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AcaoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await sessaoDoModulo())) return null;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const acao = await apiGet<AcaoDTO>(`/api/mentoria/acoes/${id}`);
  return <PlanoAcao key={id} acao={acao} />;
}
