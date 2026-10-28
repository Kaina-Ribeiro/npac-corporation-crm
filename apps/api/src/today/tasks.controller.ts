import {
  Body,
  ConflictException,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { auditLog, leadTasks, withUser, type Db } from '@npac/db';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { entityId, validate } from '../common/validate.js';

const task = z
  .object({
    title: z.string().trim().min(1).max(200),
    dueAt: z.iso
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .nullable()
      .optional(),
  })
  .strict();
const update = task
  .partial()
  .extend({ version: z.number().int().positive(), completed: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 1);

@Controller('tasks')
@Can('task:write')
export class TasksController {
  constructor(@Inject(DB) private readonly db: Db) {}
  @Post()
  create(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const input = validate(task, body);
    return withUser(this.db, u.id, async (tx) => {
      const [created] = await tx
        .insert(leadTasks)
        .values({ ...input, assigneeId: u.id, createdBy: u.id })
        .returning();
      await tx.insert(auditLog).values({
        actorId: u.id,
        action: 'task.created',
        entityType: 'task',
        entityId: created!.id,
      });
      return created;
    });
  }
  @Patch(':id')
  update(@CurrentUser() u: SessionUser, @Param('id') rawId: string, @Body() body: unknown) {
    const id = entityId(rawId);
    const input = validate(update, body);
    return withUser(this.db, u.id, async (tx) => {
      const [old] = await tx
        .select()
        .from(leadTasks)
        .where(and(eq(leadTasks.id, id), isNull(leadTasks.leadId)))
        .for('update');
      if (!old) throw new NotFoundException();
      if (old.version !== input.version) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      const [changed] = await tx
        .update(leadTasks)
        .set({
          title: input.title,
          dueAt: input.dueAt,
          completedAt:
            input.completed === undefined ? undefined : input.completed ? new Date() : null,
          version: old.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(leadTasks.id, id))
        .returning();
      await tx
        .insert(auditLog)
        .values({ actorId: u.id, action: 'task.updated', entityType: 'task', entityId: id });
      return changed;
    });
  }
}
