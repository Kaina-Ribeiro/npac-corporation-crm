import { isLeader } from '@npac/shared/enums';
import type { LeadCatalog, ProductDTO, ReportDTO, TeamActivityDTO } from '@npac/shared';
import { dashboardRules, readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Reports } from '@/components/reports';
import { apiGet, apiPost } from '@/lib/api';
import { dashCookieName } from '@/lib/dashboard-layout';
import { presetFilters, type Preset } from '@/lib/report-presets';
import { prefsCookie } from '@/lib/screen-prefs';
import { getSession } from '@/lib/session';
export const metadata = { title: 'Dashboard' };
export default async function DashboardPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  const head = isLeader(me.role);
  const cookie = dashCookieName(me.id);
  const [catalog, products, activity, jar] = await Promise.all([
    apiGet<LeadCatalog>('/api/leads/catalog'),
    apiGet<ProductDTO[]>('/api/finance/products'),
    head ? apiGet<TeamActivityDTO>('/api/reports/activity') : undefined,
    cookies(),
  ]);
  // Período (Hoje, 7 dias) e SDR lembrados (NPAC-46): o servidor já busca com eles.
  const prefs = prefsCookie('dashboard', me.id);
  const rules = dashboardRules(catalog, head);
  const saved = readPrefs(jar.get(prefs)?.value, rules);
  const initial = await apiPost<ReportDTO>('/api/reports/search', {
    ...presetFilters((saved.preset as Preset | undefined) ?? 'MONTH'),
    ...(saved.sdrId ? { sdrId: saved.sdrId } : {}),
  });
  return (
    <Reports
      initial={initial}
      catalog={catalog}
      products={products}
      role={me.role}
      head={head}
      dashboard
      name={me.name}
      activity={activity}
      layout={{ cookie, saved: jar.get(cookie)?.value }}
      prefs={{ cookie: prefs, value: writePrefs(saved, rules) }}
      initialFilters={saved}
    />
  );
}
