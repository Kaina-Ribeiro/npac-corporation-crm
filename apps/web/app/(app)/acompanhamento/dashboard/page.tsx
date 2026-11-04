import { sessaoDoModulo } from '@/lib/acompanhamento';

export const metadata = { title: 'Dashboard' };

export default async function DashboardMentoriaPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  return <h1 className="text-[28px] font-bold tracking-[-0.03em]">Dashboard</h1>;
}
