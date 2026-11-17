import type { PmeDTO } from '@npac/shared/mentoria';
import { notFound } from 'next/navigation';
import { PmeForm } from '@/components/acompanhamento/pmes-admin';
import { lerEu, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'PMEs' };

export default async function PmePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await sessaoDoModulo())) return null;
  if (!(await lerEu())?.admin) notFound();
  const { id } = await params;
  const pme = (await apiGet<PmeDTO[]>('/api/mentoria/pmes')).find((p) => p.id === id);
  if (!pme) notFound();
  return <PmeForm key={id} pme={pme} />;
}
