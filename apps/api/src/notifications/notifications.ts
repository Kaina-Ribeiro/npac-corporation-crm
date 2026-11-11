import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, Post } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import { spDayRange, type AuthUser } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { validate } from '../common/validate.js';
import { ViewsController, ViewsService } from './views.js';

const iso = (v: unknown) => new Date(v as string).toISOString();

@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Caixa de avisos: últimos 30 + o que pede ação agora (reuniões em 2h, follow-ups atrasados). */
  inbox(u: AuthUser) {
    const { start } = spDayRange(new Date());
    return withUser(this.db, u.id, async (tx) => {
      const items = await tx.execute<Record<string, unknown>>(sql`
        select n.id, n.created_at as at, n.read_at is not null as read, t.kind, a.name as "actorName",
          t.lead_id as "leadId", l.name as "leadName"
        from notifications n join lead_timeline t on t.id = n.timeline_id
        join "user" a on a.id = t.actor_id
        left join leads l on l.id = t.lead_id and l.deleted_at is null and l.anonymized_at is null
        where n.user_id = ${u.id} order by n.created_at desc, n.id limit 30`);
      const [counts] = await tx.execute<{ unread: number; overdue: number }>(sql`
        select (select count(*)::int from notifications where user_id = ${u.id} and read_at is null) as unread,
          (select count(*)::int from leads l join pipeline_stages s on s.id = l.stage_id
            where l.sdr_id = ${u.id} and l.deleted_at is null and s.key not in ('VENDA','PERDIDO')
            and (${u.role} <> 'SDR' or s.key <> 'AGENDOU_PAGAMENTO')
            and l.next_contact_at < ${start.toISOString()}) as overdue`);
      const soon = await tx.execute<Record<string, unknown>>(sql`
        select m.id, m.scheduled_at as at, m.lead_id as "leadId", l.name as "leadName"
        from meetings m join leads l on l.id = m.lead_id
        where m.closer_id = ${u.id} and m.canceled_at is null and m.outcome is null
          and m.scheduled_at >= now() - interval '15 minutes' and m.scheduled_at < now() + interval '2 hours'
        order by m.scheduled_at limit 5`);
      // Lembretes de confirmação: reuniões das próximas 2 h em que a pessoa é dona do lead.
      const reminders = await tx.execute<Record<string, unknown> & { confirmed: string[] }>(sql`
        select m.id, m.scheduled_at as at, m.lead_id as "leadId", l.name as "leadName",
          coalesce((select array_agg(c.step order by c.step) from meeting_confirmations c
            where c.meeting_id = m.id and c.scheduled_at = m.scheduled_at), '{}') as confirmed
        from meetings m join leads l on l.id = m.lead_id and l.deleted_at is null
        where l.sdr_id = ${u.id} and m.canceled_at is null and m.outcome is null
          and m.scheduled_at > now() and m.scheduled_at < now() + interval '2 hours'
        order by m.scheduled_at limit 20`);
      const [chat] = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from chat_messages m
        where m.author_id <> ${u.id} and m.id > coalesce((select r.last_read_id from chat_reads r
          where r.channel_id = m.channel_id and r.user_id = ${u.id}), 0)`);
      return {
        chatUnread: chat!.n,
        reminders: reminders.map((r) => ({ ...r, at: iso(r.at) })),
        unread: counts!.unread,
        overdue: counts!.overdue,
        items: items.map((i) => ({ ...i, at: iso(i.at) })),
        soon: soon.map((s) => ({ ...s, at: iso(s.at) })),
      };
    });
  }

  /** Marca como lidos (todos ou os ids dados); a RLS garante que são só os da pessoa. */
  async markRead(u: AuthUser, ids?: string[]) {
    await withUser(this.db, u.id, (tx) =>
      tx.execute(sql`update notifications set read_at = now()
        where user_id = ${u.id} and read_at is null
        ${ids ? sql`and id = any(string_to_array(${ids.join(',')}, ',')::uuid[])` : sql``}`),
    );
    return { ok: true };
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() inbox(@CurrentUser() u: SessionUser) {
    return this.notifications.inbox(u);
  }
  @Post('read') @HttpCode(200) read(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const { ids } = validate(
      z.object({ ids: z.array(z.uuid()).max(100).optional() }).strict(),
      body,
    );
    return this.notifications.markRead(u, ids);
  }
}

@Module({
  controllers: [NotificationsController, ViewsController],
  providers: [NotificationsService, ViewsService],
})
export class NotificationsModule {}
