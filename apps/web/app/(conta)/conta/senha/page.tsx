import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ChangePasswordForm } from '@/components/conta/change-password-form';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Crie a sua senha' };

export default async function SenhaPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  // Só o primeiro acesso (obrigatório); a troca voluntária fica no Meu perfil (NPAC-53).
  if (!me.mustChangePassword) redirect('/conta/perfil');
  return <ChangePasswordForm />;
}
