import { isLeader, type Role } from '@npac/shared/enums';
import { apiGet } from './api';

/** Pedidos de acesso esperando a liderança (contador do item Admin); 0 para quem não lidera. */
export async function pendingAccessRequests(role: Role): Promise<number> {
  if (!isLeader(role)) return 0;
  const list = await apiGet<unknown[]>('/api/admin/access-requests').catch(() => []);
  return list.length;
}
