import { isLeader } from '@npac/shared/enums';
import { notFound, redirect } from 'next/navigation';
import { Admin, type AdminData } from '@/components/admin';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Admin' };
export default async function AdminPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  if (!isLeader(me.role)) notFound();
  const [users, products, stages, lgpd] = await Promise.all([
    apiGet<AdminData['users']>('/api/admin/users'),
    apiGet<AdminData['products']>('/api/admin/products'),
    apiGet<AdminData['stages']>('/api/admin/stages'),
    apiGet<AdminData['lgpd']>('/api/admin/lgpd'),
  ]);
  return <Admin initial={{ users, products, stages, lgpd }} meId={me.id} meRole={me.role} />;
}
