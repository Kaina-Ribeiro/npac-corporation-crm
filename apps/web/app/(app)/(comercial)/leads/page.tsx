import type { LeadCatalog, LeadDTO, Page, SavedViewDTO } from '@npac/shared';
import { isLeader } from '@npac/shared/enums';
import {
  leadFilterRules,
  oneOf,
  readLeadFilters,
  readPrefs,
  writePrefs,
} from '@npac/shared/screen-prefs';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LeadsBrowser } from '@/components/leads-browser';
import { ApiError, apiGet } from '@/lib/api';
import { prefsCookie } from '@/lib/screen-prefs';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Leads' };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const [me, catalog, views, jar] = await Promise.all([
    getSession(),
    apiGet<LeadCatalog>('/api/leads/catalog'),
    apiGet<SavedViewDTO[]>('/api/views'),
    cookies(),
  ]);
  // Filtro lembrado (NPAC-46): `?view=` da URL vence; sem ele, o filtro salvo ou os filtros do cookie.
  const cookie = me ? prefsCookie('leads', me.id) : '';
  const raw = jar.get(cookie)?.value;
  const viewRule = { view: oneOf(views.map((v) => v.id)) };
  let active = views.find((v) => v.id === (view ?? readPrefs(raw, viewRule).view));
  let filters = active || view !== undefined ? {} : readLeadFilters(raw, catalog);
  // Filtro salvo só tem critérios (sem contato), então pode ir na query string do GET.
  const load = (filters: Record<string, string> = {}) =>
    apiGet<Page<LeadDTO>>(
      `/api/leads?${new URLSearchParams({ ...filters, page: '1', pageSize: '20' })}`,
    );
  let data: Page<LeadDTO>;
  let forcePrefs = view !== undefined;
  try {
    data = await load(active?.filters ?? filters);
  } catch (e) {
    // Filtro salvo antes da validação (ex.: intervalo sem datas) ou lembrado que a API recusa:
    // abre a lista sem ele e a tela apaga o cookie.
    if (!(e instanceof ApiError && e.status === 400 && (active || Object.keys(filters).length)))
      throw e;
    active = undefined;
    filters = {};
    forcePrefs = true;
    data = await load();
  }
  const prefs = active
    ? writePrefs({ view: active.id }, viewRule)
    : writePrefs(filters, leadFilterRules(catalog));
  return (
    <LeadsBrowser
      key={active?.id ?? 'all'}
      initialData={data}
      canCreate={!!me && (isLeader(me.role) || me.canProspect)}
      catalog={catalog}
      role={me?.role ?? 'SDR'}
      views={views}
      activeView={active}
      cookie={cookie}
      prefs={prefs}
      initialFilters={filters}
      forcePrefs={forcePrefs}
    />
  );
}
