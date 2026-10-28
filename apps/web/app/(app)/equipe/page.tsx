import type { CSSProperties } from 'react';
import type { Role } from '@npac/shared';
import { money } from '@npac/shared/money';
import { apiGet } from '@/lib/api';
import { RoleTag } from '@/components/role-tag';

export const metadata = { title: 'Equipe' };
type Member = {
  id: string;
  name: string;
  role: Role;
  canProspect: boolean;
  canClose: boolean;
  stats: { leads: number; meetings: number; done: number; sales: number; soldCents: number } | null;
};

export default async function EquipePage() {
  const { members } = await apiGet<{ members: Member[] }>('/api/team');
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.04em]">Equipe</h1>
        <p className="text-sm text-ink2">Números do mês corrente (horário de Brasília).</p>
      </div>
      <ul
        className="reveal-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        style={{ '--d': '140ms' } as CSSProperties}
      >
        {members.map((m) => (
          <li key={m.id} className="glass-card flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-full bg-ink text-lg font-bold text-[var(--bg)]"
              >
                {m.name.slice(0, 1)}
              </span>
              <div>
                <h2 className="font-bold">{m.name}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-ink2">
                  <RoleTag role={m.role} />
                  {[m.canProspect && 'prospecta', m.canClose && 'fecha']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
            {m.stats ? (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {(
                  [
                    ['Leads', m.stats.leads],
                    ['Reuniões', m.stats.meetings],
                    ['Realizadas', m.stats.done],
                    ['Vendas', m.stats.sales],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-ink2">{label}</dt>
                    <dd className="font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
                <div className="col-span-2">
                  <dt className="text-xs text-ink2">Faturamento</dt>
                  <dd className="font-semibold text-gold-deep tabular-nums">
                    {money(m.stats.soldCents)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-ink2">
                Números visíveis só para a própria pessoa e HEADs.
              </p>
            )}
            <a href="/chat" className="text-sm font-semibold underline">
              Conversar no chat
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
