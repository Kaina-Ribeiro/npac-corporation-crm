import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/login/auth-shell';
import { RequestAccessForm } from '@/components/login/request-access-form';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Solicitar acesso' };

export default async function RequestAccessPage() {
  if (await getSession()) redirect('/dashboard');
  return (
    <AuthShell>
      <RequestAccessForm />
    </AuthShell>
  );
}
