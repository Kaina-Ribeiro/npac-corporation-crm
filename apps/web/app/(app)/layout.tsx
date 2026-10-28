import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { BottomNav } from '@/components/shell/bottom-nav';
import { Sidebar } from '@/components/shell/sidebar';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { getSession, pendingStep, ROLE_LABEL } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getSession();
  if (!me) redirect('/login');
  const pending = pendingStep(me);
  if (pending) redirect(pending);

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[52px] items-center gap-2.5 bg-[rgba(242,242,247,.6)] px-4 shadow-[0_.5px_0_var(--line)] backdrop-blur-[30px] backdrop-saturate-200 md:bg-transparent md:shadow-none md:backdrop-blur-none">
          <span className="mark h-7 w-7 rounded-lg text-[15px] md:hidden">N</span>
          <b className="text-base font-semibold md:hidden">NPAC</b>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-right leading-tight">
              <b className="block text-sm font-semibold">{me.name}</b>
              <small className="block text-xs text-ink2">{ROLE_LABEL[me.role]}</small>
            </span>
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(160deg,#7fe0a6,#1e9e70)] text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28)]"
            >
              {me.name.slice(0, 1)}
            </span>
            <SignOutButton />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 pt-2 pb-32 md:px-8 md:pb-10">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
