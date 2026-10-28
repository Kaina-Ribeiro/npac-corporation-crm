'use client';
import type { ReportDTO, ReportRow } from '@npac/shared';
import { money } from '@npac/shared/money';
import { useState, type ReactNode } from 'react';

type Day = ReportDTO['daily'][number];

/** Cores validadas (globals.css): 1 = dinheiro, 2 = volume, 3 = terceira série. */
const C1 = 'var(--viz-1)';
const C2 = 'var(--viz-2)';
const C3 = 'var(--viz-3)';

const shortMoney = (cents: number) => {
  const reais = cents / 100;
  if (reais >= 1_000_000) return `R$ ${(reais / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (reais >= 1_000) return `R$ ${Math.round(reais / 1_000)} mil`;
  return `R$ ${Math.round(reais)}`;
};
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (n: number, d: number) => (d ? `${Math.round((n * 100) / d)}%` : '—');

/** Teto do eixo arredondado para cima (1, 2 ou 5 × 10ⁿ). */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * step).find((m) => m >= v) ?? 10 * step;
}

export function ChartCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-card flex min-w-0 flex-col gap-3 p-5 ${className}`}>
      <div>
        <h2 className="text-lg font-bold tracking-[-0.03em]">{title}</h2>
        {subtitle && <p className="text-xs text-ink2">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Mini linha para os cartões de KPI (sem eixos; o número do cartão é a leitura). */
export function Sparkline({ values, color = C2 }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i * 100) / (values.length - 1), 28 - (v / max) * 24]);
  const d = 'M' + pts.map(([x, y]) => `${x!.toFixed(1)} ${y!.toFixed(1)}`).join(' L');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <path d={`${d} L100 30 L0 30 Z`} fill={color} opacity="0.12" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const monthName = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
        new Date(`${iso}T12:00:00Z`),
      )
    : '';
