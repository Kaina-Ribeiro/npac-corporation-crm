import { isLeader } from '@npac/shared/enums';
import type { LeadCatalog, TodayDTO } from '@npac/shared';
import { redirect } from 'next/navigation';
import { Today } from '@/components/today';
import { apiGet, apiPost } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Hoje' };
export default async function HojePage() {
  const me = await getSession();
  if (!me) redirect('/login');
  const [initial, catalog] = await Promise.all([
    apiPost<TodayDTO>('/api/today/search', {}),
    apiGet<LeadCatalog>('/api/leads/catalog'),
  ]);
  return <Today initial={initial} catalog={catalog} name={me.name} head={isLeader(me.role)} />;
}
