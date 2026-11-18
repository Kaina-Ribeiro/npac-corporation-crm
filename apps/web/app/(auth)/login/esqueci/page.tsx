import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/login/auth-shell';
import { ForgotPasswordForm } from '@/components/login/forgot-password-form';
import { LAST_USER_COOKIE } from '@/lib/last-user';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Esqueci minha senha' };

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** A API diz se há envio de e-mail; sem ele (ou sem resposta), segue o caminho da liderança. */
async function mailEnabled(): Promise<boolean> {
  const res = await fetch(`${API}/api/auth/forgot-password/status`, { cache: 'no-store' }).catch(
    () => null,
  );
  const body = (await res?.json().catch(() => null)) as { enabled?: boolean } | null;
  return body?.enabled === true;
}

export default async function ForgotPasswordPage() {
  if (await getSession()) redirect('/');
  const last = (await cookies()).get(LAST_USER_COOKIE)?.value;
  const lastUser = last && /^[a-z0-9_.]{3,30}$/.test(last) ? last : undefined;
  return (
    <AuthShell>
      <ForgotPasswordForm enabled={await mailEnabled()} lastUser={lastUser} />
    </AuthShell>
  );
}
