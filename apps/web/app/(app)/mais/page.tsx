import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ADMIN_ITEM, MORE_ITEMS } from '@/components/shell/nav-items';
import { InboxCard } from '@/components/inbox';
import { SearchButton } from '@/components/shell/command-palette';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { ThemeSwitch } from '@/components/shell/theme-switch';
import { getSession, ROLE_LABEL } from '@/lib/session';

export const metadata = { title: 'Mais' };

const HINT: Record<string, string> = {
  '/relatorios': 'Filtros, CSV e resumo',
  '/chat': 'Geral e conversas',
  '/equipe': 'Pessoas e números',
  '/playbook': 'Scripts de objeção',
  '/admin': 'Usuários, catálogo e LGPD',
};

/** No celular: perfil, demais seções (mesma ordem do desktop), aparência e sair. */
export default async function MorePage() {
  const me = await getSession();
  if (!me) redirect('/login');
  const items = [...MORE_ITEMS, ...(me.role === 'HEAD' ? [ADMIN_ITEM] : [])];
  const flags = [me.canProspect && 'Prospecta', me.canClose && 'Fecha'].filter(Boolean);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pt-2">
      <section className="glass-card flex items-center gap-4 p-5">
        <span
          aria-hidden="true"
          className="inline-flex size-16 flex-none items-center justify-center rounded-full bg-[linear-gradient(160deg,#7fe0a6,#1e9e70)] text-2xl font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_10px_24px_-10px_rgba(30,158,112,.6)]"
        >
          {me.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-[-0.03em]">{me.name}</h1>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-[var(--bg)]">
              {ROLE_LABEL[me.role]}
            </span>
            {flags.map((f) => (
              <span
                key={String(f)}
                className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-ink2"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </section>

      <SearchButton className="glass-card flex min-h-12 items-center gap-3 px-4 text-sm font-medium text-ink2 [&_kbd]:hidden [&_svg]:size-5" />

      <InboxCard />

      <nav aria-label="Mais seções" className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="glass-card flex min-h-28 flex-col justify-between gap-3 p-4 transition-transform active:scale-[.98]"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-black/5 text-ink dark:bg-white/10 [&_svg]:size-5">
              {item.icon}
            </span>
            <span>
              <b className="block font-semibold">{item.label}</b>
              <small className="block text-xs text-ink2">{HINT[item.href]}</small>
            </span>
          </Link>
        ))}
      </nav>

      <section className="glass-card flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold text-ink2">Aparência</h2>
        <ThemeSwitch />
      </section>

      <SignOutButton className="glass-card min-h-14 w-full text-base font-semibold text-danger" />

      <p className="text-center text-xs text-ink3">NPAC Corporation · área comercial</p>
    </div>
  );
}
