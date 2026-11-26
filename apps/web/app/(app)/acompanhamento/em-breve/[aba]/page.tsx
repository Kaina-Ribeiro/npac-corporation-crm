import { notFound, redirect } from 'next/navigation';
import { EmBreve } from '@/components/acompanhamento/em-breve';

export const metadata = { title: 'Em breve' };

/**
 * As abas que ainda não saíram (D8). A 7, "PMEs e ciclos", saiu na Fase 2 (E22); Envios físicos, no
 * NPAC-56; Renovações e gestão, no NPAC-79.
 */
const ABAS = new Set(['plano', 'linha-do-tempo', 'eventos']);
const SAIRAM: Record<string, string> = {
  pmes: '/acompanhamento/pmes',
  envios: '/acompanhamento/envios',
  renovacoes: '/acompanhamento/renovacoes',
};

export default async function EmBrevePage({ params }: { params: Promise<{ aba: string }> }) {
  const { aba } = await params;
  if (SAIRAM[aba]) redirect(SAIRAM[aba]);
  if (!ABAS.has(aba)) notFound();
  return <EmBreve />;
}
