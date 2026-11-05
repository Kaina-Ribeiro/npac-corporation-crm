import { hasCommercialAccess } from '@npac/shared/enums';
import { redirect } from 'next/navigation';
import { IrParaModulo } from '@/components/shell/live-updates';
import { getSession } from '@/lib/session';

/**
 * Telas do CRM comercial. O cargo Acompanhamento não as vê (a API já responde 404): a tela não
 * renderiza e a pessoa vai ao módulo. Fica num grupo próprio porque o layout de grupo roda de novo
 * ao entrar nele pela navegação do navegador; o layout compartilhado de (app) não roda.
 */
export default async function ComercialLayout({ children }: { children: React.ReactNode }) {
  const me = await getSession();
  if (!me) redirect('/login');
  if (!hasCommercialAccess(me.role)) return <IrParaModulo />;
  return children;
}
