import type { LeadCatalog, LeadDTO, Page } from '@npac/shared';
import type { Metadata } from 'next';
import { LeadsBrowser } from '@/components/leads-browser';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Leads' };

export default async function LeadsPage() {
  const data = await apiGet<Page<LeadDTO>>('/api/leads?page=1&pageSize=20');
  const me = await getSession();
  const catalog = await apiGet<LeadCatalog>('/api/leads/catalog');
  return (
    <LeadsBrowser
      initialData={data}
      canCreate={me?.role !== 'CLOSER'}
      catalog={catalog}
      role={me?.role ?? 'SDR'}
    />
  );
}
