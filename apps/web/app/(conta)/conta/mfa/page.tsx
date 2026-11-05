import type { Metadata } from 'next';
import { MFA_LIGADO } from '@npac/shared/enums';
import { redirect } from 'next/navigation';
import { MfaSetup } from '@/components/conta/mfa-setup';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Autenticador' };

export default async function MfaPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  if (me.mustChangePassword) redirect('/conta/senha');
  // MFA desligado por ora (`MFA_LIGADO`): a tela não existe.
  if (!MFA_LIGADO) redirect('/');
  return <MfaSetup enabled={me.twoFactorEnabled} />;
}
