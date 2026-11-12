// Cópia CONGELADA de ReportsService.search e TeamService.members antes da Fase 3 do desempenho
// (docs/plans/desempenho.md, T3.2). Serve só de referência ao teste de equivalência em
// reports.e2e.test.ts: a versão nova tem de responder byte a byte igual. Não alterar.
import { BadRequestException } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import { spDayRange, TIERS, type AuthUser } from '@npac/shared';
import { MEETING_VALUE_CENTS } from '@npac/shared/money';
import { sql, type SQL } from 'drizzle-orm';

export type ReportQuery = {
  page?: number;
  pageSize?: number;
  period: 'TODAY' | 'MONTH' | 'RANGE' | 'ALL';
  from?: string;
  to?: string;
  sdrId?: string;
  closerId?: string;
  source?: string;
  tier?: string;
  stage?: string;
  productId?: string;
};
function window(q: ReportQuery) {
  const today = spDayRange(new Date());
  let start = today.start,
    end = today.end;
  if (q.period === 'RANGE') {
    if (!q.from || !q.to || q.from > q.to) throw new BadRequestException('Intervalo inválido');
    start = spDayRange(new Date(`${q.from}T12:00:00Z`)).start;
    end = spDayRange(new Date(`${q.to}T12:00:00Z`)).end;
    if (end.getTime() - start.getTime() > 367 * 86_400_000)
      throw new BadRequestException('Intervalo máximo de 1 ano');
  }
  if (q.period === 'MONTH') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const v = (key: string) => parts.find((p) => p.type === key)!.value;
    start = spDayRange(new Date(`${v('year')}-${v('month')}-01T12:00:00Z`)).start;
    // Comparação: os mesmos dias do mês anterior (1º até o dia de hoje).
    const prevMonth = new Date(`${v('year')}-${v('month')}-01T12:00:00Z`);
    prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
    const prevStart = spDayRange(prevMonth).start;
    return {
      start,
      end,
      prevStart,
      prevEnd: new Date(
        Math.min(start.getTime(), prevStart.getTime() + (end.getTime() - start.getTime())),
      ),
    };
  }
  return {
    start,
    end,
    prevStart: new Date(start.getTime() - (end.getTime() - start.getTime())),
    prevEnd: start,
  };
}
function scope(q: ReportQuery) {
  const a: SQL[] = [sql`l.deleted_at is null`];
  if (q.sdrId) a.push(sql`l.sdr_id=${q.sdrId}`);
  if (q.closerId)
    a.push(
      sql`(exists(select 1 from meetings m where m.lead_id=l.id and m.closer_id=${q.closerId} and m.canceled_at is null) or exists(select 1 from deals d where d.lead_id=l.id and d.closer_id=${q.closerId}))`,
    );
  if (q.source) a.push(sql`l.source=${q.source}`);
  if (q.tier) a.push(sql`l.tier=${q.tier}`);
  if (q.stage) a.push(sql`s.key=${q.stage}`);
  if (q.productId)
    a.push(
      sql`exists(select 1 from deals d where d.lead_id=l.id and d.product_id=${q.productId}::uuid)`,
    );
  return sql.join(a, sql` and `);
}
function numeric(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => {
      if (k === 'name' || k === 'id' || k === 'date') return [k, v];
      const n = Number(v ?? 0);
      if (!Number.isSafeInteger(n)) throw new BadRequestException('Total fora do limite suportado');
      return [k, n];
    }),
  );
}
/** Valor da reunião realizada pelo perfil atual do lead (`l` = alias do lead). */
const meetingValue = sql`case l.tier::text ${sql.join(
  TIERS.map((t) => sql`when ${t} then ${MEETING_VALUE_CENTS[t]}::int`),
  sql` `,
)} else 0 end`;

/** Campos de venda que o SDR não recebe (pedido do cliente, 04/11/2026): o corte é no servidor. */
const SALE_FIELDS = new Set([
  'soldCents',
  'receivedCents',
  'outstandingCents',
  'conversionBps',
  'ticketCents',
]);
const dropSales = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !SALE_FIELDS.has(k))) as T;

