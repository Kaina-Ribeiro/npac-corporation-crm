import { notFound } from 'next/navigation';
import { EmBreve } from '@/components/acompanhamento/em-breve';

export const metadata = { title: 'Em breve' };

/** As abas fora da Fase 1 (D8). */
const ABAS = new Set(['plano', 'pmes', 'linha-do-tempo', 'envios', 'eventos', 'renovacoes']);

export default async function EmBrevePage({ params }: { params: Promise<{ aba: string }> }) {
  const { aba } = await params;
  if (!ABAS.has(aba)) notFound();
  return <EmBreve />;
}
