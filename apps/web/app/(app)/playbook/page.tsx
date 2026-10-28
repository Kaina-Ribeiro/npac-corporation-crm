import { isLeader } from '@npac/shared/enums';
import { redirect } from 'next/navigation';
import { Playbook, type Script } from '@/components/playbook';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Playbook' };
export default async function PlaybookPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  return <Playbook initial={await apiGet<Script[]>('/api/playbook')} head={isLeader(me.role)} />;
}