export class LegacyReportsService {
  constructor(private readonly db: Db) {}
  async search(u: Pick<AuthUser, 'id' | 'role'>, q: ReportQuery) {
    const { start, end, prevStart, prevEnd } = window(q);
    const result = await withUser(
      this.db,
      u.id,
      async (tx) => {
        const base = sql`with scope as(select l.* from leads l join pipeline_stages s on s.id=l.stage_id where ${scope(q)}),
    sales as(select d.* from deals d where d.lead_id in(select id from scope) and d.reversed_at is null and d.closed_at>=${start.toISOString()} and d.closed_at<${end.toISOString()}
      and (${q.sdrId ?? null}::text is null or d.sdr_id=${q.sdrId ?? null}) and (${q.closerId ?? null}::text is null or d.closer_id=${q.closerId ?? null}) and (${q.productId ?? null}::uuid is null or d.product_id=${q.productId ?? null}::uuid)),
    calls as(select m.* from meetings m where m.lead_id in(select id from scope) and m.canceled_at is null and (${q.closerId ?? null}::text is null or m.closer_id=${q.closerId ?? null})),
    paid as(select p.amount_cents, p.paid_at from payments p join deals d on d.id=p.deal_id where d.lead_id in(select id from scope) and d.reversed_at is null and (${q.sdrId ?? null}::text is null or d.sdr_id=${q.sdrId ?? null}) and (${q.closerId ?? null}::text is null or d.closer_id=${q.closerId ?? null}) and (${q.productId ?? null}::uuid is null or d.product_id=${q.productId ?? null}::uuid) and p.paid_at>=${start.toISOString()} and p.paid_at<${end.toISOString()})`;
        const metrics = await tx.execute<Record<string, unknown>>(sql`${base} select
   (select count(*) from scope where created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as "leads",
   (select count(*) from scope where tier='P0' and created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as "p0",
   (select count(*) from scope where tier='P1' and created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as "p1",
   (select count(*) from scope where tier='P2' and created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as "p2",
   (select count(*) from scope where tier::text='DESCOBRINDO' and created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as "descobrindo",
   (select count(*) from calls where true and created_at>=${start.toISOString()} and created_at<${end.toISOString()} and canceled_at is null) as "meetings",
   (select count(*) from calls where true and origin='DIRETO' and created_at>=${start.toISOString()} and created_at<${end.toISOString()} and canceled_at is null) as "direct",
   (select count(*) from calls where true and origin='FOLLOW' and created_at>=${start.toISOString()} and created_at<${end.toISOString()} and canceled_at is null) as "follow",
   (select count(*) from calls where true and outcome='DONE' and outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()} and canceled_at is null) as "done",
   (select count(*) from calls where true and outcome='NO_SHOW' and outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()} and canceled_at is null) as "noShow",
   (select count(*) from calls where true and outcome='RESCHEDULED' and outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()}) as "rescheduled",
   (select coalesce(sum(${meetingValue}),0) from calls m join scope l on l.id=m.lead_id where m.outcome='DONE' and m.outcome_at>=${start.toISOString()} and m.outcome_at<${end.toISOString()}) as "meetingValueCents",
   (select count(*) from sales) as "sales",(select coalesce(sum(total_cents),0) from sales) as "soldCents",
   (select coalesce(sum(p.amount_cents),0) from payments p join deals d on d.id=p.deal_id where d.lead_id in(select id from scope) and d.reversed_at is null and (${q.sdrId ?? null}::text is null or d.sdr_id=${q.sdrId ?? null}) and (${q.closerId ?? null}::text is null or d.closer_id=${q.closerId ?? null}) and (${q.productId ?? null}::uuid is null or d.product_id=${q.productId ?? null}::uuid) and p.paid_at>=${start.toISOString()} and p.paid_at<${end.toISOString()}) as "receivedCents",
   (select coalesce(sum(p.amount_cents),0) from payments p join sales d on d.id=p.deal_id where p.paid_at is null) as "outstandingCents"`);
        const conversion = await tx.execute<Record<string, unknown>>(
          sql`${base} select coalesce(round(10000.0*(select count(*) from sales)/nullif((select count(*) from calls where true and outcome='DONE' and outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()} and canceled_at is null),0)),0) as "conversionBps"`,
        );
        const byProduct = await tx.execute<Record<string, unknown>>(
          // Pelo nome atual do catálogo: a venda guarda o nome da época e renomear dividiria a linha.
          sql`${base} select s.product_id as id, p.name as name,count(*) as sales,sum(s.total_cents) as "soldCents",round(avg(s.total_cents)) as "ticketCents" from sales s join products p on p.id=s.product_id group by s.product_id,p.name order by sum(s.total_cents) desc`,
        );
        const rates = await tx.execute<Record<string, unknown>>(
          sql`${base}, outcomes as(select count(*) filter(where outcome='DONE') as done,count(*) filter(where outcome='NO_SHOW') as no_show from calls where outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()}) select coalesce(round(10000.0*no_show/nullif(done+no_show,0)),0) as "noShowBps",coalesce(round(10000.0*done/nullif(done+no_show,0)),0) as "attendanceBps" from outcomes`,
        );
        const bySdr = await tx.execute<Record<string, unknown>>(
          sql`${base}, a as(select sdr_id as id,count(*) as leads,count(*) filter(where tier='P0') as p0,count(*) filter(where tier='P1') as p1,count(*) filter(where tier='P2') as p2,count(*) filter(where tier::text='DESCOBRINDO') as descobrindo from scope where created_at>=${start.toISOString()} and created_at<${end.toISOString()} group by sdr_id),
        b as(select l.sdr_id as id,count(*) filter(where m.created_at>=${start.toISOString()} and m.created_at<${end.toISOString()}) as meetings,
          count(*) filter(where m.origin='DIRETO' and m.created_at>=${start.toISOString()} and m.created_at<${end.toISOString()}) as direct,count(*) filter(where m.origin='FOLLOW' and m.created_at>=${start.toISOString()} and m.created_at<${end.toISOString()}) as follow,
          count(*) filter(where m.outcome='DONE' and m.outcome_at>=${start.toISOString()} and m.outcome_at<${end.toISOString()}) as done,
          count(*) filter(where m.outcome='NO_SHOW' and m.outcome_at>=${start.toISOString()} and m.outcome_at<${end.toISOString()}) as no_show
          from calls m join scope l on l.id=m.lead_id where (m.created_at>=${start.toISOString()} and m.created_at<${end.toISOString()}) or (m.outcome_at>=${start.toISOString()} and m.outcome_at<${end.toISOString()}) group by l.sdr_id),
        c as(select sdr_id as id,count(*) as sales,sum(total_cents) as cents from sales group by sdr_id), actors as(select id from a union select id from b union select id from c)
        select u.id,u.name,coalesce(a.leads,0) as leads,coalesce(a.p0,0) as p0,coalesce(a.p1,0) as p1,coalesce(a.p2,0) as p2,coalesce(a.descobrindo,0) as descobrindo,coalesce(b.direct,0) as direct,coalesce(b.follow,0) as follow,coalesce(b.meetings,0) as meetings,coalesce(b.done,0) as done,coalesce(b.no_show,0) as "noShow",coalesce(c.sales,0) as sales,coalesce(c.cents,0) as "soldCents"
        from actors x join "user" u on u.id=x.id left join a on a.id=x.id left join b on b.id=x.id left join c on c.id=x.id order by coalesce(c.cents,0) desc,u.name`,
        );
        const byCloser = await tx.execute<Record<string, unknown>>(
          sql`${base}, a as(select closer_id as id,count(*) filter(where created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as meetings,
         count(*) filter(where outcome='DONE' and outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()}) as done,
         count(*) filter(where outcome='NO_SHOW' and outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()}) as no_show from calls
         where (created_at>=${start.toISOString()} and created_at<${end.toISOString()}) or (outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()}) group by closer_id),
        b as(select closer_id as id,count(*) as sales,sum(total_cents) as cents from sales group by closer_id),actors as(select id from a union select id from b)
        select u.id,u.name,coalesce(a.meetings,0) as meetings,coalesce(a.done,0) as done,coalesce(a.no_show,0) as "noShow",coalesce(b.sales,0) as sales,coalesce(b.cents,0) as "soldCents",coalesce(round(10000.0*b.sales/nullif(a.done,0)),0) as "conversionBps",coalesce(round(10000.0*a.no_show/nullif(a.done+a.no_show,0)),0) as "noShowBps"
        from actors x join "user" u on u.id=x.id left join a on a.id=x.id left join b on b.id=x.id order by coalesce(b.cents,0) desc,u.name`,
        );
        // Um ponto por dia (Brasília) para os gráficos; dias sem movimento entram zerados.
        const daily = await tx.execute<Record<string, unknown>>(
          sql`${base}, days as(select generate_series((${start.toISOString()}::timestamptz at time zone 'America/Sao_Paulo')::date,
            ((${end.toISOString()}::timestamptz - interval '1 millisecond') at time zone 'America/Sao_Paulo')::date, interval '1 day')::date as day)
          select to_char(x.day, 'YYYY-MM-DD') as date,
            (select count(*) from scope where (created_at at time zone 'America/Sao_Paulo')::date = x.day and created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as leads,
            (select count(*) from calls where (created_at at time zone 'America/Sao_Paulo')::date = x.day and created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as meetings,
            (select coalesce(sum(total_cents),0) from sales where (closed_at at time zone 'America/Sao_Paulo')::date = x.day) as "soldCents",
            (select coalesce(sum(amount_cents),0) from paid where (paid_at at time zone 'America/Sao_Paulo')::date = x.day) as "receivedCents",
            (select coalesce(sum(${meetingValue}),0) from calls m join scope l on l.id=m.lead_id where m.outcome='DONE' and (m.outcome_at at time zone 'America/Sao_Paulo')::date = x.day and m.outcome_at>=${start.toISOString()} and m.outcome_at<${end.toISOString()}) as "meetingValueCents"
          from days x order by x.day`,
        );
        // Vendido por dia no período anterior equivalente (mesmo escopo e filtros).
        const previousDaily = await tx.execute<Record<string, unknown>>(
          sql`with scope as(select l.* from leads l join pipeline_stages s on s.id=l.stage_id where ${scope(q)}),
          prev as(select d.* from deals d where d.lead_id in(select id from scope) and d.reversed_at is null and d.closed_at>=${prevStart.toISOString()} and d.closed_at<${prevEnd.toISOString()}
            and (${q.sdrId ?? null}::text is null or d.sdr_id=${q.sdrId ?? null}) and (${q.closerId ?? null}::text is null or d.closer_id=${q.closerId ?? null}) and (${q.productId ?? null}::uuid is null or d.product_id=${q.productId ?? null}::uuid)),
          days as(select generate_series(0, ${daily.length - 1}) as i)
          select to_char((${prevStart.toISOString()}::timestamptz at time zone 'America/Sao_Paulo')::date + x.i, 'YYYY-MM-DD') as date,
            (select coalesce(sum(total_cents),0) from prev where (closed_at at time zone 'America/Sao_Paulo')::date = (${prevStart.toISOString()}::timestamptz at time zone 'America/Sao_Paulo')::date + x.i) as "soldCents"
          from days x order by x.i`,
        );
        const rows = await tx.execute<{ id: string; name: string; stage: string; tier: string }>(
          sql`${base} select l.id,l.name,s.label as stage,l.tier from scope l join pipeline_stages s on s.id=l.stage_id where l.created_at>=${start.toISOString()} and l.created_at<${end.toISOString()} order by l.created_at desc,l.id limit ${q.pageSize ?? 20} offset ${((q.page ?? 1) - 1) * (q.pageSize ?? 20)}`,
        );
        return {
          metrics: { ...numeric(metrics[0]!), ...numeric(conversion[0]!), ...numeric(rates[0]!) },
          byProduct: byProduct.map(numeric),
          daily: daily.map(numeric),
          previousDaily: previousDaily.map(numeric),
          bySdr: bySdr.map(numeric),
          byCloser: byCloser.map(numeric),
          leads: [...rows],
          page: q.page ?? 1,
          pageSize: q.pageSize ?? 20,
          totalLeads: Number(metrics[0]!.leads),
          from: start.toISOString(),
          to: end.toISOString(),
        };
      },
      { isolationLevel: 'repeatable read' },
    );
    if (u.role !== 'SDR') return result;
    return {
      ...result,
      metrics: dropSales(result.metrics),
      byProduct: [],
      previousDaily: [],
      daily: result.daily.map(dropSales),
      bySdr: result.bySdr.map(dropSales),
      byCloser: result.byCloser.map(dropSales),
    };
  }
}