const shortDay = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`))
    .replace('.', '')
    .replace(' de ', ' ');

/**
 * Card escuro do protótipo: vendido acumulado no período (dourado) contra o mesmo trecho do
 * período anterior (tracejado), com variação, recebido/a receber e cursor com dica por dia.
 */
export function RevenueHero({
  daily,
  previous,
  receivedCents,
  outstandingCents,
  monthly,
}: {
  daily: Day[];
  previous: { date: string; soldCents: number }[];
  receivedCents: number;
  outstandingCents: number;
  monthly: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600,
    H = 200,
    T = 18,
    B = 26,
    X0 = 6,
    X1 = 560;
  let sold = 0,
    prevSum = 0;
  const cur = daily.map((d) => (sold += d.soldCents));
  const prev = previous.map((d) => (prevSum += d.soldCents));
  const max = niceMax(Math.max(sold, prevSum, 1));
  const last = daily.length - 1;
  const n = Math.max(last, 1);
  const x = (i: number) => X0 + (i * (X1 - X0)) / n;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = (vals: number[]) =>
    vals.length ? 'M' + vals.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' L') : '';
  const delta = prevSum ? Math.round(((sold - prevSum) * 100) / prevSum) : null;
  const curName = monthly ? monthName(daily[0]?.date) : 'Período';
  const prevName = monthly ? monthName(previous[0]?.date) : 'período anterior';
  const mid = Math.floor(last / 2);
  const GOLD = '#e2bb66';
  return (
    <section
      className="relative min-w-0 overflow-hidden rounded-3xl p-5 text-white shadow-[0_14px_34px_-14px_rgba(0,0,0,.45)] lg:col-span-2"
      style={{ background: 'linear-gradient(160deg, #1d1d20 0%, #0d0d0f 100%)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: GOLD }}>
          Faturamento acumulado
        </h2>
        <ul className="flex gap-4 text-xs text-white/70">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-3.5 rounded" style={{ background: GOLD }} />
            <span className="inline-block first-letter:uppercase">{curName}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="w-3.5 border-t border-dashed border-white/60" />
            <span className="inline-block first-letter:uppercase">{prevName}</span>
          </li>
        </ul>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p
          className="bg-clip-text text-[40px] leading-tight font-bold tracking-[-0.03em] text-transparent tabular-nums sm:text-5xl"
          style={{
            backgroundImage: `linear-gradient(100deg, ${GOLD} 20%, #fff1c9 45%, ${GOLD} 70%)`,
          }}
        >
          {money(sold)}
        </p>
        {delta !== null && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              delta >= 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'
            }`}
          >
            {delta >= 0 ? '+' : '−'}
            {Math.abs(delta)}% vs {prevName}
          </span>
        )}
      </div>
      <p className="text-sm text-white/70">
        Recebido {money(receivedCents)} · a receber{' '}
        <b style={{ color: GOLD }}>{money(outstandingCents)}</b>
      </p>
      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          role="img"
          aria-label={`Vendido acumulado ${money(sold)} contra ${money(prevSum)} no ${prevName}`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - box.left) / box.width) * W;
            setHover(Math.max(0, Math.min(last, Math.round(((px - X0) / (X1 - X0)) * n))));
          }}
        >
          <defs>
            <linearGradient id="hero-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={GOLD} stopOpacity="0.38" />
              <stop offset="1" stopColor={GOLD} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={X0}
              x2={X1}
              y1={y(f * max)}
              y2={y(f * max)}
              stroke="rgba(255,255,255,.07)"
            />
          ))}
          {prev.length > 0 && (
            <path
              d={line(prev)}
              fill="none"
              stroke="rgba(255,255,255,.55)"
              strokeWidth="1.5"
              strokeDasharray="3 4"
            />
          )}
          {last >= 0 && (
            <>
              <path
                d={`${line(cur)} L${x(last)} ${y(0)} L${x(0)} ${y(0)} Z`}
                fill="url(#hero-area)"
              />
              <path
                d={line(cur)}
                fill="none"
                stroke={GOLD}
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <circle
                cx={x(last)}
                cy={y(sold)}
                r="5"
                fill="#0d0d0f"
                stroke={GOLD}
                strokeWidth="2.5"
              />
              <text
                x={x(last)}
                y={y(sold) - 12}
                textAnchor="end"
                fontSize="12"
                fontWeight="700"
                fill="#fff"
              >
                Hoje
              </text>
            </>
          )}
          {[0, mid, last]
            .filter((v, i, a) => v >= 0 && a.indexOf(v) === i && daily[v])
            .map((i) => (
              <text
                key={i}
                x={x(i)}
                y={H - 6}
                textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
                fontSize="11"
                fill="rgba(255,255,255,.6)"
              >
                {shortDay(daily[i]!.date)}
              </text>
            ))}
          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={T}
                y2={H - B}
                stroke="rgba(255,255,255,.35)"
                strokeDasharray="2 3"
              />
              <circle
                cx={x(hover)}
                cy={y(cur[hover]!)}
                r="4.5"
                fill={GOLD}
                stroke="#0d0d0f"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 min-w-44 rounded-xl border border-white/10 bg-black/80 p-3 text-xs backdrop-blur"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: `translateX(${hover > last / 2 ? '-105%' : '5%'})`,
            }}
          >
            <p className="font-semibold">{shortDay(daily[hover]!.date)}</p>
            <p>
              Acumulado: <b className="tabular-nums">{money(cur[hover]!)}</b>
            </p>
            {prev[hover] !== undefined && (
              <p className="text-white/70">
                <span className="inline-block first-letter:uppercase">{prevName}</span>: {money(prev[hover]!)}
              </p>
            )}
            <p className="text-white/70">Vendas do dia: {money(daily[hover]!.soldCents)}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** Barras por dia (uma série, uma cor) com dica ao passar o mouse. */
export function DailyBars({
  daily,
  field,
  label,
}: {
  daily: Day[];
  field: 'leads' | 'meetings';
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640,
    H = 160,
    L = 28,
    B = 22,
    T = 8;
  const max = niceMax(Math.max(...daily.map((d) => d[field]), 1));
  const slot = (W - L) / Math.max(daily.length, 1);
  const bw = Math.max(2, slot - 2);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const h = hover === null ? null : daily[hover]!;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${label} por dia`}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W} y1={y(f * max)} y2={y(f * max)} stroke="var(--line)" />
            <text x={L - 6} y={y(f * max) + 4} textAnchor="end" fontSize="11" fill="var(--ink3)">
              {Math.round(f * max)}
            </text>
          </g>
        ))}
        {daily.map((d, i) => {
          const v = d[field];
          const top = y(v);
          return (
            <g key={d.date} onPointerEnter={() => setHover(i)}>
              <rect x={L + i * slot} y={T} width={slot} height={H - T - B} fill="transparent" />
              {v > 0 && (
                <path
                  d={`M${L + i * slot + 1} ${y(0)} V${top + 2} q0 -2 2 -2 h${bw - 4} q2 0 2 2 V${y(0)} Z`}
                  fill={C2}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
            </g>
          );
        })}
        <text x={L} y={H - 4} fontSize="11" fill="var(--ink3)">
          {daily[0] && dayLabel(daily[0].date)}
        </text>
        <text x={W} y={H - 4} fontSize="11" textAnchor="end" fill="var(--ink3)">
          {daily.at(-1) && dayLabel(daily.at(-1)!.date)}
        </text>
      </svg>
      {h && hover !== null && (
        <div
          role="status"
          className="glass-card pointer-events-none absolute top-0 z-10 p-2 text-xs"
          style={{
            left: `${((L + hover * slot) / W) * 100}%`,
            transform: `translateX(${hover > daily.length / 2 ? '-105%' : '5%'})`,
          }}
        >
          <b>{dayLabel(h.date)}</b> · {h[field]} {label.toLowerCase()}
        </div>
      )}
    </div>
  );
}

