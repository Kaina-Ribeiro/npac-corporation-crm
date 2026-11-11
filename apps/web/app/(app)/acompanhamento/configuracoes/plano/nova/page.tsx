import { MENTORIAS, type Mentoria } from '@npac/shared/mentoria';
import { notFound } from 'next/navigation';
import { PlanoModeloNova } from '@/components/acompanhamento/plano-modelo-admin';
import { lerEu, sessaoDoModulo } from '@/lib/acompanhamento';

export const metadata = { title: 'Nova linha do plano' };

export default async function PlanoModeloNovaPage({
  searchParams,
}: {
  searchParams: Promise<{ mentoria?: string }>;
}) {
  if (!(await sessaoDoModulo())) return null;
  if (!(await lerEu())?.admin) notFound();
  const { mentoria } = await searchParams;
  const m = MENTORIAS.includes(mentoria as Mentoria) ? (mentoria as Mentoria) : 'RDV';
  return <PlanoModeloNova mentoria={m} />;
}
