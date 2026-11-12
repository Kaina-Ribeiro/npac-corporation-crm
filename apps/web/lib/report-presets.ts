/** Atalhos de período do Dashboard (dias de Brasília); o servidor usa para já buscar filtrado. */
export type Preset = 'TODAY' | 'WEEK' | 'MONTH';

const spDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

/** Filtros do relatório para cada atalho de período do dashboard. */
export function presetFilters(p: Preset, now = new Date()): Record<string, string> {
  if (p !== 'WEEK') return { period: p };
  return {
    period: 'RANGE',
    from: spDate(new Date(now.getTime() - 6 * 86_400_000)),
    to: spDate(now),
  };
}