/** Funil do período: cada etapa com o volume e a passagem da etapa anterior. */
export function Funnel({ metrics }: { metrics: Record<string, number> }) {
  const steps: [string, number][] = [
    ['Leads novos', metrics.leads ?? 0],
    ['Reuniões agendadas', metrics.meetings ?? 0],
    ['Reuniões realizadas', metrics.done ?? 0],
    ['Vendas', metrics.sales ?? 0],
  ];
  const top = Math.max(steps[0]![1], ...steps.map((s) => s[1]), 1);
  return (
    <ol className="flex flex-col gap-3">
      {steps.map(([label, v], i) => (
        <li key={label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink2">{label}</span>
            <span>
              <b className="tabular-nums">{v}</b>
              {i > 0 && (
                <span className="ml-2 text-xs text-ink2">
                  {pct(v, steps[i - 1]![1])} da etapa anterior
                </span>
              )}
            </span>
          </div>
          <div className="h-3 rounded-full bg-black/5 dark:bg-white/10">
            <div
              className="h-3 rounded-full"
              style={{
                width: `${Math.max(v ? 2 : 0, (v * 100) / top)}%`,
                background: i === 3 ? C1 : C2,
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Distribuição por perfil: rosca com legenda e rótulos (identidade nunca só pela cor). */
export function TierDonut({ p0, p1, p2 }: { p0: number; p1: number; p2: number }) {
  const total = p0 + p1 + p2;
  const R = 46,
    CIRC = 2 * Math.PI * R;
  const parts: [string, number, string][] = [
    ['P0 · Mentorias', p0, C1],
    ['P1 · Nação', p1, C2],
    ['P2 · Nação', p2, C3],
  ];
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox="0 0 120 120"
        className="size-36 flex-none"
        role="img"
        aria-label={`Leads por perfil: P0 ${p0}, P1 ${p1}, P2 ${p2}`}
      >
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line)" strokeWidth="14" />
        {total > 0 &&
          parts.map(([label, v, color]) => {
            const len = (v / total) * CIRC;
            const el = (
              <circle
                key={label}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={color}
                strokeWidth="14"
                strokeDasharray={`${Math.max(0, len - 2)} ${CIRC}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            );
            offset += len;
            return el;
          })}
        <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--ink)">
          {total}
        </text>
        <text x="60" y="74" textAnchor="middle" fontSize="10" fill="var(--ink2)">
          leads
        </text>
      </svg>
      <ul className="flex flex-col gap-2 text-sm">
        {parts.map(([label, v, color]) => (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ background: color }}
            />
            <span className="text-ink2">{label}</span>
            <b className="tabular-nums">{v}</b>
            <span className="text-xs text-ink2">{pct(v, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras horizontais ordenadas (uma métrica, uma cor) com valor ao lado. */
export function RankBars({
  rows,
  value,
  format,
  color = C2,
  detail,
}: {
  rows: ReportRow[];
  value: (r: ReportRow) => number;
  format: (v: number) => string;
  color?: string;
  detail?: (r: ReportRow) => string;
}) {
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  const max = Math.max(...sorted.map(value), 1);
  if (!sorted.length) return <p className="text-sm text-ink2">Nenhum resultado no período.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {sorted.map((r, i) => (
        <li key={r.id} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>
              <span className="mr-2 text-xs text-ink3">{i + 1}º</span>
              <b>{r.name}</b>
            </span>
            <span className="text-right">
              <b className="tabular-nums">{format(value(r))}</b>
              {detail && <span className="ml-2 text-xs text-ink2">{detail(r)}</span>}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-black/5 dark:bg-white/10">
            <div
              className="h-2.5 rounded-full"
              style={{
                width: `${Math.max(value(r) ? 2 : 0, (value(r) * 100) / max)}%`,
                background: color,
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

export const chartColors = { money: C1, volume: C2 };
export { shortMoney };
