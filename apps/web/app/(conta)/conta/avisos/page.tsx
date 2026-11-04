import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PushSetup } from '@/components/conta/push-setup';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Avisos neste aparelho' };

export default async function PushPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  if (me.mustChangePassword) redirect('/conta/senha');
  return <PushSetup />;
}
