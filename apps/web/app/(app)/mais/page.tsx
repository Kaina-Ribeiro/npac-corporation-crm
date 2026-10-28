import Link from 'next/link';
import { getSession } from '@/lib/session';
export const metadata = { title: 'Mais' };
export default async function MorePage() {
  const me = await getSession();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-[34px] font-bold">Mais</h1>
      <nav aria-label="Mais seções" className="glass-card divide-y divide-line px-5">
        {[
          ['/dashboard', 'Dashboard'],
          ['/relatorios', 'Relatórios'],
          ['/chat', 'Chat'],
          ['/equipe', 'Equipe'],
          ['/playbook', 'Playbook'],
          ...(me?.role === 'HEAD' ? [['/admin', 'Admin']] : []),
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href!}
            className="flex min-h-14 items-center justify-between py-3 font-semibold"
          >
            {label}
            <span aria-hidden="true">›</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
