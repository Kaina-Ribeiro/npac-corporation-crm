import type { Metadata } from 'next';
import { ForgotPasswordPage } from '@/components/login/pages';

export const metadata: Metadata = { title: 'Esqueci minha senha' };

export default function ForgotPasswordRoute() {
  return <ForgotPasswordPage area="ACOMPANHAMENTO" />;
}
