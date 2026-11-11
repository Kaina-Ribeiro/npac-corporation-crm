import { userCookieName } from './user-cookie';

/** Colunas ocultas do Pipeline: cookie só no /pipeline, com as chaves das etapas. */
export const PIPE_COOKIE_PATH = '/pipeline';
export const pipeCookieName = (userId: string) => userCookieName('npac_pipe', userId);

export const serializeHidden = (hidden: readonly string[]) => hidden.join('.');

/** Etapas ocultas salvas, ignorando as que não existem mais; coluna nova aparece. */
export const parseHidden = (saved: string | undefined, stages: readonly string[]) =>
  [...new Set((saved ?? '').split('.'))].filter((key) => stages.includes(key));
