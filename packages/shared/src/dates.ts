import { TZDate } from '@date-fns/tz';

export const BUSINESS_TZ = 'America/Sao_Paulo';

/** Intervalo [start, end) do dia de negócio (fuso de São Paulo) que contém `at`. */
export function spDayRange(at: Date): { start: Date; end: Date } {
  const local = new TZDate(at.getTime(), BUSINESS_TZ);
  const y = local.getFullYear();
  const m = local.getMonth();
  const d = local.getDate();
  return {
    start: new Date(new TZDate(y, m, d, BUSINESS_TZ).getTime()),
    end: new Date(new TZDate(y, m, d + 1, BUSINESS_TZ).getTime()),
  };
}