type Row = Record<string, unknown> & { id: string };

/** `TeamService.members` de antes, sobre a busca congelada acima. */
export async function legacyTeam(db: Db, u: Pick<AuthUser, 'id' | 'role'>) {
  const users = await withUser(db, u.id, async (tx) => [
    ...(await tx.execute<{
      id: string;
      name: string;
      role: string;
      can_prospect: boolean;
      can_close: boolean;
    }>(
      sql`select id, name, role, can_prospect, can_close from "user" where active order by role, name`,
    )),
  ]);
  const r = await new LegacyReportsService(db).search(u, { period: 'MONTH', pageSize: 1 });
  const bySdr = new Map((r.bySdr as Row[]).map((x) => [x.id, x]));
  const byCloser = new Map((r.byCloser as Row[]).map((x) => [x.id, x]));
  const sales = new Map(
    (
      await withUser(db, u.id, (tx) =>
        tx.execute<{ id: string; sales: string; cents: string }>(sql`
          select t.id, count(*) as sales, coalesce(sum(t.total_cents), 0) as cents
          from (select distinct x.id, d.id as deal_id, d.total_cents
            from deals d
            join leads l on l.id = d.lead_id and l.deleted_at is null
            cross join lateral (values (d.sdr_id), (d.closer_id)) x(id)
            where d.reversed_at is null and d.closed_at >= ${r.from} and d.closed_at < ${r.to}) t
          group by t.id`),
      )
    ).map((x) => [x.id, x]),
  );
  const leader = u.role === 'HEAD' || u.role === 'DIRETOR';
  const stats = (id: string) => {
    if (!leader && id !== u.id) return null;
    const s = bySdr.get(id);
    const c = byCloser.get(id);
    const n = (v: unknown) => Number(v ?? 0);
    return {
      leads: n(s?.leads),
      meetings: n(s?.meetings) + n(c?.meetings),
      done: n(s?.done) + n(c?.done),
      sales: n(sales.get(id)?.sales),
      ...(u.role === 'SDR' ? {} : { soldCents: n(sales.get(id)?.cents) }),
    };
  };
  return {
    from: r.from,
    to: r.to,
    members: users.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      canProspect: m.can_prospect,
      canClose: m.can_close,
      stats: stats(m.id),
    })),
  };
}
