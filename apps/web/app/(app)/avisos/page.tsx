import type { NotificationsDTO } from '@npac/shared';
import { Inbox } from '@/components/inbox';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Avisos' };

export default async function AvisosPage() {
  return <Inbox initial={await apiGet<NotificationsDTO>('/api/notifications')} />;
}
