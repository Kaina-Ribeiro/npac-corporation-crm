import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { MEETING_ORIGINS, MEETING_OUTCOMES } from '@npac/shared';
import { z } from 'zod';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { MeetingsService } from './meetings.service.js';

const future = z.iso
  .datetime({ offset: true })
  .transform((s) => new Date(s))
  .refine((d) => d.getTime() > Date.now(), 'Escolha um horário futuro');
const version = z.object({ version: z.number().int().positive() });
const schedule = z
  .object({
    leadId: z.uuid(),
    closerId: z.string().min(1),
    scheduledAt: future,
    origin: z.enum(MEETING_ORIGINS),
  })
  .strict();
const change = version
  .extend({ scheduledAt: future.optional(), closerId: z.string().min(1).optional() })
  .strict()
  .refine((v) => v.scheduledAt || v.closerId, 'Informe alteração');

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}
  @Get()
  list(@CurrentUser() u: SessionUser, @Query('leadId') id: string) {
    return this.meetings.list(u, entityId(id));
  }
  @Post()
  @Can('meeting:schedule')
  create(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.meetings.create(u, validate(schedule, body));
  }
  @Patch(':id')
  @Can('meeting:reschedule')
  update(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.meetings.update(u, entityId(id), validate(change, body));
  }
  @Post(':id/cancel')
  @HttpCode(200)
  @Can('meeting:reschedule')
  cancel(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.meetings.update(u, entityId(id), {
      ...validate(version.strict(), body),
      cancel: true,
    });
  }
  @Post(':id/outcome')
  @HttpCode(200)
  @Can('meeting:outcome')
  outcome(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.meetings.update(
      u,
      entityId(id),
      validate(version.extend({ outcome: z.enum(MEETING_OUTCOMES) }).strict(), body),
    );
  }
}
