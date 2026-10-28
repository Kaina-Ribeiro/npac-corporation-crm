import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ChangePasswordForm } from '@/components/conta/change-password-form';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Trocar senha' };

export default async function SenhaPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  // Primeiro acesso (obrigatório) ou troca voluntária a partir do menu.
  return <ChangePasswordForm first={me.mustChangePassword} mfaNext={me.mfaPending} />;
}
