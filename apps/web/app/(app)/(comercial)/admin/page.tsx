import { isLeader } from '@npac/shared/enums';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Admin, type AdminData } from '@/components/admin';
import type { AcessosPagina } from '@/components/acessos-card';
import { ACESSOS_COOKIE, ADMIN_PREFS_RULE, type AdminTab, type FiltroArea } from '@/lib/admin-tabs';
import { apiGet } from '@/lib/api';
import { prefsCookie } from '@/lib/screen-prefs';
import { getSession } from '@/lib/session';
import { userCookieName } from '@/lib/user-cookie';

export const metadata = { title: 'Admin' };
export default async function AdminPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  if (!isLeader(me.role)) notFound();
  // Quadro "Acessos" (D10): só a Diretoria; os demais recebem 404 e nem pedem.
  const [users, products, stages, lgpd, requests, jar, acessos] = await Promise.all([
    apiGet<AdminData['users']>('/api/admin/users'),
    apiGet<AdminData['products']>('/api/admin/products'),
    apiGet<AdminData['stages']>('/api/admin/stages'),
    apiGet<AdminData['lgpd']>('/api/admin/lgpd'),
    apiGet<AdminData['requests']>('/api/admin/access-requests'),
    cookies(),
    me.mestre ? apiGet<AcessosPagina>('/api/admin/acessos?page=1') : null,
  ]);
  // Aba e filtro de área lembrados (NPAC-46); Usuários é a padrão e não é gravada.
  const cookie = prefsCookie('admin', me.id);
  const { tab, area } = readPrefs(jar.get(cookie)?.value, ADMIN_PREFS_RULE);
  const vistos = userCookieName(ACESSOS_COOKIE, me.id);
  const vistoAte = Number(jar.get(vistos)?.value) || 0;
  return (
    <Admin
      initial={{ users, products, stages, lgpd, requests }}
      meId={me.id}
      meRole={me.role}
      prefs={{ cookie, value: writePrefs({ tab, area }, ADMIN_PREFS_RULE) }}
      initialTab={(tab as AdminTab | undefined) ?? 'Usuários'}
      initialArea={area as FiltroArea}
      acessos={acessos ? { inicial: acessos, vistoAte, cookie: vistos } : undefined}
      agora={new Date().toISOString()}
    />
  );
}
