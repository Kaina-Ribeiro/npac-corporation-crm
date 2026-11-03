import type { LeadCatalog, LeadDTO, Page, SavedViewDTO } from '@npac/shared';
import type { Metadata } from 'next';
import { LeadsBrowser } from '@/components/leads-browser';
import { ApiError, apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Leads' };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const [me, catalog, views] = await Promise.all([
    getSession(),
    apiGet<LeadCatalog>('/api/leads/catalog'),
    apiGet<SavedViewDTO[]>('/api/views'),
  ]);
  // Filtro salvo só tem critérios (sem contato), então pode ir na query string do GET.
  let active = views.find((v) => v.id === view);
  const load = (filters: Record<string, string> = {}) =>
    apiGet<Page<LeadDTO>>(
      `/api/leads?${new URLSearchParams({ ...filters, page: '1', pageSize: '20' })}`,
    );
  let data: Page<LeadDTO>;
  try {
    data = await load(active?.filters);
  } catch (e) {
    // Filtro salvo antes da validação (ex.: intervalo sem datas): abre a lista sem ele.
    if (!(e instanceof ApiError && e.status === 400 && active)) throw e;
    active = undefined;
    data = await load();
  }
  return (
    <LeadsBrowser
      key={active?.id ?? 'all'}
      initialData={data}
      canCreate={me?.role !== 'CLOSER'}
      catalog={catalog}
      role={me?.role ?? 'SDR'}
      views={views}
      activeView={active}
    />
  );
}
