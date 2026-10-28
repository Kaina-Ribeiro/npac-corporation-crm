import { redirect } from 'next/navigation';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { getSession } from '@/lib/session';

/** Páginas de conta: exigem sessão, mas valem com troca de senha ou MFA pendentes. */
export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSession())) redirect('/login');
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="glass-card w-full max-w-[440px] rounded-[32px] p-6 md:p-[34px]">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="mark h-8 w-8 rounded-[9px] text-[17px]">N</span>
          <b className="text-[15px] font-semibold">NPAC Corporation</b>
          {/* Sem isto a pessoa fica presa: /login devolve para cá enquanto houver sessão. */}
          <SignOutButton className="ml-auto h-9 rounded-full px-3.5 text-sm font-semibold text-ink2 transition-colors hover:bg-black/5 hover:text-ink" />
        </div>
        {children}
      </div>
    </main>
  );
}
