import 'server-only';
import type { Role } from '@npac/shared';
import { cache } from 'react';
import { ApiError, apiGet } from './api';

export type Me = {
  id: string;
  name: string;
  role: Role;
  canProspect: boolean;
  canClose: boolean;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
};

/** Usuário da sessão (via /api/me) ou null se não houver sessão válida. */
export const getSession = cache(async (): Promise<Me | null> => {
  try {
    return await apiGet<Me>('/api/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
});

/** Para onde a pessoa precisa ir antes de usar o app (ou null se está tudo certo). */
export function pendingStep(me: Me): '/conta/senha' | null {
  return me.mustChangePassword ? '/conta/senha' : null;
}
