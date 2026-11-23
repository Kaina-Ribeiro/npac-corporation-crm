import Link from 'next/link';
import type { Me } from '@/lib/session';

/** Aviso do 404: o mesmo texto fora da casca (`app/not-found.tsx`) e dentro dela (`app/(app)/not-found.tsx`). */
export function Aviso404({ me }: { me: Me | null }) {
  const modulo = !!me?.modules.mentoria;
  return (
    <section className="glass-card mx-auto mt-10 flex max-w-xl flex-col gap-3 p-6">
      <h1 className="text-xl font-bold tracking-[-0.02em]">
        {me?.role === 'ACOMPANHAMENTO'
          ? 'Esta tela não faz parte do seu acesso.'
          : 'Página não encontrada.'}
      </h1>
      <p className="text-sm text-ink2">
        {modulo
          ? 'Seu trabalho fica no Acompanhamento de mentorados.'
          : 'O endereço pode estar errado ou a página saiu do ar.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={modulo ? '/acompanhamento' : '/'}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-[var(--bg)]"
        >
          {modulo ? 'Ir para o Acompanhamento' : 'Voltar ao início'}
        </Link>
      </div>
    </section>
  );
}
