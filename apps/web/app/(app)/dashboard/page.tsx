import type { LeadCatalog, ProductDTO, ReportDTO } from '@npac/shared';
import { redirect } from 'next/navigation';
import { Reports } from '@/components/reports';
import { apiGet, apiPost } from '@/lib/api';
import { getSession } from '@/lib/session';
export const metadata = { title: 'Dashboard' };
export default async function DashboardPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  const [initial, catalog, products] = await Promise.all([
    apiPost<ReportDTO>('/api/reports/search', { period: 'MONTH' }),
    apiGet<LeadCatalog>('/api/leads/catalog'),
    apiGet<ProductDTO[]>('/api/finance/products'),
  ]);
  return (
    <Reports
      initial={initial}
      catalog={catalog}
      products={products}
      head={me.role === 'HEAD'}
      dashboard
      name={me.name}
    />
  );
}
