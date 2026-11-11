import type { LeadCatalog } from '@npac/shared';
import { userCookieName } from './user-cookie';

/** Último filtro de SDR e closer do Hoje (liderança): cookie só no /hoje, com os IDs. */
export type TodayFilters = { sdrId?: string; closerId?: string };

export const TODAY_COOKIE_PATH = '/hoje';
export const todayCookieName = (userId: string) => userCookieName('npac_hoje', userId);

/** "sdr.closer"; sem filtro, vazio (e o cookie é apagado). */
export const serializeTodayFilters = ({ sdrId, closerId }: TodayFilters) =>
  sdrId || closerId ? `${sdrId ?? ''}.${closerId ?? ''}` : '';

/** Filtro salvo, ignorando quem saiu da equipe ou não atua mais naquela função. */
export function parseTodayFilters(
  saved: string | undefined,
  team: LeadCatalog['team'],
): TodayFilters {
  const [sdrId, closerId] = (saved ?? '').split('.');
  return {
    ...(team.some((u) => u.id === sdrId && u.canProspect) ? { sdrId } : {}),
    ...(team.some((u) => u.id === closerId && u.canClose) ? { closerId } : {}),
  };
}
