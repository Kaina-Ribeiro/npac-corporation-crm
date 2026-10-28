import type { Metadata } from 'next';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Hoje' };

export default async function HojePage() {
  const me = await getSession();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.04em]">
          Olá, {me?.name}
        </h1>
        <p className="text-[15px] text-ink2">Sua lista do dia aparece aqui.</p>
      </div>
      <section className="glass-card p-5">
        <h2 className="text-lg font-bold tracking-[-0.03em]">Em breve</h2>
        <p className="mt-1 text-sm text-ink2">
          Atrasados, contatos e reuniões de hoje chegam na próxima etapa do CRM. Por enquanto, veja
          seus leads na aba Leads.
        </p>
      </section>
    </div>
  );
}
