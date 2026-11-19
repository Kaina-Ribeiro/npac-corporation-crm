import type { Metadata } from 'next';
import { AuthShell } from '@/components/login/auth-shell';
import { NewPasswordForm } from '@/components/login/new-password-form';

export const metadata: Metadata = { title: 'Criar nova senha' };

/** Aberta mesmo com sessão: o link do e-mail vale também para quem já está logado no aparelho. */
export default function NewPasswordPage() {
  return (
    <AuthShell>
      <NewPasswordForm />
    </AuthShell>
  );
}
