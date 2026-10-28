import { isLeader } from '@npac/shared/enums';
import type { LeadCatalog, ProductDTO, ReportDTO, TeamActivityDTO } from '@npac/shared';
import { redirect } from 'next/navigation';
import { Reports } from '@/components/reports';
import { apiGet, apiPost } from '@/lib/api';
import { getSession } from '@/lib/session';
export const metadata = { title: 'Dashboard' };
export default async function DashboardPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  const head = isLeader(me.role);
  const [initial, catalog, products, activity] = await Promise.all([
    apiPost<ReportDTO>('/api/reports/search', { period: 'MONTH' }),
    apiGet<LeadCatalog>('/api/leads/catalog'),
    apiGet<ProductDTO[]>('/api/finance/products'),
    head ? apiGet<TeamActivityDTO>('/api/reports/activity') : undefined,
  ]);
  return (
    <Reports
      initial={initial}
      catalog={catalog}
      products={products}
      head={head}
      dashboard
      name={me.name}
      activity={activity}
    />
  );
}
