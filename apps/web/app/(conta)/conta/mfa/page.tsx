import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MfaSetup } from '@/components/conta/mfa-setup';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Configurar autenticador' };

export default async function MfaPage() {
  const me = await getSession();
  if (me?.mustChangePassword) redirect('/conta/senha');
  if (me?.twoFactorEnabled) redirect('/hoje');
  return <MfaSetup />;
}
