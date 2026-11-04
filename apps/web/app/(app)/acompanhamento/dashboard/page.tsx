import type { PaginaMentorados } from '@npac/shared/mentoria';
import { DashboardView } from '@/components/acompanhamento/dashboard-view';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { apiPost } from '@/lib/api';

export const metadata = { title: 'Dashboard' };

/** Módulo 1: lista geral, A–Z (D31), 50 por página no servidor. Busca por POST. */
export default async function DashboardMentoriaPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const inicial = await apiPost<PaginaMentorados>('/api/mentoria/mentorados/search', {});
  return <DashboardView inicial={inicial} />;
}
