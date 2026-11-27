import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { LeadActivityService } from './lead-activity.service.js';
import { TASK_NEXT_STEPS, TaskCompleteService } from './task-complete.service.js';

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
const newTask = task.extend({ assigneeId: z.string().max(64).optional() }).strict();
const change = task
  .partial()
  .extend({ version: z.number().int().positive(), completed: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 1, 'Informe alteração');
/** NPAC-67: concluir pede o que aconteceu (vira nota) e o próximo passo. */
const completion = z
  .object({
    version: z.number().int().positive(),
    note: note.shape.body,
    next: z.enum(TASK_NEXT_STEPS),
    at: z.iso
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .optional(),
    closerId: z.string().min(1).max(64).optional(),
    /** NPAC-81: a reunião que o lead já tem em aberto, no lugar de marcar outra. */
    meetingId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (v) => !v.meetingId || v.next === 'MEETING',
    'A reunião marcada vale só para Agendou reunião',
  )
  .refine(
    (v) => !v.meetingId || (v.at === undefined && v.closerId === undefined),
    'Escolha a reunião marcada ou um horário novo',
  )
  .refine((v) => v.meetingId || v.at, 'Escolha a data')
  .transform((v) =>
    v.meetingId
      ? { version: v.version, note: v.note, next: 'MEETING' as const, meetingId: v.meetingId }
      : { version: v.version, note: v.note, next: v.next, at: v.at!, closerId: v.closerId },
  );

@Controller('leads/:leadId')
export class LeadActivityController {
  constructor(
    private readonly activity: LeadActivityService,
    private readonly completions: TaskCompleteService,
  ) {}
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
    return this.activity.task(u, entityId(id), validate(newTask, body));
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
  /** Quem edita o lead (não o closer): no Hoje e nas Tarefas da ficha. */
  @Post('tasks/:id/complete')
  @HttpCode(200)
  @Can('lead:update')
  completeTask(
    @CurrentUser() u: SessionUser,
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    return this.completions.complete(
      u,
      entityId(leadId),
      entityId(id),
      validate(completion, body),
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }
}
