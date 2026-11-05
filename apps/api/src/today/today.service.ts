import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  auditLog,
  deals,
  payments,
  leads,
  leadTasks,
  meetingConfirmations,
  meetings,
  pipelineStages,
  withUser,
  type Db,
} from '@npac/db';
import { can, spDayRange, type AuthUser, isLeader } from '@npac/shared';
import {
  and,
  asc,
  eq,
  gte,
  inArray,
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
    if (!isLeader(u.role) && (filters.sdrId || filters.closerId)) throw new ForbiddenException();
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
      // Atrasado = já passou da hora (não só de ontem): o contato de hoje vencido sobe sozinho.
      const now = new Date();
      const overdue = await base()
        .where(and(...scope, open, lt(leads.nextContactAt, now)))
        .orderBy(asc(leads.nextContactAt), asc(leads.id))
        .limit(100);
      const contacts = await base()
        .where(and(...scope, open, gte(leads.nextContactAt, now), lt(leads.nextContactAt, end)))
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
          sdrId: leads.sdrId,
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
              // Tarefa pessoal é só de quem a tem; a liderança vê as de alguém ao filtrar por ela.
              and(
                isNull(leadTasks.leadId),
                eq(leadTasks.assigneeId, filters.sdrId ?? filters.closerId ?? u.id),
              ),
            ),
            isNull(leadTasks.completedAt),
            or(lt(leadTasks.dueAt, end), isNull(leadTasks.dueAt)),
            isLeader(u.role) ? undefined : eq(leadTasks.assigneeId, u.id),
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
      // Cobranças são de quem registra recebimento; o SDR não recebe (pedido do cliente, 04/11).
      const charges = !can(u, 'sale:register')
        ? []
        : await tx
            .select({
              id: payments.id,
              dealId: deals.id,
              leadId: leads.id,
              name: leads.name,
              amountCents: payments.amountCents,
              dueAt: payments.dueAt,
              version: payments.version,
            })
            .from(payments)
            .innerJoin(deals, eq(deals.id, payments.dealId))
            .innerJoin(leads, eq(leads.id, deals.leadId))
            .where(
              and(
                isNull(payments.paidAt),
                isNull(deals.reversedAt),
                lt(payments.dueAt, end),
                filters.sdrId ? eq(deals.sdrId, filters.sdrId) : undefined,
                filters.closerId ? eq(deals.closerId, filters.closerId) : undefined,
              ),
            )
            .orderBy(asc(payments.dueAt), asc(payments.id))
            .limit(100);
      // Lembretes de confirmação: só nas reuniões em que a pessoa é dona do lead.
      const own = calls.filter((c) => c.sdrId === u.id && !c.outcome);
      const confirmed = own.length
        ? await tx
            .select({
              meetingId: meetingConfirmations.meetingId,
              step: meetingConfirmations.step,
              scheduledAt: meetingConfirmations.scheduledAt,
            })
            .from(meetingConfirmations)
            .where(
              inArray(
                meetingConfirmations.meetingId,
                own.map((c) => c.id),
              ),
            )
        : [];
      const withReminders = calls.map(({ sdrId, ...c }) => ({
        ...c,
        reminders:
          sdrId === u.id && !c.outcome
            ? {
                confirmed: confirmed
                  .filter(
                    (x) =>
                      x.meetingId === c.id && x.scheduledAt.getTime() === c.scheduledAt.getTime(),
                  )
                  .map((x) => x.step as 'H1' | 'M15'),
              }
            : null,
      }));
      return { overdue, contacts, meetings: withReminders, tasks, charges };
    });
  }
}
