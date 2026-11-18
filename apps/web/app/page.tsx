import { hasCommercialAccess } from '@npac/shared/enums';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

/**
 * Tela inicial de cada cargo: login, troca de senha e MFA terminam aqui. `?area=acompanhamento`
 * vem da tela de entrada do Acompanhamento (NPAC-52): quem também vê o módulo (Diretoria) cai na
 * Fila; quem tem uma área só cai nela de qualquer jeito.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ area?: string | string[] }>;
}) {
  const me = await getSession();
  const { area } = await searchParams;
  const doModulo = area === 'acompanhamento';
  if (!me) redirect(doModulo ? '/login/acompanhamento' : '/login');
  if (doModulo && me.modules.mentoria) redirect('/acompanhamento');
  redirect(hasCommercialAccess(me.role) ? '/dashboard' : '/acompanhamento');
}
