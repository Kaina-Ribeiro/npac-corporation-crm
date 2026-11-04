import { Suspense } from 'react';
import { isLeader } from '@npac/shared/enums';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CommandPalette } from '@/components/shell/command-palette';
import { LiveUpdates } from '@/components/shell/live-updates';
import { TabTitle } from '@/components/inbox';
import { NavProgress } from '@/components/shell/nav-progress';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { BottomNav } from '@/components/shell/bottom-nav';
import { Sidebar } from '@/components/shell/sidebar';
import { SidebarShell } from '@/components/shell/sidebar-shell';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { RoleTag } from '@/components/role-tag';
import { pendingAccessRequests } from '@/lib/access-requests';
import { getSession, pendingStep } from '@/lib/session';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getSession();
  if (!me) redirect('/login');
  const pending = pendingStep(me);
  if (pending) redirect(pending);
  const requests = await pendingAccessRequests(me.role);

  const avatar = (
    <span
      aria-hidden="true"
      className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[linear-gradient(160deg,#7fe0a6,#1e9e70)] text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28)]"
    >
      {me.name.slice(0, 1)}
    </span>
  );
  const who = (
    <span className="min-w-0 leading-tight">
      <b className="block truncate text-sm font-semibold">{me.name}</b>
      <RoleTag role={me.role} className="mt-1" />
      <small className="mt-1 flex items-center gap-1.5 text-xs text-ink2">
        <Link href="/conta/senha" className="underline-offset-2 hover:text-ink hover:underline">
          Trocar senha
        </Link>
        ·
        <Link href="/conta/mfa" className="underline-offset-2 hover:text-ink hover:underline">
          Autenticador
        </Link>
      </small>
    </span>
  );

  return (
    <SidebarShell initialCollapsed={(await cookies()).get(SIDEBAR_COOKIE)?.value === '1'}>
      <Suspense>
        <NavProgress />
      </Suspense>
      <LiveUpdates />
      <TabTitle />
      <CommandPalette head={isLeader(me.role)} />
      <Sidebar
        head={isLeader(me.role)}
        adminBadge={requests}
        footer={
          <div className="flex flex-col">
            <div className="side-who flex items-center gap-2.5 px-1">
              {avatar}
              <span className="side-hide min-w-0">{who}</span>
            </div>
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
        </main>
      </div>
      <BottomNav />
    </SidebarShell>
  );
}
