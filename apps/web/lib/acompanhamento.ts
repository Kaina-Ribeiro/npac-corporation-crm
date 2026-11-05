import 'server-only';
import { MFA_LIGADO } from '@npac/shared/enums';
import { notFound, redirect } from 'next/navigation';
import { getSession, type Me } from './session';

/** Diretoria e Acompanhamento precisam de MFA ativo para o módulo (D18), quando o MFA está ligado. */
export const precisaMfa = (me: Me) =>
  MFA_LIGADO && (me.role === 'DIRETOR' || me.role === 'ACOMPANHAMENTO') && !me.twoFactorEnabled;

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
