import type { Metadata } from 'next';
import { RequestAccessPage } from '@/components/login/pages';

export const metadata: Metadata = { title: 'Solicitar acesso' };

export default function RequestAccessRoute() {
  return <RequestAccessPage area="COMERCIAL" />;
}
