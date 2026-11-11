import type { PlanoModeloLinha } from '@npac/shared/mentoria';
import { notFound } from 'next/navigation';
import { PlanoModeloLinhaForm } from '@/components/acompanhamento/plano-modelo-admin';
import { lerEu, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Plano-modelo' };

export default async function PlanoModeloLinhaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await sessaoDoModulo())) return null;
  if (!(await lerEu())?.admin) notFound();
  const { id } = await params;
  const linha = (await apiGet<PlanoModeloLinha[]>('/api/mentoria/plano-modelo')).find(
    (l) => l.id === id,
  );
  if (!linha) notFound();
  return <PlanoModeloLinhaForm key={id} linha={linha} />;
}
