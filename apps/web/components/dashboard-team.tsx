'use client';
import type { ReportRow, TeamActivityDTO } from '@npac/shared';
import { money } from '@npac/shared/money';
import Link from 'next/link';
import { useState } from 'react';
import { activityVerb, activityWhen } from '@/lib/activity-text';
import { clientApi } from '@/lib/client-api';
import { ChartCard } from './dashboard-charts';
import { useCrmRefresh } from './shell/live-updates';

const empty = <p className="text-sm text-ink2">Nenhum resultado no período.</p>;

function Initial({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 flex-none place-items-center rounded-full bg-ink text-sm font-bold text-[var(--bg)]"
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** Anel de conversão (vendas ÷ reuniões realizadas); o número no centro é a leitura. */
function Ring({ bps }: { bps: number }) {
  const r = 28;
  const len = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, bps / 10000));
  return (
    <div className="relative size-16 flex-none">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden="true">
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          className="stroke-black/5 dark:stroke-white/10"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke="var(--viz-1)"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - p)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <b className="absolute inset-0 grid place-items-center text-[13px] tabular-nums">
        {Math.round(bps / 100)}%
      </b>
    </div>
  );
}

/** Mesa dos closers: conversão das reuniões realizadas e números de cada closer. */
export function CloserDesk({ rows }: { rows: ReportRow[] }) {
  const sorted = [...rows].sort((a, b) => b.soldCents - a.soldCents);
  return (
    <ChartCard title="Mesa dos closers" subtitle="Conversão das reuniões realizadas">
      {sorted.length ? (
        <ul className="-mx-5 divide-y divide-line">
          {sorted.map((c) => (
            <li key={c.id} className="flex items-center gap-4 px-5 py-4 first:pt-1 last:pb-0">
              <Ring bps={c.conversionBps ?? 0} />
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <Initial name={c.name} />
                  <b className="truncate">{c.name}</b>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-[auto_auto_auto_1fr]">
                  {(
                    [
                      ['Reuniões', String(c.meetings ?? 0)],
                      ['No-show', String(c.noShow ?? 0)],
                      ['Vendas', String(c.sales)],
                      // Sem centavos quando redondo: cabe na coluna sem cortar o valor.
                      ['Faturado', money(c.soldCents).replace(/,00$/, '')],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex min-w-0 flex-col">
                      <dt className="text-xs text-ink2">{label}</dt>
                      <dd
                        className={`font-semibold whitespace-nowrap tabular-nums ${label === 'Faturado' ? 'text-gold-deep' : ''}`}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        empty
      )}
    </ChartCard>
  );
}

/** Pré-vendas: agendamentos por SDR (direto · follow), no-show e vendas. */
export function SdrTable({ rows, period }: { rows: ReportRow[]; period: string }) {
  const sorted = [...rows].sort((a, b) => (b.meetings ?? 0) - (a.meetings ?? 0));
  const max = Math.max(...sorted.map((r) => r.meetings ?? 0), 1);
  return (
    <ChartCard title="Pré-vendas" subtitle={period}>
      {sorted.length ? (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink2">
                <th className="pb-2 font-medium">Responsável</th>
                <th className="pb-2 font-medium">Agendados</th>
                <th className="pb-2 text-right font-medium">No-show</th>
                <th className="pb-2 text-right font-medium">Vendas</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-3 pr-3">
                    <span className="flex items-center gap-2">
                      <Initial name={s.name} />
                      <b className="font-semibold">{s.name}</b>
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 w-16 flex-none rounded-full bg-black/5 sm:w-24 dark:bg-white/10">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${((s.meetings ?? 0) * 100) / max}%`,
                            background: 'var(--viz-2)',
                          }}
                        />
                      </div>
                      <b className="tabular-nums">{s.meetings ?? 0}</b>
                      <span className="text-xs whitespace-nowrap text-ink2">
                        {s.direct ?? 0}D · {s.follow ?? 0}F
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-right tabular-nums">{s.noShow ?? 0}</td>
                  <td className="py-3 text-right font-bold tabular-nums">{s.sales}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink3">D = direto · F = do follow</p>
        </div>
      ) : (
        empty
      )}
    </ChartCard>
  );
}

/** Atividade da equipe (só liderança): últimas mudanças nos leads, atualizada ao vivo. */
export function TeamFeed({ initial }: { initial: TeamActivityDTO }) {
  const [items, setItems] = useState(initial.items);
  useCrmRefresh(async () => {
    setItems((await clientApi<TeamActivityDTO>('/api/reports/activity')).items);
  });
  return (
    <ChartCard
      title="Atividade da equipe"
      subtitle="Registro de auditoria · visível para a liderança"
    >
      {items.length ? (
        <ul className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {items.map((i) => (
            <li key={i.id} className="flex min-w-0 items-start gap-3 text-sm">
              <Initial name={i.actorName} />
              <div className="min-w-0">
                <p>
                  <b className="font-semibold">{i.actorName.split(' ')[0]}</b>{' '}
                  <span className="text-ink2">{activityVerb(i.kind)}</span>{' '}
                  {i.leadName ? (
                    <Link href={`/leads/${i.leadId}`} className="font-medium hover:underline">
                      {i.leadName}
                    </Link>
                  ) : (
                    <span className="text-ink2">
                      {i.kind === 'lead.deleted' ? 'um lead' : 'um lead removido'}
                    </span>
                  )}
                </p>
                <small className="text-xs text-ink3">{activityWhen(i.at)}</small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink2">Nenhuma atividade ainda.</p>
      )}
    </ChartCard>
  );
}
