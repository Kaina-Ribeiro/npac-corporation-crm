import { notFound, redirect } from 'next/navigation';
import { EmBreve } from '@/components/acompanhamento/em-breve';

export const metadata = { title: 'Em breve' };

/** As abas que ainda não saíram (D8). A 7, "PMEs e ciclos", saiu na Fase 2 (E22). */
const ABAS = new Set(['plano', 'linha-do-tempo', 'envios', 'eventos', 'renovacoes']);

export default async function EmBrevePage({ params }: { params: Promise<{ aba: string }> }) {
  const { aba } = await params;
  if (aba === 'pmes') redirect('/acompanhamento/pmes');
  if (!ABAS.has(aba)) notFound();
  return <EmBreve />;
}
