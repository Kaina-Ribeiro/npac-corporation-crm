import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { getSession, type Me } from './session';

/** Diretoria e Acompanhamento precisam de MFA ativo para o módulo (D18). */
export const precisaMfa = (me: Me) =>
  (me.role === 'DIRETOR' || me.role === 'ACOMPANHAMENTO') && !me.twoFactorEnabled;

/**
 * Sessão de quem pode usar o módulo. Sem acesso: 404 (o módulo não se revela, D14). Sem MFA:
 * null, e a página não busca nada (o layout mostra o aviso).
 */
export async function sessaoDoModulo(): Promise<Me | null> {
  const me = await getSession();
  if (!me) redirect('/login');
  if (!me.modules.mentoria) notFound();
  return precisaMfa(me) ? null : me;
}
