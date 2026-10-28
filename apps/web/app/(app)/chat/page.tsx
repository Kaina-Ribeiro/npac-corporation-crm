import { redirect } from 'next/navigation';
import { Chat, type Channel, type ChatUser } from '@/components/chat';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Chat' };
export default async function ChatPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  const [channels, users] = await Promise.all([
    apiGet<Channel[]>('/api/chat/channels'),
    apiGet<ChatUser[]>('/api/chat/users'),
  ]);
  return <Chat initial={channels} users={users} meId={me.id} />;
}
