import { ATUA_COMO, temCaixas } from '@npac/shared/cargos';
import { hasCommercialAccess, isLeader, MFA_LIGADO } from '@npac/shared/enums';
import { pendingAccessRequests } from '@/lib/access-requests';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ACOMPANHAMENTO_ITEM, ADMIN_ITEM, MORE_ITEMS } from '@/components/shell/nav-items';
import { AbasMobile } from '@/components/acompanhamento/abas-mobile';
import { ChatBadge, InboxCard } from '@/components/inbox';
import { SearchButton } from '@/components/shell/command-palette';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { ThemeSwitch } from '@/components/shell/theme-switch';
import { RoleTag } from '@/components/role-tag';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Mais' };

const HINT: Record<string, string> = {
  '/relatorios': 'Filtros, CSV e resumo',
  '/chat': 'Geral e conversas',
  '/equipe': 'Pessoas e números',
  '/playbook': 'Scripts de objeção',
  '/admin': 'Usuários, catálogo e LGPD',
  '/acompanhamento': 'Mentorados e fichas',
};

/** No celular: perfil, demais seções (mesma ordem do desktop), aparência e sair. */
export default async function MorePage() {
  const me = await getSession();
  if (!me) redirect('/login');
  // Cargo Acompanhamento: só o módulo, sem Avisos nem push (são do comercial).
  const commercial = hasCommercialAccess(me.role);
  const items = [
    ...(commercial ? MORE_ITEMS : []),
    ...(me.modules.mentoria ? [ACOMPANHAMENTO_ITEM] : []),
    ...(isLeader(me.role) ? [ADMIN_ITEM] : []),
  ];
  const requests = await pendingAccessRequests(me.role);
  // "Atua como SDR/Closer" só na liderança; SDR e Closer mostram só o cargo.
  const flags = temCaixas(me.role)
    ? [
        me.canProspect && ATUA_COMO.canProspect.label,
        me.canClose && ATUA_COMO.canClose.label,
      ].filter(Boolean)
    : [];
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
            <RoleTag role={me.role} className="h-[22px]" />
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

      {commercial && <InboxCard />}

      <nav aria-label="Mais seções" className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="glass-card flex min-h-28 flex-col justify-between gap-3 p-4 active:scale-[.98]"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-black/5 text-ink dark:bg-white/10 [&_svg]:size-5">
                {item.icon}
              </span>
              {item.href === '/chat' && <ChatBadge />}
            </span>
            <span>
              <b className="block font-semibold">{item.label}</b>
              <small className="block text-xs text-ink2">
                {item.href === ADMIN_ITEM.href && requests > 0
                  ? `${requests} ${requests === 1 ? 'pedido' : 'pedidos'} de acesso`
                  : HINT[item.href]}
              </small>
            </span>
          </Link>
        ))}
      </nav>

      <section className="glass-card flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold text-ink2">Aparência</h2>
        <ThemeSwitch />
      </section>

      <Link
        href="/conta/senha"
        className="glass-card flex min-h-14 w-full items-center justify-center text-base font-semibold"
      >
        Trocar senha
      </Link>
      {MFA_LIGADO && (
        <Link
          href="/conta/mfa"
          className="glass-card flex min-h-14 w-full items-center justify-center text-base font-semibold"
        >
          Autenticador
        </Link>
      )}
      {commercial && (
        <Link
          href="/conta/avisos"
          className="glass-card flex min-h-14 w-full items-center justify-center text-base font-semibold"
        >
          Avisos neste aparelho
        </Link>
      )}
      <SignOutButton className="glass-card min-h-14 w-full text-base font-semibold text-danger" />

      <p className="text-center text-xs text-ink3">
        NPAC Corporation · {commercial ? 'área comercial' : 'acompanhamento de mentorados'}
      </p>
      {/* Cargo Acompanhamento no celular: as abas do módulo no lugar da barra comercial. */}
      {!commercial && <AbasMobile />}
    </div>
  );
}
