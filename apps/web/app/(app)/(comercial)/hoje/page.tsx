import { isLeader } from '@npac/shared/enums';
import type { LeadCatalog, TodayDTO } from '@npac/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Today } from '@/components/today';
import { apiGet, apiPost } from '@/lib/api';
import { getSession } from '@/lib/session';
import { parseTodayFilters, todayCookieName } from '@/lib/today-filters';

export const metadata = { title: 'Hoje' };
export default async function HojePage() {
  const me = await getSession();
  if (!me) redirect('/login');
  const head = isLeader(me.role);
  const cookie = todayCookieName(me.id);
  const [catalog, jar] = await Promise.all([apiGet<LeadCatalog>('/api/leads/catalog'), cookies()]);
  // O filtro salvo vale desde a primeira busca: a tela já chega filtrada.
  const filters = head ? parseTodayFilters(jar.get(cookie)?.value, catalog.team) : {};
  const initial = await apiPost<TodayDTO>('/api/today/search', filters);
  return (
    <Today
      initial={initial}
      catalog={catalog}
      name={me.name}
      head={head}
      quick={me.role !== 'CLOSER'}
      charges={me.role !== 'SDR'}
      canCreate={head || me.canProspect}
      cookie={cookie}
      initialFilters={filters}
      closerMarkFor={head && me.canClose ? me.id : undefined}
    />
  );
}
