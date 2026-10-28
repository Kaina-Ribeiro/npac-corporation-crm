import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { LeadActivityService } from './lead-activity.service.js';

const note = z.object({ body: z.string().trim().min(1).max(5000) }).strict();
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
const change = task
  .partial()
  .extend({ version: z.number().int().positive(), completed: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 1, 'Informe alteração');

@Controller('leads/:leadId')
export class LeadActivityController {
  constructor(private readonly activity: LeadActivityService) {}
  @Get('activity')
  list(@CurrentUser() u: SessionUser, @Param('leadId') id: string) {
    return this.activity.list(u, entityId(id));
  }
  @Post('notes')
  @Can('note:write')
  note(@CurrentUser() u: SessionUser, @Param('leadId') id: string, @Body() body: unknown) {
    return this.activity.note(u, entityId(id), validate(note, body).body);
  }
  @Patch('notes/:id')
  @Can('note:write')
  editNote(
    @CurrentUser() u: SessionUser,
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.activity.editNote(
      u,
      entityId(leadId),
      entityId(id),
      validate(note.extend({ version: z.number().int().positive() }), body),
    );
  }
  @Post('tasks')
  @Can('task:write')
  task(@CurrentUser() u: SessionUser, @Param('leadId') id: string, @Body() body: unknown) {
    return this.activity.task(u, entityId(id), validate(task, body));
  }
  @Patch('tasks/:id')
  @Can('task:write')
  editTask(
    @CurrentUser() u: SessionUser,
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.activity.editTask(u, entityId(leadId), entityId(id), validate(change, body));
  }
}
