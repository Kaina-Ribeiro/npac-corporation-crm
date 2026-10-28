import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import { spDayRange, type AuthUser } from '@npac/shared';
import { sql, type SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { DB } from '../common/db/db.module.js';

export type ReportQuery = {
  page?: number;
  pageSize?: number;
  period: 'TODAY' | 'MONTH' | 'RANGE';
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
  }
  if (q.period === 'MONTH') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const v = (key: string) => parts.find((p) => p.type === key)!.value;
    start = spDayRange(new Date(`${v('year')}-${v('month')}-01T12:00:00Z`)).start;
  }
  return { start, end };
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
      if (k === 'name' || k === 'id') return [k, v];
      const n = Number(v ?? 0);
      if (!Number.isSafeInteger(n)) throw new BadRequestException('Total fora do limite suportado');
      return [k, n];
    }),
  );
}
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly crypto: FieldCrypto,
  ) {}
  async search(u: AuthUser, q: ReportQuery, opts: { audit?: boolean } = {}) {
    const { start, end } = window(q);
    const result = await withUser(
      this.db,
      u.id,
      async (tx) => {
        const base = sql`with scope as(select l.* from leads l join pipeline_stages s on s.id=l.stage_id where ${scope(q)}),
    sales as(select d.* from deals d where d.lead_id in(select id from scope) and d.reversed_at is null and d.closed_at>=${start.toISOString()} and d.closed_at<${end.toISOString()}
      and (${q.sdrId ?? null}::text is null or d.sdr_id=${q.sdrId ?? null}) and (${q.closerId ?? null}::text is null or d.closer_id=${q.closerId ?? null}) and (${q.productId ?? null}::uuid is null or d.product_id=${q.productId ?? null}::uuid)),
    calls as(select m.* from meetings m where m.lead_id in(select id from scope) and m.canceled_at is null and (${q.closerId ?? null}::text is null or m.closer_id=${q.closerId ?? null}))`;
        const metrics = await tx.execute<Record<string, unknown>>(sql`${base} select
   (select count(*) from scope where created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as "leads",
   (select count(*) from scope where tier='P0' and created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as "p0",
   (select count(*) from scope where tier='P1' and created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as "p1",
   (select count(*) from scope where tier='P2' and created_at>=${start.toISOString()} and created_at<${end.toISOString()}) as "p2",
   (select count(*) from calls where true and created_at>=${start.toISOString()} and created_at<${end.toISOString()} and canceled_at is null) as "meetings",
   (select count(*) from calls where true and origin='DIRETO' and created_at>=${start.toISOString()} and created_at<${end.toISOString()} and canceled_at is null) as "direct",
   (select count(*) from calls where true and origin='FOLLOW' and created_at>=${start.toISOString()} and created_at<${end.toISOString()} and canceled_at is null) as "follow",
   (select count(*) from calls where true and outcome='DONE' and outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()} and canceled_at is null) as "done",
   (select count(*) from calls where true and outcome='NO_SHOW' and outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()} and canceled_at is null) as "noShow",
   (select count(*) from sales) as "sales",(select coalesce(sum(total_cents),0) from sales) as "soldCents",
   (select coalesce(sum(p.amount_cents),0) from payments p join deals d on d.id=p.deal_id where d.lead_id in(select id from scope) and d.reversed_at is null and (${q.sdrId ?? null}::text is null or d.sdr_id=${q.sdrId ?? null}) and (${q.closerId ?? null}::text is null or d.closer_id=${q.closerId ?? null}) and (${q.productId ?? null}::uuid is null or d.product_id=${q.productId ?? null}::uuid) and p.paid_at>=${start.toISOString()} and p.paid_at<${end.toISOString()}) as "receivedCents",
   (select coalesce(sum(p.amount_cents),0) from payments p join sales d on d.id=p.deal_id where p.paid_at is null) as "outstandingCents"`);
        const conversion = await tx.execute<Record<string, unknown>>(
          sql`${base} select coalesce(round(10000.0*(select count(*) from sales)/nullif((select count(*) from calls where true and outcome='DONE' and outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()} and canceled_at is null),0)),0) as "conversionBps"`,
        );
        const byProduct = await tx.execute<Record<string, unknown>>(
          sql`${base} select product_id as id, product_name as name,count(*) as sales,sum(total_cents) as "soldCents",round(avg(total_cents)) as "ticketCents" from sales group by product_id,product_name order by sum(total_cents) desc`,
        );
        const rates = await tx.execute<Record<string, unknown>>(
          sql`${base}, outcomes as(select count(*) filter(where outcome='DONE') as done,count(*) filter(where outcome='NO_SHOW') as no_show from calls where outcome_at>=${start.toISOString()} and outcome_at<${end.toISOString()}) select coalesce(round(10000.0*no_show/nullif(done+no_show,0)),0) as "noShowBps",coalesce(round(10000.0*done/nullif(done+no_show,0)),0) as "attendanceBps" from outcomes`,
        );
        const bySdr = await tx.execute<Record<string, unknown>>(
          sql`${base}, a as(select sdr_id as id,count(*) as leads,count(*) filter(where tier='P0') as p0,count(*) filter(where tier='P1') as p1,count(*) filter(where tier='P2') as p2 from scope where created_at>=${start.toISOString()} and created_at<${end.toISOString()} group by sdr_id),
        b as(select l.sdr_id as id,count(*) filter(where m.created_at>=${start.toISOString()} and m.created_at<${end.toISOString()}) as meetings,
          count(*) filter(where m.origin='DIRETO' and m.created_at>=${start.toISOString()} and m.created_at<${end.toISOString()}) as direct,count(*) filter(where m.origin='FOLLOW' and m.created_at>=${start.toISOString()} and m.created_at<${end.toISOString()}) as follow,
          count(*) filter(where m.outcome='DONE' and m.outcome_at>=${start.toISOString()} and m.outcome_at<${end.toISOString()}) as done,
          count(*) filter(where m.outcome='NO_SHOW' and m.outcome_at>=${start.toISOString()} and m.outcome_at<${end.toISOString()}) as no_show
          from calls m join scope l on l.id=m.lead_id where (m.created_at>=${start.toISOString()} and m.created_at<${end.toISOString()}) or (m.outcome_at>=${start.toISOString()} and m.outcome_at<${end.toISOString()}) group by l.sdr_id),
        c as(select sdr_id as id,count(*) as sales,sum(total_cents) as cents from sales group by sdr_id), actors as(select id from a union select id from b union select id from c)
        select u.id,u.name,coalesce(a.leads,0) as leads,coalesce(a.p0,0) as p0,coalesce(a.p1,0) as p1,coalesce(a.p2,0) as p2,coalesce(b.direct,0) as direct,coalesce(b.follow,0) as follow,coalesce(b.meetings,0) as meetings,coalesce(b.done,0) as done,coalesce(b.no_show,0) as "noShow",coalesce(c.sales,0) as sales,coalesce(c.cents,0) as "soldCents"
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
        const rows = await tx.execute<{ id: string; name: string; stage: string; tier: string }>(
          sql`${base} select l.id,l.name,s.label as stage,l.tier from scope l join pipeline_stages s on s.id=l.stage_id where l.created_at>=${start.toISOString()} and l.created_at<${end.toISOString()} order by l.created_at desc,l.id limit ${q.pageSize ?? 20} offset ${((q.page ?? 1) - 1) * (q.pageSize ?? 20)}`,
        );
        return {
          metrics: { ...numeric(metrics[0]!), ...numeric(conversion[0]!), ...numeric(rates[0]!) },
          byProduct: byProduct.map(numeric),
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
    if (opts.audit !== false)
      await this.audit.record({
        actorId: u.id,
        action: 'report.view',
        entityType: 'report',
        data: { ids: result.leads.map((r) => r.id) },
      });
    return result;
  }
  async csv(u: AuthUser, q: ReportQuery) {
    const { start, end } = window(q);
    const rows = await withUser(this.db, u.id, (tx) =>
      tx.execute<{
        id: string;
        name: string;
        phone_enc: Buffer | null;
        instagram: string | null;
        tier: string;
      }>(
        sql`select l.id,l.name,l.phone_enc,l.instagram,l.tier from leads l join pipeline_stages s on s.id=l.stage_id where ${scope(q)} and l.created_at>=${start.toISOString()} and l.created_at<${end.toISOString()} order by l.created_at,l.id limit 10001`,
      ),
    );
    if (rows.length > 10000)
      throw new BadRequestException('Reduza o período para exportar até 10 mil leads');
    await this.audit.record({
      actorId: u.id,
      action: 'report.export.csv',
      entityType: 'report',
      data: { count: rows.length },
    });
    return (
      '\ufeff' +
      [
        ['Nome', 'Telefone', 'Instagram', 'Perfil'],
        ...rows.map((r) => [
          r.name,
          r.phone_enc ? this.crypto.decrypt(r.phone_enc) : '',
          r.instagram ?? '',
          r.tier,
        ]),
      ]
        .map((r) => r.map(csvCell).join(';'))
        .join('\r\n')
    );
  }
  async summary(u: AuthUser, q: ReportQuery) {
    const r = await this.search(u, q);
    const m = r.metrics;
    const money = (v: unknown) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
        Number(v) / 100,
      );
    await this.audit.record({
      actorId: u.id,
      action: 'report.export.summary',
      entityType: 'report',
    });
    return {
      text: `NPAC Corporation\nLeads: ${m.leads}\nReuniões: ${m.meetings}\nVendas: ${m.sales}\nVendido: ${money(m.soldCents)}\nRecebido: ${money(m.receivedCents)}\nA receber das vendas do período: ${money(m.outstandingCents)}`,
    };
  }
}
