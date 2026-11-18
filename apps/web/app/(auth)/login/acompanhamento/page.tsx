import type { Metadata } from 'next';
import { LoginPage } from '@/components/login/pages';

export const metadata: Metadata = { title: 'Login' };

/** Tela de entrada do Acompanhamento (NPAC-51): "ouro líquido de dia"; leva à área do módulo. */
export default function LoginRoute() {
  return <LoginPage area="ACOMPANHAMENTO" />;
}
