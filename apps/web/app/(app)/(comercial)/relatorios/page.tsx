import { isLeader } from '@npac/shared/enums';
import type { LeadCatalog, ProductDTO, ReportDTO } from '@npac/shared';
import { readPrefs, reportRules, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Reports } from '@/components/reports';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import { prefsCookie } from '@/lib/screen-prefs';
import { getSession } from '@/lib/session';
export const metadata = { title: 'Relatórios' };
export default async function ReportsPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  const [catalog, products, jar] = await Promise.all([
    apiGet<LeadCatalog>('/api/leads/catalog'),
    apiGet<ProductDTO[]>('/api/finance/products'),
    cookies(),
  ]);
  // Filtros lembrados (NPAC-46): o servidor já busca com eles; intervalo só com as duas datas.
  const cookie = prefsCookie('reports', me.id);
  const rules = reportRules(
    catalog,
    products.map((p) => p.id),
  );
  let saved = readPrefs(jar.get(cookie)?.value, rules);
  if (saved.period === 'RANGE' && !(saved.from && saved.to)) {
    delete saved.period;
    delete saved.from;
    delete saved.to;
  }
  let force = false;
  let initial: ReportDTO;
  try {
    initial = await apiPost<ReportDTO>('/api/reports/search', { period: 'MONTH', ...saved });
  } catch (e) {
    // Filtro lembrado que a API recusa: abre o mês sem ele e a tela apaga o cookie.
    if (!(e instanceof ApiError && e.status === 400)) throw e;
    saved = {};
    force = true;
    initial = await apiPost<ReportDTO>('/api/reports/search', { period: 'MONTH' });
  }
  return (
    <Reports
      initial={initial}
      catalog={catalog}
      products={products}
      role={me.role}
      head={isLeader(me.role)}
      prefs={{ cookie, value: writePrefs(saved, rules), force }}
      initialFilters={saved}
    />
  );
}
