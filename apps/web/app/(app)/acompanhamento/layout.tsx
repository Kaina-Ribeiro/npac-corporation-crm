import Link from 'next/link';
import { AbasMobile } from '@/components/acompanhamento/abas-mobile';
import { getSession } from '@/lib/session';
import { notFound, redirect } from 'next/navigation';
import { precisaMfa } from '@/lib/acompanhamento';

export const metadata = { title: { default: 'Acompanhamento', template: '%s · Acompanhamento' } };

/**
 * Casca do módulo de mentorados. Os módulos ficam na sidebar (desktop) e nas abas do rodapé
 * (celular); cada tela traz o próprio cabeçalho com o "Tudo salvo".
 */
export default async function AcompanhamentoLayout({ children }: { children: React.ReactNode }) {
  const me = await getSession();
  if (!me) redirect('/login');
  if (!me.modules.mentoria) notFound();
  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5">
      {precisaMfa(me) ? (
        <section className="glass-card flex max-w-xl flex-col gap-3 p-6">
          <h1 className="text-xl font-bold tracking-[-0.02em]">
            Ative a verificação em duas etapas
          </h1>
          <p className="text-sm text-ink2">
            O Acompanhamento guarda dados sensíveis dos mentorados (saúde, fé e dinheiro). Para usar
            o módulo, ligue o autenticador na sua conta.
          </p>
          <Link
            href="/conta/mfa"
            className="self-start rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-[var(--bg)]"
          >
            Ativar o autenticador
          </Link>
        </section>
      ) : (
        children
      )}
      <AbasMobile />
    </div>
  );
}
