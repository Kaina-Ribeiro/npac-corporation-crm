import { isLeader } from '@npac/shared/enums';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CommandPalette } from '@/components/shell/command-palette';
import { LiveUpdates } from '@/components/shell/live-updates';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { BottomNav } from '@/components/shell/bottom-nav';
import { Sidebar } from '@/components/shell/sidebar';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { RoleTag } from '@/components/role-tag';
import { getSession, pendingStep } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getSession();
  if (!me) redirect('/login');
  const pending = pendingStep(me);
  if (pending) redirect(pending);

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
    <div className="flex min-h-dvh">
      <LiveUpdates />
      <CommandPalette head={isLeader(me.role)} />
      <Sidebar
        head={isLeader(me.role)}
        footer={
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 px-1">
              {avatar}
              {who}
            </div>
            <div className="flex items-center gap-1">
              <SignOutButton />
              <ThemeToggle />
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
    </div>
  );
}
