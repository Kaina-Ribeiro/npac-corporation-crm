import 'server-only';
import type { Role } from '@npac/shared';
import type { Vinculo } from '@npac/shared/areas';
import { cache } from 'react';
import { ApiError, apiGet } from './api';

export type Me = {
  id: string;
  name: string;
  /** Foto do perfil (NPAC-53): URL com a versão, ou null (fica a inicial). */
  photo: string | null;
  role: Role;
  canProspect: boolean;
  canClose: boolean;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  modules: { mentoria: boolean };
  /** Diretoria (conta Mestre, NPAC-54). */
  mestre: boolean;
  /** Vínculos por área (`area_membros`): a fonte do cargo; `role` é o resumo. */
  areas: Vinculo[];
  /** Contador do canal ao vivo no render (ver `LiveUpdates`). */
  revision?: string;
  /** Versão no ar, "X.Y.Z" ou "dev" (NPAC-77, `versaoNaTela`). */
  versao?: string;
  /** Id da novidade mais nova que a pessoa viu (`@npac/shared/novidades`). */
  novidadesVista?: string | null;
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
