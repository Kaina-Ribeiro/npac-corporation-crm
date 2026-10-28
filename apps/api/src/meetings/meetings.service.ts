import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { meetings, user, withUser, type Db } from '@npac/db';
import { isLeader, type AuthUser, type MeetingOrigin, type MeetingOutcome } from '@npac/shared';
import { and, desc, eq } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { recordActivity } from '../leads/activity.js';
import { lockLead } from '../leads/lead-mutations.service.js';
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
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(u: AuthUser, leadId: string) {
    return withUser(this.db, u.id, async (tx) => {
      await lockLead(tx, leadId);
      return tx
        .select()
        .from(meetings)
        .where(eq(meetings.leadId, leadId))
        .orderBy(desc(meetings.scheduledAt))
        .limit(100);
    });
  }
  async create(u: AuthUser, input: Schedule) {
    return withUser(this.db, u.id, async (tx) => {
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
  }
  async update(u: AuthUser, id: string, input: MeetingChange) {
    return withUser(this.db, u.id, async (tx) => {
      const [initial] = await tx.select().from(meetings).where(eq(meetings.id, id));
      if (!initial) throw new NotFoundException();
      await lockLead(tx, initial.leadId);
      const [old] = await tx.select().from(meetings).where(eq(meetings.id, id)).for('update');
      if (!old) throw new NotFoundException();
      if (old.version !== input.version) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      if (old.canceledAt) throw new ConflictException('Reunião cancelada');
      if (input.outcome && old.scheduledAt.getTime() > Date.now())
        throw new BadRequestException('A reunião ainda não aconteceu');
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
  }
}
