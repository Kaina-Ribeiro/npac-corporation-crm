import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AbasMobile } from '@/components/acompanhamento/abas-mobile';
import { BarraModulo } from '@/components/acompanhamento/barra-modulo';
import { lerEu, podeCadastrar, precisaMfa } from '@/lib/acompanhamento';
import { getSession } from '@/lib/session';
import './modulo.css';

export const metadata = { title: { default: 'Acompanhamento', template: '%s · Acompanhamento' } };

/**
 * Casca do módulo de mentorados: busca no topo, telas no meio e abas no rodapé do celular. O menu
 * do computador fica na sidebar do CRM (`shell/nav-menu.tsx`).
 */
export default async function AcompanhamentoLayout({ children }: { children: React.ReactNode }) {
  const me = await getSession();
  if (!me) redirect('/login');
  if (!me.modules.mentoria) notFound();
  if (precisaMfa(me))
    return (
      <section className="glass-card mx-auto flex max-w-xl flex-col gap-3 p-6">
        <h1 className="text-xl font-bold tracking-[-0.02em]">Ative a verificação em duas etapas</h1>
        <p className="text-sm text-ink2">
          O Acompanhamento guarda dados sensíveis dos mentorados (saúde, fé e dinheiro). Para usar o
          módulo, ligue o autenticador na sua conta.
        </p>
        <Link
          href="/conta/mfa"
          className="self-start rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-[var(--bg)]"
        >
          Ativar o autenticador
        </Link>
      </section>
    );
  const eu = await lerEu();
  return (
    <div className="ac">
      <BarraModulo inicial={me.name.slice(0, 1)} />
      {children}
      <AbasMobile podeCriar={podeCadastrar(eu)} />
    </div>
  );
}
