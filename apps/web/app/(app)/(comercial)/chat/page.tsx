import { oneOf, readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Chat, type Channel, type ChatUser } from '@/components/chat';
import { apiGet } from '@/lib/api';
import { prefsCookie } from '@/lib/screen-prefs';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Chat' };
export default async function ChatPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  const [channels, users, jar] = await Promise.all([
    apiGet<Channel[]>('/api/chat/channels'),
    apiGet<ChatUser[]>('/api/chat/users'),
    cookies(),
  ]);
  // Conversa lembrada (NPAC-46), se a pessoa ainda está nela.
  const cookie = prefsCookie('chat', me.id);
  const rule = { c: oneOf(channels.map((c) => c.id)) };
  const { c } = readPrefs(jar.get(cookie)?.value, rule);
  return (
    <Chat
      initial={channels}
      users={users}
      meId={me.id}
      prefs={{ cookie, value: writePrefs({ c }, rule) }}
      initialActive={c}
    />
  );
}
