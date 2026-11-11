import type { LeadCatalog, SavedViewDTO } from '@npac/shared';
import {
  leadFilterRules,
  oneOf,
  readLeadFilters,
  readPrefs,
  writePrefs,
} from '@npac/shared/screen-prefs';
import { rememberPrefs } from './screen-prefs';

/**
 * Cookie de Leads (NPAC-46): `view=<id>` com filtro salvo aberto, senão os filtros. No navegador vem
 * por `import()`, fora do JS da primeira carga de /leads (limite de 150 KB no e2e).
 */
export const viewPrefs = (id: string) => writePrefs({ view: id }, { view: oneOf([id]) });

/** Filtros sem padrões e intervalo só com as duas datas. */
export function filterPrefs(filters: Record<string, string>, catalog: LeadCatalog) {
  const rules = leadFilterRules(catalog);
  return writePrefs(readLeadFilters(writePrefs(filters, rules), catalog), rules);
}

/** Lê o cookie: filtro salvo que ainda existe ou os filtros válidos, e o valor normalizado. */
export function parseLeadPrefs(
  saved: string | undefined,
  views: SavedViewDTO[],
  catalog: LeadCatalog,
): { view?: SavedViewDTO; filters: Record<string, string>; value: string } {
  const id = readPrefs(saved, { view: oneOf(views.map((v) => v.id)) }).view;
  const view = views.find((v) => v.id === id);
  if (view) return { view, filters: view.filters, value: viewPrefs(view.id) };
  const filters = readLeadFilters(saved, catalog);
  return { filters, value: writePrefs(filters, leadFilterRules(catalog)) };
}

/** Grava o cookie de Leads (vazio apaga). */
export const save = (cookie: string, value: string) => rememberPrefs('leads', cookie, value);
