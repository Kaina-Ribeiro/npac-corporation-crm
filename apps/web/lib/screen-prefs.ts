import { savePreference, userCookieName } from './user-cookie';

/**
 * Filtros lembrados (NPAC-46): um cookie por pessoa e tela, só no caminho da tela (não vai à API).
 * Valor = `chave=valor&…` validado por `@npac/shared/screen-prefs`; nunca texto digitado.
 */
export const PREFS = {
  leads: { prefix: 'npac_f_leads', path: '/leads' },
  pipeline: { prefix: 'npac_f_pipe', path: '/pipeline' },
  dashboard: { prefix: 'npac_f_dash', path: '/dashboard' },
  reports: { prefix: 'npac_f_rel', path: '/relatorios' },
  admin: { prefix: 'npac_f_admin', path: '/admin' },
  chat: { prefix: 'npac_f_chat', path: '/chat' },
  /** Só memória (busca): sem cookie. */
  playbook: { prefix: 'npac_m_playbook', path: '' },
  // Acompanhamento: `lib/acompanhamento-prefs.ts` (fora daqui para não pesar no JS de /leads).
} as const;

export type Screen = keyof typeof PREFS;

/** Nome do cookie da tela para a pessoa (hash do ID). */
export const prefsCookie = (screen: Screen, userId: string) =>
  userCookieName(PREFS[screen].prefix, userId);

/** Grava no navegador; vazio apaga; acima de 1 KB não grava (defesa). */
export function rememberAt(path: string, cookie: string, value: string) {
  if (!path || value.length > 1024) return;
  savePreference(cookie, value, path);
}

export const rememberPrefs = (screen: Screen, cookie: string, value: string) =>
  rememberAt(PREFS[screen].path, cookie, value);
