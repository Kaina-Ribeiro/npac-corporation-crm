import { isLeader } from '@npac/shared/enums';
import { oneOf, readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Admin, type AdminData } from '@/components/admin';
import { ADMIN_TABS, type AdminTab } from '@/lib/admin-tabs';
import { apiGet } from '@/lib/api';
import { prefsCookie } from '@/lib/screen-prefs';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Admin' };
export default async function AdminPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  if (!isLeader(me.role)) notFound();
  const [users, products, stages, lgpd, requests, jar] = await Promise.all([
    apiGet<AdminData['users']>('/api/admin/users'),
    apiGet<AdminData['products']>('/api/admin/products'),
    apiGet<AdminData['stages']>('/api/admin/stages'),
    apiGet<AdminData['lgpd']>('/api/admin/lgpd'),
    apiGet<AdminData['requests']>('/api/admin/access-requests'),
    cookies(),
  ]);
  // Aba lembrada (NPAC-46); Usuários é a padrão e não é gravada.
  const cookie = prefsCookie('admin', me.id);
  const rule = { tab: oneOf(ADMIN_TABS.filter((t) => t !== 'Usuários')) };
  const { tab } = readPrefs(jar.get(cookie)?.value, rule);
  return (
    <Admin
      initial={{ users, products, stages, lgpd, requests }}
      meId={me.id}
      meRole={me.role}
      prefs={{ cookie, value: writePrefs({ tab }, rule) }}
      initialTab={(tab as AdminTab | undefined) ?? 'Usuários'}
    />
  );
}
