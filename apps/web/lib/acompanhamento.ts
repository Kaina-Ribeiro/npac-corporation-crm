import 'server-only';
import { MFA_LIGADO } from '@npac/shared/enums';
import type { EuMentoria, FichaDTO } from '@npac/shared/mentoria';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { getSession, type Me } from './session';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** Último endereço de ficha aberta: só o id, para o menu "Ficha do mentorado" voltar a ela. */
export const COOKIE_ULTIMA_FICHA = 'npac_ultima_ficha';

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

/** GET que devolve null em vez de virar a tela de 404 da página inteira. */
async function tentar<T>(path: string): Promise<T | null> {
  const jar = await cookies();
  const res = await fetch(`${API}${path}`, {
    headers: { cookie: jar.toString() },
    cache: 'no-store',
  }).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
}

/** Perfil e selo de Admin no módulo. Null só se a API recusar (MFA pendente, sem acesso). */
export const lerEu = cache(() => tentar<EuMentoria>('/api/mentoria/eu'));

/** Quem cadastra e edita inscrições (§3): Admin, Acompanhamento e Operação. */
export const podeCadastrar = (eu: EuMentoria | null) =>
  !!eu && (eu.admin || eu.perfil === 'ACOMPANHAMENTO' || eu.perfil === 'OPERACAO');

/** Quem exporta planilha (§6): Admin e Acompanhamento. A API repete a regra. */
export const podeExportar = (eu: EuMentoria | null) =>
  !!eu && (eu.admin || eu.perfil === 'ACOMPANHAMENTO');

/** A última ficha aberta, se ainda existir e a pessoa ainda a enxergar. */
export async function ultimaFicha(): Promise<{ id: string; nome: string } | null> {
  const id = (await cookies()).get(COOKIE_ULTIMA_FICHA)?.value;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const ficha = await tentar<FichaDTO>(`/api/mentoria/inscricoes/${id}`);
  return ficha ? { id: ficha.id, nome: ficha.nome } : null;
}
