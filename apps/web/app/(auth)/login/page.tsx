import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/login/auth-shell';
import { LoginForm } from '@/components/login/login-form';
import { LAST_USER_COOKIE } from '@/lib/last-user';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Login' };

export default async function LoginPage() {
  if (await getSession()) redirect('/dashboard');
  // Gravado pelo próprio formulário após um login bem-sucedido neste aparelho.
  const last = (await cookies()).get(LAST_USER_COOKIE)?.value;
  const lastUser = last && /^[a-z0-9_.]{3,30}$/.test(last) ? last : undefined;

  return (
    <AuthShell>
      <LoginForm lastUser={lastUser} />
    </AuthShell>
  );
}
