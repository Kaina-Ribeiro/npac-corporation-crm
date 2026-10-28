import type { LeadCatalog, LeadDTO, Page, SavedViewDTO } from '@npac/shared';
import type { Metadata } from 'next';
import { LeadsBrowser } from '@/components/leads-browser';
import { apiGet } from '@/lib/api';
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
  const active = views.find((v) => v.id === view);
  const query = new URLSearchParams({ ...active?.filters, page: '1', pageSize: '20' });
  const data = await apiGet<Page<LeadDTO>>(`/api/leads?${query}`);
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
