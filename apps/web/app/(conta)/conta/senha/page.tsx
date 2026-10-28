import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ChangePasswordForm } from '@/components/conta/change-password-form';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Trocar senha' };

export default async function SenhaPage() {
  const me = await getSession();
  if (me && !me.mustChangePassword) redirect('/dashboard');
  return <ChangePasswordForm mfaNext={!!me?.mfaPending} />;
}
