'use client';
import type { LeadCatalog, ProductDTO, ReportDTO, ReportRow } from '@npac/shared';
import { money } from '@npac/shared/money';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
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
export function Reports({
  initial,
  catalog,
  products,
  head,
  dashboard = false,
}: {
  initial: ReportDTO;
  catalog: LeadCatalog;
  products: ProductDTO[];
  head: boolean;
  dashboard?: boolean;
}) {
  const [data, setData] = useState(initial),
    [filters, setFilters] = useState<Record<string, string>>({ period: 'MONTH' }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  async function load(selected = filters) {
    setData(await clientApi<ReportDTO>('/api/reports/search', 'POST', selected));
  }
  useCrmRefresh(() => load());
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
  async function csv() {
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/reports/csv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(filters),
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error('Não foi possível exportar; confira o período e seu acesso.');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'npac-relatorio.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const m = data.metrics;
  const cards = [
    ['Leads novos', String(m.leads ?? 0)],
    ['Agendamentos', String(m.meetings ?? 0)],
    ['Vendas', String(m.sales ?? 0)],
    ['Vendido', money(m.soldCents ?? 0)],
    ['Recebido no período', money(m.receivedCents ?? 0)],
    ['A receber das vendas do período', money(m.outstandingCents ?? 0)],
  ];
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <h1 className="text-[34px] font-bold tracking-tight">
        {dashboard ? 'Dashboard' : 'Relatórios'}
      </h1>
      <p className="text-sm text-ink2">
        Resultados no seu escopo. Datas e períodos no horário de Brasília.
      </p>
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
          {!dashboard && (
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
          )}
        </div>
        <button className={`${button} mt-4`} disabled={busy}>
          {dashboard ? 'Atualizar' : 'Atualizar relatório'}
        </button>
      </form>
      <FormError message={error} />
      {dashboard ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                [
                  'Leads novos',
                  String(m.leads ?? 0),
                  `P0 ${m.p0 ?? 0} · P1 ${m.p1 ?? 0} · P2 ${m.p2 ?? 0}`,
                  'leads',
                  chartColors.volume,
                ],
                [
                  'Reuniões agendadas',
                  String(m.meetings ?? 0),
                  `${m.direct ?? 0} diretas · ${m.follow ?? 0} do follow`,
                  'meetings',
                  chartColors.volume,
                ],
                [
                  'Vendido',
                  money(m.soldCents ?? 0),
                  `${m.sales ?? 0} vendas · conversão ${((m.conversionBps ?? 0) / 100).toFixed(0)}%`,
                  'soldCents',
                  chartColors.money,
                ],
                [
                  'Recebido',
                  money(m.receivedCents ?? 0),
                  `A receber: ${money(m.outstandingCents ?? 0)}`,
                  'receivedCents',
                  chartColors.money,
                ],
              ] as const
            ).map(([label, value, foot, key, color]) => (
              <article key={label} className="glass-card flex flex-col gap-1 p-5">
                <p className="text-sm text-ink2">{label}</p>
                <p
                  className={`text-3xl font-bold tracking-tight tabular-nums ${key.endsWith('Cents') ? 'text-gold-deep' : ''}`}
                >
                  {value}
                </p>
                <p className="text-xs text-ink2">{foot}</p>
                <Sparkline values={data.daily.map((d) => d[key])} color={color} />
              </article>
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <RevenueHero
              daily={data.daily}
              previous={data.previousDaily}
              receivedCents={m.receivedCents ?? 0}
              outstandingCents={m.outstandingCents ?? 0}
              monthly={(filters.period ?? 'MONTH') === 'MONTH'}
            />
            <ChartCard
              title="Funil"
              subtitle={`No-show ${((m.noShowBps ?? 0) / 100).toFixed(0)}% das reuniões decididas`}
            >
              <Funnel metrics={m} />
            </ChartCard>
            <ChartCard title="Leads novos por dia" className="lg:col-span-2">
              <DailyBars daily={data.daily} field="leads" label="Leads" />
            </ChartCard>
            <ChartCard title="Perfil dos leads">
              <TierDonut p0={m.p0 ?? 0} p1={m.p1 ?? 0} p2={m.p2 ?? 0} />
            </ChartCard>
            <ChartCard title="Closers" subtitle="Vendido no período">
              <RankBars
                rows={data.byCloser}
                value={(r) => r.soldCents}
                format={money}
                color={chartColors.money}
                detail={(r) =>
                  `${r.sales} vendas · conv. ${((r.conversionBps ?? 0) / 100).toFixed(0)}%`
                }
              />
            </ChartCard>
            <ChartCard title="Ranking de SDRs" subtitle="Reuniões agendadas no período">
              <RankBars
                rows={data.bySdr}
                value={(r) => r.meetings ?? 0}
                format={(v) => String(v)}
                detail={(r) => `${r.sales} vendas`}
              />
            </ChartCard>
            <ChartCard title="Produtos" subtitle="Vendido por produto">
              <RankBars
                rows={data.byProduct}
                value={(r) => r.soldCents}
                format={money}
                color={chartColors.money}
                detail={(r) => `${r.sales}×`}
              />
            </ChartCard>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(([label, value], i) => (
              <article key={label} className="glass-card p-5">
                <p className="text-sm text-ink2">{label}</p>
                <p
                  className={`mt-2 text-3xl font-bold tracking-tight ${i >= 3 ? 'text-gold-deep' : ''}`}
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
            <span>
              Conversão: <b>{((m.conversionBps ?? 0) / 100).toFixed(2)}%</b>
            </span>
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
              <button className={quietButton} disabled={busy} onClick={() => void csv()}>
                CSV com contatos
              </button>
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
}
