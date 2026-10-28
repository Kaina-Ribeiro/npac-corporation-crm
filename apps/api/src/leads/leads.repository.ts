import { Injectable } from '@nestjs/common';
import { leads, meetings, pipelineStages, user, type Tx } from '@npac/db';
import {
  spDayRange,
  type IncomeBand,
  type LeadSource,
  type StageKey,
  type Tier,
} from '@npac/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export interface LeadRow {
  id: string;
  name: string;
  phoneEnc: Buffer | null;
  instagram: string | null;
  incomeBand: IncomeBand;
  source: LeadSource;
  tier: Tier;
  stageKey: StageKey;
  sdrId: string;
  sdrName: string;
  closerId: string | null;
  closerName: string | null;
  nextContactAt: Date | null;
  summary: string | null;
  version: number;
  createdAt: Date;
}

export type LeadSearch =
  | { kind: 'phone'; bidx: string }
  | { kind: 'instagram'; handle: string }
  | { kind: 'text'; term: string; handle: string | null };

export interface LeadFilters {
  search?: LeadSearch;
  stage?: StageKey;
  tier?: Tier;
  sdrId?: string;
  closerId?: string;
  source?: LeadSource;
  period?: 'TODAY' | 'TOMORROW' | 'WEEK' | 'OVERDUE' | 'NO_DATE' | 'RANGE';
  from?: string;
  to?: string;
  sort?: 'createdAt' | 'name' | 'nextContactAt' | 'meetingAt';
  direction?: 'asc' | 'desc';
}

export type LeadInsert = typeof leads.$inferInsert;

const closer = alias(user, 'closer');

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Acesso a dados de leads. Recebe sempre a transação de `withUser`: a visibilidade
 * é decidida pela RLS no Postgres, nunca aqui.
 */
@Injectable()
export class LeadsRepository {
  async stageId(tx: Tx, key: StageKey): Promise<string | undefined> {
    const [row] = await tx
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(eq(pipelineStages.key, key));
    return row?.id;
  }

  async activeUserFlags(
    tx: Tx,
    id: string,
  ): Promise<{ canProspect: boolean; canClose: boolean } | undefined> {
    const [row] = await tx
      .select({ canProspect: user.canProspect, canClose: user.canClose })
      .from(user)
      .where(and(eq(user.id, id), eq(user.active, true)));
    return row;
  }

  async insert(tx: Tx, values: LeadInsert): Promise<string> {
    const [row] = await tx.insert(leads).values(values).returning({ id: leads.id });
    if (!row) throw new Error('insert de lead não retornou id');
    return row.id;
  }

  async findById(tx: Tx, id: string): Promise<LeadRow | undefined> {
    const [row] = await this.baseQuery(tx).where(eq(leads.id, id));
    return row;
  }

  async list(
    tx: Tx,
    filters: LeadFilters,
    page: number,
    pageSize: number,
  ): Promise<{ rows: LeadRow[]; total: number }> {
    const where = this.where(filters);
    const rows = await this.baseQuery(tx)
      .where(where)
      .orderBy(this.order(filters), desc(leads.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [totalRow] = await tx
      .select({ n: count() })
      .from(leads)
      .innerJoin(pipelineStages, eq(pipelineStages.id, leads.stageId))
      .where(where);
    return { rows, total: totalRow?.n ?? 0 };
  }

  private baseQuery(tx: Tx) {
    return tx
      .select({
        id: leads.id,
        name: leads.name,
        phoneEnc: leads.phoneEnc,
        instagram: leads.instagram,
        incomeBand: leads.incomeBand,
        source: leads.source,
        tier: leads.tier,
        stageKey: pipelineStages.key,
        sdrId: leads.sdrId,
        sdrName: user.name,
        closerId: leads.closerId,
        closerName: closer.name,
        nextContactAt: leads.nextContactAt,
        summary: leads.summary,
        version: leads.version,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .innerJoin(pipelineStages, eq(pipelineStages.id, leads.stageId))
      .innerJoin(user, eq(user.id, leads.sdrId))
      .leftJoin(closer, eq(closer.id, leads.closerId))
      .$dynamic();
  }

  private where(f: LeadFilters): SQL | undefined {
    const parts: (SQL | undefined)[] = [isNull(leads.deletedAt)];
    if (f.search?.kind === 'phone') parts.push(eq(leads.phoneBidx, f.search.bidx));
    if (f.search?.kind === 'instagram') parts.push(eq(leads.instagram, f.search.handle));
    if (f.search?.kind === 'text') {
      const byName = ilike(leads.name, `%${escapeLike(f.search.term)}%`);
      parts.push(f.search.handle ? or(byName, eq(leads.instagram, f.search.handle)) : byName);
    }
    if (f.stage) parts.push(eq(pipelineStages.key, f.stage));
    if (f.tier) parts.push(eq(leads.tier, f.tier));
    if (f.sdrId) parts.push(eq(leads.sdrId, f.sdrId));
    if (f.closerId) parts.push(eq(leads.closerId, f.closerId));
    if (f.source) parts.push(eq(leads.source, f.source));
    if (f.period === 'NO_DATE') parts.push(isNull(leads.nextContactAt));
    if (f.period === 'OVERDUE')
      parts.push(
        lt(leads.nextContactAt, spDayRange(new Date()).start),
        notInArray(pipelineStages.key, ['VENDA', 'PERDIDO']),
      );
    if (f.period && !['NO_DATE', 'OVERDUE'].includes(f.period)) {
      const now = new Date();
      let range = spDayRange(now);
      if (f.period === 'TOMORROW') range = spDayRange(range.end);
      if (f.period === 'WEEK')
        range.end = spDayRange(new Date(range.start.getTime() + 6 * 86_400_000)).end;
      if (f.period === 'RANGE' && f.from && f.to)
        range = {
          start: spDayRange(new Date(`${f.from}T12:00:00Z`)).start,
          end: spDayRange(new Date(`${f.to}T12:00:00Z`)).end,
        };
      parts.push(gte(leads.nextContactAt, range.start), lt(leads.nextContactAt, range.end));
    }
    return parts.length > 0 ? and(...parts) : undefined;
  }

  private order(f: LeadFilters): SQL {
    const column =
      f.sort === 'name'
        ? leads.name
        : f.sort === 'nextContactAt'
          ? leads.nextContactAt
          : f.sort === 'meetingAt'
            ? sql`(select min(${meetings.scheduledAt}) from ${meetings} where ${meetings.leadId} = ${leads.id} and ${meetings.canceledAt} is null)`
            : leads.createdAt;
    return sql`${f.direction === 'asc' ? asc(column) : desc(column)} nulls last`;
  }
}
