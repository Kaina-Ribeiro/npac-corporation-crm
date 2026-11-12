/**
 * Preferências de tela em cookie, por pessoa e aparelho: o servidor já renderiza com elas, sem
 * "pulo" ao carregar, e o CRM não usa localStorage. Guardam só IDs e chaves, nada pessoal.
 */

/** Nome do cookie da pessoa: hash curto do ID (FNV-1a), para não misturar contas no aparelho. */
export function userCookieName(prefix: string, userId: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) h = Math.imul(h ^ userId.charCodeAt(i), 0x01000193);
  return `${prefix}_${(h >>> 0).toString(36)}`;
}

// Leitura em módulo próprio: quem só lê não leva o resto para o JS da página (limite de /leads).
export { readPreference } from './read-preference';

/** Grava o cookie no navegador; valor vazio apaga. */
export function savePreference(name: string, value: string, path: string) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${value}; Path=${path}; Max-Age=${value ? 31_536_000 : 0}; SameSite=Lax${secure}`;
}
