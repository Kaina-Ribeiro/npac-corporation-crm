'use client';
import type {
  LeadCatalog,
  ProductDTO,
  ReportDTO,
  ReportRow,
  Role,
  TeamActivityDTO,
} from '@npac/shared';
import { money } from '@npac/shared/money';
import Link from 'next/link';
import { type CSSProperties, useMemo, useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
import { DASH_CARDS } from '@/lib/dashboard-layout';
import { button, control, Field, FormError, quietButton } from './crm-ui';
import {
  ChartCard,
  DailyBars,
  Funnel,
  RankBars,
  RevenueHero,
  Sparkline,
  TierDonut,
  chartColors,
} from './dashboard-charts';
import { BoardProvider, DashboardBoard, RestoreOrder, type BoardCard } from './dashboard-board';
import { CsvExport } from './csv-export';
import { CloserDesk, SdrTable, TeamFeed } from './dashboard-team';
import { CountUp } from './count-up';
import { useCrmRefresh } from './shell/live-updates';

function Breakdown({ title, rows }: { title: string; rows: ReportRow[] }) {
  const columns = (
    [
      ['leads', 'Leads'],
      ['meetings', 'Agendados'],
      ['done', 'Realizadas'],
      ['noShow', 'No-show'],
      ['sales', 'Vendas'],
      ['soldCents', 'Faturamento'],
      ['ticketCents', 'Ticket médio'],
      ['conversionBps', 'Conversão'],
      ['noShowBps', 'No-show %'],
    ] as const
  ).filter(([key]) => rows.some((r) => r[key] !== undefined));
  return (
    <section className="glass-card overflow-x-auto p-5">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink2">
              <th className="py-2 pr-4">Nome</th>
              {rows.some((r) => r.p0 !== undefined) && <th className="px-3">P0 / P1 / P2</th>}
              {rows.some((r) => r.direct !== undefined) && (
                <th className="px-3">Direto / Follow</th>
              )}
              {columns.map(([key, label]) => (
                <th key={key} className="px-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.id}:${r.name}`} className="border-t border-line">
                <td className="py-3 pr-4">{r.name}</td>
                {rows.some((v) => v.p0 !== undefined) && (
                  <td className="whitespace-nowrap px-3">
                    {r.p0 ?? 0} / {r.p1 ?? 0} / {r.p2 ?? 0}
                  </td>
                )}
                {rows.some((v) => v.direct !== undefined) && (
                  <td className="whitespace-nowrap px-3">
                    {r.direct ?? 0} / {r.follow ?? 0}
                  </td>
                )}
                {columns.map(([key]) => (
                  <td
                    key={key}
                    className={`whitespace-nowrap px-3 ${key === 'soldCents' ? 'text-gold-deep' : ''}`}
                  >
                    {key.endsWith('Cents')
                      ? money(r[key] ?? 0)
                      : key.endsWith('Bps')
                        ? `${((r[key] ?? 0) / 100).toFixed(2)}%`
                        : (r[key] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-ink2">Nenhum resultado no período.</p>
      )}
    </section>
  );
}
type Preset = 'TODAY' | 'WEEK' | 'MONTH';
const SP = 'America/Sao_Paulo';
const spDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: SP }).format(d);

/** Filtros do relatório para cada atalho de período do dashboard (dias de Brasília). */
function presetFilters(p: Preset): Record<string, string> {
  if (p !== 'WEEK') return { period: p };
  const now = new Date();
  return {
    period: 'RANGE',
    from: spDate(new Date(now.getTime() - 6 * 86_400_000)),
    to: spDate(now),
  };
}

function greeting(name?: string) {
  const h = Number(
    new Intl.DateTimeFormat('pt-BR', { timeZone: SP, hour: 'numeric', hourCycle: 'h23' }).format(
      new Date(),
    ),
  );
  const hi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  return name ? `${hi}, ${name.split(' ')[0]}` : hi;
}

const todayLabel = () =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: SP,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
const monthName = () => {
  const m = new Intl.DateTimeFormat('pt-BR', { timeZone: SP, month: 'long' }).format(new Date());
  return m.charAt(0).toUpperCase() + m.slice(1);
};

export function Reports({
  initial,
  catalog,
  products,
  head,
  role,
  dashboard = false,
  name,
  activity,
  layout,
}: {
  initial: ReportDTO;
  catalog: LeadCatalog;
  products: ProductDTO[];
  head: boolean;
  role: Role;
  dashboard?: boolean;
  /** Primeiro nome para a saudação do dashboard. */
  name?: string;
  /** Feed da equipe; só vem para Head. */
  activity?: TeamActivityDTO;
  /** Ordem salva dos cards do dashboard (cookie da pessoa). */
  layout?: { cookie: string; saved?: string };
}) {
  const [data, setData] = useState(initial),
    [filters, setFilters] = useState<Record<string, string>>({ period: 'MONTH' }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false),
    [preset, setPreset] = useState<Preset>('MONTH'),
    [sdrId, setSdrId] = useState('');
  async function load(selected = filters) {
    setData(await clientApi<ReportDTO>('/api/reports/search', 'POST', selected));
  }
  useCrmRefresh(() => load());
  /** Dashboard da liderança: o SDR escolhido acompanha a troca de período. */
  async function pick(preset: Preset, sdr = sdrId) {
    const f = { ...presetFilters(preset), ...(sdr ? { sdrId: sdr } : {}) };
    setPreset(preset);
    setSdrId(sdr);
    setFilters(f);
    setBusy(true);
    setError('');
    try {
      await load(f);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(
      [...new FormData(e.currentTarget)].map(([k, v]) => [k, String(v)]).filter(([, v]) => v),
    );
    setFilters(f);
    setBusy(true);
    setError('');
    try {
      await load(f);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    setError('');
    try {
      const { text } = await clientApi<{ text: string }>('/api/reports/summary', 'POST', filters);
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const m = data.metrics;
  // Pedido do cliente (04/11): SDR vê comparecimento, não venda; Closer segue igual; liderança vê os dois.
  const sdr = role === 'SDR';
  const hiddenCards = new Set<string>(
    sdr
      ? ['kpi-sold', 'kpi-received', 'revenue', 'products']
      : role === 'CLOSER'
        ? ['kpi-done', 'kpi-missed', 'meeting-value']
        : [],
  );
  const dashCards: BoardCard[] = !dashboard
    ? []
    : [
        ...(
          [
            [
              'kpi-leads',
              'Leads novos',
              m.leads ?? 0,
              `P0 ${m.p0 ?? 0} · P1 ${m.p1 ?? 0} · P2 ${m.p2 ?? 0}`,
              'leads',
              chartColors.volume,
            ],
            [
              'kpi-meetings',
              'Reuniões agendadas',
              m.meetings ?? 0,
              `${m.direct ?? 0} diretas · ${m.follow ?? 0} do follow`,
              'meetings',
              chartColors.volume,
            ],
            [
              'kpi-sold',
              'Vendido',
              m.soldCents ?? 0,
              `${m.sales ?? 0} vendas · conversão ${((m.conversionBps ?? 0) / 100).toFixed(0)}%`,
              'soldCents',
              chartColors.money,
            ],
            [
              'kpi-received',
              'Recebido',
              m.receivedCents ?? 0,
              `A receber: ${money(m.outstandingCents ?? 0)}`,
              'receivedCents',
              chartColors.money,
            ],
            [
              'kpi-done',
              'Reuniões realizadas',
              m.done ?? 0,
              `Comparecimento ${((m.attendanceBps ?? 0) / 100).toFixed(0)}% das reuniões decididas`,
              'meetings',
              chartColors.volume,
            ],
            [
              'kpi-missed',
              'No-show / Remarcados',
              (m.noShow ?? 0) + (m.rescheduled ?? 0),
              `${m.noShow ?? 0} no-show · ${m.rescheduled ?? 0} remarcados`,
              'meetings',
              chartColors.volume,
            ],
          ] as const
        ).map(([id, label, value, foot, key, color], i): BoardCard => ({
          id,
          title: label,
          size: 'kpi',
          node: (
            <article className="glass-card flex flex-col gap-1 p-5">
              <p className="text-sm text-ink2">{label}</p>
              <p
                className={`text-3xl font-bold tracking-tight tabular-nums ${key.endsWith('Cents') ? 'text-gold-deep' : ''}`}
              >
                <CountUp
                  value={value}
                  format={key.endsWith('Cents') ? money : undefined}
                  delay={230 + i * 70}
                />
              </p>
              <p className="text-xs text-ink2">{foot}</p>
              <Sparkline values={data.daily.map((d) => d[key] ?? 0)} color={color} />
            </article>
          ),
        })),
        {
          id: 'revenue',
          title: 'Faturamento acumulado',
          size: 'wide',
          node: (
            <RevenueHero
              daily={data.daily}
              previous={data.previousDaily}
              receivedCents={m.receivedCents ?? 0}
              outstandingCents={m.outstandingCents ?? 0}
              monthly={preset === 'MONTH'}
            />
          ),
        },
        {
          id: 'meeting-value',
          title: 'Valor a receber por reunião realizada',
          size: 'wide',
          node: (
            <RevenueHero
              daily={data.daily}
              previous={[]}
              monthly={preset === 'MONTH'}
              title="Valor a receber por reunião realizada"
              value={(d) => d.meetingValueCents ?? 0}
              dayLabel="Valor do dia"
              foot={
                <>
                  P0 R$ 9 · P1 R$ 7 · P2 R$ 5 por reunião realizada · {m.done ?? 0}{' '}
                  {(m.done ?? 0) === 1 ? 'realizada' : 'realizadas'}
                </>
              }
            />
          ),
        },
        {
          id: 'funnel',
          title: 'Funil',
          size: 'narrow',
          node: (
            <ChartCard
              title="Funil"
              subtitle={`No-show ${((m.noShowBps ?? 0) / 100).toFixed(0)}% das reuniões decididas`}
            >
              <Funnel metrics={m} />
            </ChartCard>
          ),
        },
        {
          id: 'daily-leads',
          title: 'Leads novos por dia',
          size: 'wide',
          node: (
            <ChartCard title="Leads novos por dia">
              <DailyBars daily={data.daily} field="leads" label="Leads" />
            </ChartCard>
          ),
        },
        {
          id: 'tiers',
          title: 'Perfil dos leads',
          size: 'narrow',
          node: (
            <ChartCard title="Perfil dos leads">
              <TierDonut p0={m.p0 ?? 0} p1={m.p1 ?? 0} p2={m.p2 ?? 0} />
            </ChartCard>
          ),
        },
        {
          id: 'closers',
          title: 'Mesa dos closers',
          size: 'half',
          node: <CloserDesk rows={data.byCloser} />,
        },
        {
          id: 'sdrs',
          title: 'Pré-vendas',
          size: 'half',
          node: (
            <SdrTable
              rows={data.bySdr}
              period={
                preset === 'TODAY' ? 'Hoje' : preset === 'WEEK' ? 'Últimos 7 dias' : monthName()
              }
            />
          ),
        },
        {
          id: 'products',
          title: 'Produtos',
          size: 'narrow',
          node: (
            <ChartCard title="Produtos" subtitle="Vendido por produto">
              <RankBars
                rows={data.byProduct}
                value={(r) => r.soldCents ?? 0}
                format={money}
                color={chartColors.money}
                detail={(r) => `${r.sales}×`}
              />
            </ChartCard>
          ),
        },
        ...(activity
          ? [
              {
                id: 'feed',
                title: 'Atividade da equipe',
                size: 'wide',
                node: <TeamFeed initial={activity} />,
              } satisfies BoardCard,
            ]
          : []),
      ];
  // Ordem padrão: estável entre renderizações (o feed só existe para a liderança).
  const hasFeed = !!activity;
  const dashIds = useMemo(
    () =>
      DASH_CARDS.filter((id) => dashboard && (id !== 'feed' || hasFeed) && !hiddenCards.has(id)),
    [dashboard, hasFeed, role],
  );
  const cards = sdr
    ? [
        ['Leads novos', String(m.leads ?? 0)],
        ['Agendamentos', String(m.meetings ?? 0)],
        ['Reuniões realizadas', String(m.done ?? 0)],
        ['No-show / Remarcados', String((m.noShow ?? 0) + (m.rescheduled ?? 0))],
        ['Valor a receber por reunião realizada', money(m.meetingValueCents ?? 0)],
      ]
    : [
        ['Leads novos', String(m.leads ?? 0)],
        ['Agendamentos', String(m.meetings ?? 0)],
        ['Vendas', String(m.sales ?? 0)],
        ['Vendido', money(m.soldCents ?? 0)],
        ['Recebido no período', money(m.receivedCents ?? 0)],
        ['A receber das vendas do período', money(m.outstandingCents ?? 0)],
      ];
  const page = (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {dashboard ? (
        <header className="reveal flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[34px] font-bold tracking-tight">{greeting(name)}</h1>
            <p className="text-sm text-ink2 first-letter:uppercase">
              {head
                ? (catalog.team.find((u) => u.id === sdrId)?.name ?? 'Toda a equipe')
                : 'Seu escopo'}{' '}
              · {todayLabel()}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <RestoreOrder />
            {head && (
              <select
                aria-label="SDR"
                value={sdrId}
                disabled={busy}
                onChange={(e) => void pick(preset, e.target.value)}
                className="min-h-11 rounded-full border border-line bg-[var(--on)] px-4 text-sm font-semibold text-ink transition-colors hover:border-ink2/40"
              >
                <option value="">Todos os SDRs</option>
                {catalog.team
                  .filter((u) => u.canProspect)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            )}
            <div
              role="group"
              aria-label="Período"
              aria-busy={busy}
              className="grid grid-cols-3 gap-1 rounded-full bg-black/5 p-1 dark:bg-white/10"
            >
              {(['TODAY', 'WEEK', 'MONTH'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={preset === p}
                  disabled={busy}
                  onClick={() => void pick(p)}
                  className={`min-h-9 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-all first-letter:uppercase ${
                    preset === p
                      ? 'bg-[var(--on)] text-ink shadow-[0_2px_10px_rgba(0,0,0,.08)]'
                      : 'text-ink2'
                  }`}
                >
                  {p === 'TODAY' ? 'Hoje' : p === 'WEEK' ? '7 dias' : monthName()}
                </button>
              ))}
            </div>
          </div>
        </header>
      ) : (
        <>
          <h1 className="text-[34px] font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-ink2">
            Resultados no seu escopo. Datas e períodos no horário de Brasília.
          </p>
        </>
      )}
      {!dashboard && (
        <form className="glass-card p-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Período do relatório">
              <select name="period" className={control} defaultValue="MONTH">
                <option value="MONTH">Mês até hoje</option>
                <option value="TODAY">Hoje</option>
                <option value="RANGE">Intervalo</option>
              </select>
            </Field>
            <Field label="De">
              <input name="from" type="date" className={control} />
            </Field>
            <Field label="Até">
              <input name="to" type="date" className={control} />
            </Field>
            {
              <>
                <Field label="SDR do relatório">
                  <select name="sdrId" className={control}>
                    <option value="">Todos no meu escopo</option>
                    {catalog.team
                      .filter((u) => u.canProspect)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Closer do relatório">
                  <select name="closerId" className={control}>
                    <option value="">Todos no meu escopo</option>
                    {catalog.team
                      .filter((u) => u.canClose)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Etapa do relatório">
                  <select name="stage" className={control}>
                    <option value="">Todas</option>
                    {catalog.stages.map((s) => (
                      <option key={s.id} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Perfil do relatório">
                  <select name="tier" className={control}>
                    <option value="">Todos</option>
                    {['P0', 'P1', 'P2'].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Origem do relatório">
                  <select name="source" className={control}>
                    <option value="">Todas</option>
                    {['INSTAGRAM', 'WHATSAPP', 'INDICACAO', 'OUTRO'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Produto do relatório">
                  <select name="productId" className={control}>
                    <option value="">Todos</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            }
          </div>
          <button className={`${button} mt-4`} disabled={busy}>
            Atualizar relatório
          </button>
        </form>
      )}
      <FormError message={error} />
      {dashboard ? (
        <DashboardBoard
          cards={dashCards.filter((c) => !hiddenCards.has(c.id))}
          style={{ '--d': '80ms' } as CSSProperties}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(([label, value], i) => (
              <article key={label} className="glass-card p-5">
                <p className="text-sm text-ink2">{label}</p>
                <p
                  className={`mt-2 text-3xl font-bold tracking-tight ${(sdr ? i >= 4 : i >= 3) ? 'text-gold-deep' : ''}`}
                >
                  {value}
                </p>
              </article>
            ))}
          </div>
          <section className="glass-card flex flex-wrap gap-x-8 gap-y-3 p-5 text-sm">
            <span>
              P0: <b>{m.p0}</b> · P1: <b>{m.p1}</b> · P2: <b>{m.p2}</b>
            </span>
            <span>
              Direto: <b>{m.direct}</b> · Follow: <b>{m.follow}</b>
            </span>
            <span>
              Realizadas: <b>{m.done}</b> · No-show: <b>{m.noShow}</b>
            </span>
            <span>
              Comparecimento: <b>{((m.attendanceBps ?? 0) / 100).toFixed(2)}%</b> · No-show:{' '}
              <b>{((m.noShowBps ?? 0) / 100).toFixed(2)}%</b>
            </span>
            {m.conversionBps !== undefined && (
              <span>
                Conversão: <b>{(m.conversionBps / 100).toFixed(2)}%</b>
              </span>
            )}
          </section>
          <div className="grid items-start gap-5">
            <Breakdown title="Por SDR" rows={data.bySdr} />
            <Breakdown title="Por closer" rows={data.byCloser} />
            <Breakdown title="Por produto" rows={data.byProduct} />
          </div>
        </>
      )}
      {!dashboard && (
        <>
          <div className="flex flex-wrap gap-3">
            <button className={quietButton} onClick={() => window.print()}>
              Imprimir / salvar PDF
            </button>
            <button className={quietButton} disabled={busy} onClick={() => void copy()}>
              {copied ? 'Resumo copiado' : 'Copiar resumo sem telefone'}
            </button>
            {head && (
              <CsvExport
                label="CSV com contatos"
                endpoint="/api/reports/csv"
                filename="npac-relatorio.csv"
                options={[
                  {
                    label: 'Só o período',
                    body: () => ({ period: filters.period, from: filters.from, to: filters.to }),
                  },
                  { label: 'Com os filtros atuais', body: () => filters },
                  { label: 'Tudo', body: () => ({ period: 'ALL' }) },
                ]}
              />
            )}
          </div>
          <section className="glass-card p-5">
            <h2 className="mb-4 text-lg font-bold">
              Leads novos do período · página {data.page} de{' '}
              {Math.max(1, Math.ceil(data.totalLeads / data.pageSize))}
            </h2>
            <ul className="divide-y divide-line">
              {data.leads.map((l) => (
                <li key={l.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <Link className="font-semibold" href={`/leads/${l.id}`}>
                    {l.name}
                  </Link>
                  <span className="text-ink2">
                    {l.stage} · {l.tier}
                  </span>
                </li>
              ))}
            </ul>
            {data.totalLeads > data.pageSize && (
              <nav aria-label="Páginas do relatório" className="mt-4 flex gap-3">
                {[data.page - 1, data.page + 1]
                  .filter((p) => p >= 1 && (p - 1) * data.pageSize < data.totalLeads)
                  .map((p) => (
                    <button
                      key={p}
                      className={quietButton}
                      disabled={busy}
                      onClick={async () => {
                        const next = { ...filters, page: String(p) };
                        setBusy(true);
                        setError('');
                        try {
                          await load(next);
                          setFilters(next);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {p < data.page ? 'Anterior' : 'Próxima'}
                    </button>
                  ))}
              </nav>
            )}
          </section>
        </>
      )}
    </div>
  );
  return dashboard ? (
    <BoardProvider defaults={dashIds} saved={layout?.saved} cookie={layout?.cookie ?? ''}>
      {page}
    </BoardProvider>
  ) : (
    page
  );
}
