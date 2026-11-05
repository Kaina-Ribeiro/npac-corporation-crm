import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SOON } from '@/components/shell/nav-items';

type Props = { params: Promise<{ secao: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: SOON[(await params).secao] ?? 'Não encontrado' };
}

/** Seções da navegação que ainda não foram construídas. */
export default async function EmBrevePage({ params }: Props) {
  const title = SOON[(await params).secao];
  if (!title) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.04em]">{title}</h1>
      <section className="glass-card p-5">
        <h2 className="text-lg font-bold tracking-[-0.03em]">Em breve</h2>
        <p className="mt-1 text-sm text-ink2">Esta seção chega nas próximas etapas do CRM.</p>
      </section>
    </div>
  );
}
