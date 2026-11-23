import { Suspense } from 'react';
import { hasCommercialAccess, isLeader } from '@npac/shared/enums';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CommandPalette } from '@/components/shell/command-palette';
import { paletteItems } from '@/components/shell/nav-menu';
import { LiveUpdates } from '@/components/shell/live-updates';
import { TabTitle } from '@/components/inbox';
import { NavProgress } from '@/components/shell/nav-progress';
import { PageSkeleton } from '@/components/shell/page-skeleton';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { BottomNav } from '@/components/shell/bottom-nav';
import { Sidebar } from '@/components/shell/sidebar';
import { SidebarShell } from '@/components/shell/sidebar-shell';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { Avatar, AVATAR_EU } from '@/components/avatar';
import { RoleTag } from '@/components/role-tag';
import { pendingAccessRequests } from '@/lib/access-requests';
import { getSession, pendingStep } from '@/lib/session';
import { lerEu, podeCadastrar, precisaMfa, soEnvios, ultimaFicha } from '@/lib/acompanhamento';
import { SemAcesso } from '@/components/acompanhamento/sem-acesso';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getSession();
  if (!me) redirect('/login');
  const pending = pendingStep(me);
  if (pending) redirect(pending);
  // Cargo Acompanhamento: shell reduzido (só o módulo). O bloqueio das telas comerciais fica no
  // layout de (comercial), que roda de novo na navegação do navegador; este não roda.
  const commercial = hasCommercialAccess(me.role);
  // Só quem tem o módulo consulta o perfil: nada muda para o comercial.
  const eu = me.modules.mentoria && !precisaMfa(me) ? await lerEu() : null;
  if (eu && !commercial && !eu.admin && (!eu.perfil || eu.perfil === 'MENTOR'))
    return <SemAcesso mentor={eu.perfil === 'MENTOR'} />;
  const [requests, ultima] = await Promise.all([
    pendingAccessRequests(me.role),
    // Só quem tem o módulo; o cookie só vem nas telas do módulo (Path=/acompanhamento).
    eu && !soEnvios(eu) ? ultimaFicha() : null,
  ]);

  // Rodapé (NPAC-53): foto (ou inicial), nome e cargo levam ao Meu perfil, no lugar do "Trocar senha".
  const avatar = (
    <Avatar name={me.name} photo={me.photo} className={`${AVATAR_EU} size-9 text-[13px]`} />
  );
  const who = (
    <span className="min-w-0 leading-tight">
      <b className="block truncate text-sm font-semibold">{me.name}</b>
      <RoleTag role={me.role} perfil={eu?.perfil} className="mt-1" />
      <small className="mt-1 block text-xs text-ink2">Meu perfil</small>
    </span>
  );

  return (
    <SidebarShell initialCollapsed={(await cookies()).get(SIDEBAR_COOKIE)?.value === '1'}>
      <Suspense>
        <NavProgress />
        {/* Aviso "Salvo" (`showToast` em components/toast.ts): a região vem do servidor, sem JS. */}
        <div role="status" className="toast-region" />
      </Suspense>
      <LiveUpdates revision={me.revision} />
      {commercial && <TabTitle />}
      <CommandPalette
        nav={paletteItems({
          head: isLeader(me.role),
          mentoria: me.modules.mentoria,
          commercial,
          mentoriaAdmin: eu?.admin,
          mentoriaCiclos: podeCadastrar(eu),
          soEnvios: soEnvios(eu),
        })}
        commercial={commercial}
      />
      <Sidebar
        head={isLeader(me.role)}
        mentoria={me.modules.mentoria}
        commercial={commercial}
        mentoriaAdmin={eu?.admin}
        mentoriaCiclos={podeCadastrar(eu)}
        soEnvios={soEnvios(eu)}
        adminBadge={requests}
        ultimaFicha={ultima?.nome ?? null}
        footer={
          <div className="flex flex-col">
            <Link
              href="/conta/perfil"
              aria-label={`Meu perfil, ${me.name}`}
              className="side-who -mx-0.5 flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              {avatar}
              <span className="side-hide min-w-0">{who}</span>
            </Link>
            <div className="side-fold">
              <div>
                <div className="flex items-center gap-1 pt-2">
                  <SignOutButton />
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </div>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="page-reveal flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32 md:px-8 md:pt-6 md:pb-10">
          {children}
          <PageSkeleton />
        </main>
      </div>
      {/* Celular: o cargo Acompanhamento usa as abas do módulo (no /mais, a própria tela as põe). */}
      {commercial && <BottomNav />}
    </SidebarShell>
  );
}
