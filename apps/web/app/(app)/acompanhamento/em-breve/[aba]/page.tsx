import { notFound } from 'next/navigation';
import { EmBreve } from '@/components/acompanhamento/em-breve';

export const metadata = { title: 'Em breve' };

/** Fila, Plano e Reuniões saem daqui quando suas partes chegarem. */
const ABAS = new Set([
  'fila',
  'plano',
  'reunioes',
  'pmes',
  'linha-do-tempo',
  'envios',
  'eventos',
  'renovacoes',
]);

export default async function EmBrevePage({ params }: { params: Promise<{ aba: string }> }) {
  const { aba } = await params;
  if (!ABAS.has(aba)) notFound();
  return <EmBreve />;
}
