import type { Metadata } from 'next';
import { ChangePasswordForm } from '@/components/conta/change-password-form';

export const metadata: Metadata = { title: 'Trocar senha' };

export default function SenhaPage() {
  return <ChangePasswordForm />;
}
