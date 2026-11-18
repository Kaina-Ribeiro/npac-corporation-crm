import type { Metadata } from 'next';
import { LoginPage } from '@/components/login/pages';

export const metadata: Metadata = { title: 'Login' };

export default function LoginRoute() {
  return <LoginPage area="COMERCIAL" />;
}
