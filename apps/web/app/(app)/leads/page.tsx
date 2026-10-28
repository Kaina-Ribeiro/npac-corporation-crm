import type { LeadDTO, Page } from '@npac/shared';
import type { Metadata } from 'next';
import { LeadsBrowser } from '@/components/leads-browser';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = { title: 'Leads' };

export default async function LeadsPage() {
  const data = await apiGet<Page<LeadDTO>>('/api/leads?page=1&pageSize=20');
  return <LeadsBrowser initialData={data} />;
}
