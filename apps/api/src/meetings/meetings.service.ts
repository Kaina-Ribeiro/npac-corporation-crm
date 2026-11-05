import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { meetingConfirmations, meetings, user, withUser, type Db } from '@npac/db';
import { isLeader, type AuthUser, type MeetingOrigin, type MeetingOutcome } from '@npac/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { recordActivity } from '../leads/activity.js';
import { lockLead } from '../leads/lead-mutations.service.js';
import { ReminderScheduler } from '../push/reminders.js';
import { cancelMeeting } from './cancel.js';

type Schedule = { leadId: string; closerId: string; scheduledAt: Date; origin: MeetingOrigin };
type MeetingChange = {
  version: number;
  scheduledAt?: Date;
  closerId?: string;
  outcome?: MeetingOutcome;
  cancel?: true;
};

@Injectable()
export class MeetingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reminders: ReminderScheduler,
  ) {}

  async list(u: AuthUser, leadId: string) {
    return withUser(this.db, u.id, async (tx) => {
      await lockLead(tx, leadId);
      const rows = await tx
        .select()
        .from(meetings)
        .where(eq(meetings.leadId, leadId))
        .orderBy(desc(meetings.scheduledAt))
        .limit(100);
      // Etapas confirmadas no horário atual de cada reunião (a liderança vê o que faltou).
      const confirmed = rows.length
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
                rows.map((r) => r.id),
              ),
            )
        : [];
      return rows.map((m) => ({
        ...m,
        confirmations: confirmed
          .filter(
            (c) => c.meetingId === m.id && c.scheduledAt.getTime() === m.scheduledAt.getTime(),
          )
          .map((c) => c.step),
      }));
    });
  }

  /**
   * "Confirmação enviada" de uma etapa (1 h ou 15 min). Só o dono do lead; reunião de outro
   * é 404, como se não existisse. Idempotente por reunião, etapa e horário.
   */
  async confirm(u: AuthUser, id: string, step: 'H1' | 'M15') {
    return withUser(this.db, u.id, async (tx) => {
      const [m] = await tx.execute<{
        lead_id: string;
        sdr_id: string;
        scheduled_at: Date | string;
        canceled_at: Date | null;
        outcome: string | null;
      }>(sql`select m.lead_id, l.sdr_id, m.scheduled_at, m.canceled_at, m.outcome
        from meetings m join leads l on l.id = m.lead_id
        where m.id = ${id} and l.deleted_at is null`);
      if (!m || m.sdr_id !== u.id) throw new NotFoundException();
      if (m.canceled_at || m.outcome) throw new ConflictException('A reunião já foi encerrada');
      const scheduledAt = new Date(m.scheduled_at);
      if (scheduledAt.getTime() <= Date.now())
        throw new BadRequestException('A reunião já começou');
      const inserted = await tx
        .insert(meetingConfirmations)
        .values({ meetingId: id, step, scheduledAt, userId: u.id })
        .onConflictDoNothing()
        .returning({ id: meetingConfirmations.id });
      if (inserted.length)
        await recordActivity(tx, u, m.lead_id, 'meeting.confirmed', ['step'], id);
      return { ok: true };
    });
  }
  async create(u: AuthUser, input: Schedule) {
    const result = await withUser(this.db, u.id, async (tx) => {
      await lockLead(tx, input.leadId);
      const [closer] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.id, input.closerId), eq(user.active, true), eq(user.canClose, true)));
      if (!closer) throw new BadRequestException('Closer inválido');
      const [created] = await tx
        .insert(meetings)
        .values({ ...input, createdBy: u.id })
        .returning();
      await recordActivity(tx, u, input.leadId, 'meeting.scheduled', [], created!.id);
      return { id: created!.id, version: created!.version };
    });
    void this.reminders.rearm();
    return result;
  }
  async update(u: AuthUser, id: string, input: MeetingChange) {
    const result = await withUser(this.db, u.id, async (tx) => {
      const [initial] = await tx.select().from(meetings).where(eq(meetings.id, id));
      if (!initial) throw new NotFoundException();
      await lockLead(tx, initial.leadId);
      const [old] = await tx.select().from(meetings).where(eq(meetings.id, id)).for('update');
      if (!old) throw new NotFoundException();
      if (old.version !== input.version) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      if (old.canceledAt) throw new ConflictException('Reunião cancelada');
      if (input.outcome && old.scheduledAt.getTime() > Date.now())
        throw new BadRequestException('A reunião ainda não aconteceu');
      // Com resultado, a reunião está encerrada: não remarca, não troca closer nem cancela.
      // Só a liderança corrige um resultado registrado errado.
      if (old.outcome && !(input.outcome && isLeader(u.role)))
        throw new ConflictException('A reunião já tem resultado');
      if (input.closerId) {
        if (!isLeader(u.role)) throw new ForbiddenException();
        const [closer] = await tx
          .select({ id: user.id })
          .from(user)
          .where(and(eq(user.id, input.closerId), eq(user.active, true), eq(user.canClose, true)));
        if (!closer) throw new BadRequestException('Closer inválido');
      }
      const patch: Partial<typeof meetings.$inferInsert> = {
        version: old.version + 1,
        updatedAt: new Date(),
      };
      if (input.scheduledAt) patch.scheduledAt = input.scheduledAt;
      if (input.closerId) patch.closerId = input.closerId;
      if (input.outcome) {
        patch.outcome = input.outcome;
        patch.outcomeAt = new Date();
      }
      if (input.cancel) patch.canceledAt = new Date();
      const kind = input.cancel
        ? 'meeting.canceled'
        : input.outcome
          ? 'meeting.outcome'
          : 'meeting.rescheduled';
      // Registra antes da alteração que pode revogar o próprio acesso ao lead.
      await recordActivity(
        tx,
        u,
        old.leadId,
        kind,
        Object.keys(patch).filter((k) => !['version', 'updatedAt', 'outcomeAt'].includes(k)),
        id,
      );
      if (input.cancel) await cancelMeeting(tx, id, old.version);
      else await tx.update(meetings).set(patch).where(eq(meetings.id, id));
      return { id, version: old.version + 1 };
    });
    // Depois do commit: remarcar recomeça as etapas; cancelar ou resultado desarma.
    void this.reminders.rearm();
    return result;
  }
}
