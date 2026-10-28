import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { auditLog, leads, leadTasks, meetings, pipelineStages, withUser, type Db } from '@npac/db';
import { spDayRange, type AuthUser } from '@npac/shared';
import {
  and,
  asc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';

@Injectable()
export class TodayService {
  constructor(@Inject(DB) private readonly db: Db) {}
  async search(u: AuthUser, filters: { sdrId?: string; closerId?: string }) {
    if (u.role !== 'HEAD' && (filters.sdrId || filters.closerId)) throw new ForbiddenException();
    const { start, end } = spDayRange(new Date());
    return withUser(this.db, u.id, async (tx) => {
      const scope: SQL[] = [isNull(leads.deletedAt)];
      if (filters.sdrId) scope.push(eq(leads.sdrId, filters.sdrId));
      if (filters.closerId)
        scope.push(
          sql`exists(select 1 from ${meetings} where ${meetings.leadId} = ${leads.id} and ${meetings.closerId} = ${filters.closerId} and ${meetings.canceledAt} is null)`,
        );
      const base = () =>
        tx
          .select({
            id: leads.id,
            name: leads.name,
            nextContactAt: leads.nextContactAt,
            version: leads.version,
          })
          .from(leads)
          .innerJoin(pipelineStages, eq(pipelineStages.id, leads.stageId));
      const open = notInArray(pipelineStages.key, ['VENDA', 'PERDIDO']);
      const overdue = await base()
        .where(and(...scope, open, lt(leads.nextContactAt, start)))
        .orderBy(asc(leads.nextContactAt), asc(leads.id))
        .limit(100);
      const contacts = await base()
        .where(and(...scope, open, gte(leads.nextContactAt, start), lt(leads.nextContactAt, end)))
        .orderBy(asc(leads.nextContactAt), asc(leads.id))
        .limit(100);
      const calls = await tx
        .select({
          id: meetings.id,
          leadId: leads.id,
          name: leads.name,
          scheduledAt: meetings.scheduledAt,
          outcome: meetings.outcome,
          version: meetings.version,
        })
        .from(meetings)
        .innerJoin(leads, eq(leads.id, meetings.leadId))
        .where(
          and(
            ...scope,
            isNull(meetings.canceledAt),
            gte(meetings.scheduledAt, start),
            lt(meetings.scheduledAt, end),
          ),
        )
        .orderBy(asc(meetings.scheduledAt), asc(meetings.id))
        .limit(100);
      const tasks = await tx
        .select({
          id: leadTasks.id,
          leadId: leads.id,
          name: leads.name,
          title: leadTasks.title,
          dueAt: leadTasks.dueAt,
          version: leadTasks.version,
        })
        .from(leadTasks)
        .leftJoin(leads, eq(leads.id, leadTasks.leadId))
        .where(
          and(
            or(
              and(isNotNull(leads.id), ...scope),
              and(
                isNull(leadTasks.leadId),
                filters.sdrId ? eq(leadTasks.assigneeId, filters.sdrId) : undefined,
                filters.closerId ? eq(leadTasks.assigneeId, filters.closerId) : undefined,
              ),
            ),
            isNull(leadTasks.completedAt),
            or(lt(leadTasks.dueAt, end), isNull(leadTasks.dueAt)),
            u.role === 'HEAD' ? undefined : eq(leadTasks.assigneeId, u.id),
          ),
        )
        .orderBy(sql`${leadTasks.dueAt} asc nulls last`, asc(leadTasks.id))
        .limit(100);
      await tx.insert(auditLog).values({
        actorId: u.id,
        action: 'today.view',
        entityType: 'lead',
        data: {
          ids: [...overdue, ...contacts, ...calls, ...tasks].map((r) =>
            'leadId' in r ? r.leadId : r.id,
          ),
        },
      });
      return { overdue, contacts, meetings: calls, tasks };
    });
  }
}
