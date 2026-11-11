import { hasCommercialAccess } from '@npac/shared/enums';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

/** Tela inicial de cada cargo: login, troca de senha e MFA terminam aqui. */
export default async function Home() {
  const me = await getSession();
  if (!me) redirect('/login');
  redirect(hasCommercialAccess(me.role) ? '/dashboard' : '/acompanhamento');
}
