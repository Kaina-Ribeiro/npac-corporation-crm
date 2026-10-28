import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { auditLog, leadNotes, leadTasks, leadTimeline, withUser, type Db } from '@npac/db';
import { isLeader, type AuthUser } from '@npac/shared';
import { and, desc, eq } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { recordActivity } from './activity.js';
import { lockLead } from './lead-mutations.service.js';

@Injectable()
export class LeadActivityService {
  constructor(@Inject(DB) private readonly db: Db) {}
  async list(u: AuthUser, id: string) {
    return withUser(this.db, u.id, async (tx) => {
      await lockLead(tx, id);
      await tx
        .insert(auditLog)
        .values({ actorId: u.id, action: 'lead.activity.view', entityType: 'lead', entityId: id });
      return {
        notes: await tx
          .select()
          .from(leadNotes)
          .where(eq(leadNotes.leadId, id))
          .orderBy(desc(leadNotes.createdAt), desc(leadNotes.id))
          .limit(100),
        tasks: await tx
          .select()
          .from(leadTasks)
          .where(eq(leadTasks.leadId, id))
          .orderBy(desc(leadTasks.createdAt), desc(leadTasks.id))
          .limit(100),
        timeline: await tx
          .select()
          .from(leadTimeline)
          .where(eq(leadTimeline.leadId, id))
          .orderBy(desc(leadTimeline.at), desc(leadTimeline.id))
          .limit(100),
      };
    });
  }
  async note(u: AuthUser, id: string, body: string) {
    return withUser(this.db, u.id, async (tx) => {
      await lockLead(tx, id);
      const [row] = await tx
        .insert(leadNotes)
        .values({ leadId: id, body, createdBy: u.id })
        .returning();
      await recordActivity(tx, u, id, 'note.created', [], row!.id);
      return row;
    });
  }
  async editNote(
    u: AuthUser,
    id: string,
    noteId: string,
    input: { version: number; body: string },
  ) {
    return withUser(this.db, u.id, async (tx) => {
      await lockLead(tx, id);
      const [old] = await tx
        .select()
        .from(leadNotes)
        .where(and(eq(leadNotes.id, noteId), eq(leadNotes.leadId, id)))
        .for('update');
      if (!old) throw new NotFoundException();
      if (old.createdBy !== u.id && !isLeader(u.role)) throw new ForbiddenException();
      if (old.version !== input.version) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      const [row] = await tx
        .update(leadNotes)
        .set({ body: input.body, version: old.version + 1, updatedAt: new Date() })
        .where(eq(leadNotes.id, noteId))
        .returning();
      await recordActivity(tx, u, id, 'note.updated', ['body'], noteId);
      return row;
    });
  }
  async task(u: AuthUser, id: string, input: { title: string; dueAt?: Date | null }) {
    return withUser(this.db, u.id, async (tx) => {
      await lockLead(tx, id);
      const [row] = await tx
        .insert(leadTasks)
        .values({ ...input, leadId: id, assigneeId: u.id, createdBy: u.id })
        .returning();
      await recordActivity(tx, u, id, 'task.created', [], row!.id);
      return row;
    });
  }
  async editTask(
    u: AuthUser,
    id: string,
    taskId: string,
    input: { version: number; title?: string; dueAt?: Date | null; completed?: boolean },
  ) {
    return withUser(this.db, u.id, async (tx) => {
      await lockLead(tx, id);
      const [old] = await tx
        .select()
        .from(leadTasks)
        .where(and(eq(leadTasks.id, taskId), eq(leadTasks.leadId, id)))
        .for('update');
      if (!old) throw new NotFoundException();
      if (old.version !== input.version) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      const patch = {
        title: input.title,
        dueAt: input.dueAt,
        completedAt:
          input.completed === undefined ? undefined : input.completed ? new Date() : null,
        updatedAt: new Date(),
        version: old.version + 1,
      };
      const [row] = await tx
        .update(leadTasks)
        .set(patch)
        .where(eq(leadTasks.id, taskId))
        .returning();
      await recordActivity(
        tx,
        u,
        id,
        'task.updated',
        Object.keys(patch).filter(
          (k) =>
            !['version', 'updatedAt'].includes(k) && patch[k as keyof typeof patch] !== undefined,
        ),
        taskId,
      );
      return row;
    });
  }
}
