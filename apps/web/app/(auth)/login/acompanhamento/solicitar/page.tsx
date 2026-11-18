import type { Metadata } from 'next';
import { RequestAccessPage } from '@/components/login/pages';

export const metadata: Metadata = { title: 'Solicitar acesso' };

/** Pedido de acesso pela tela do Acompanhamento: o Admin vê a área do pedido. */
export default function RequestAccessRoute() {
  return <RequestAccessPage area="ACOMPANHAMENTO" />;
}
