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
/** NPAC-62: reunião que já aconteceu, lançada como realizada. Até um ano para trás. */
const YEAR_MS = 365 * 86_400_000;
const past = z.iso
  .datetime({ offset: true })
  .transform((s) => new Date(s))
  .refine((d) => d.getTime() <= Date.now(), 'Escolha um horário que já passou')
  .refine((d) => d.getTime() >= Date.now() - YEAR_MS, 'Escolha uma data de até um ano atrás');
const version = z.object({ version: z.number().int().positive() });
const schedule = z
  .object({
    leadId: z.uuid(),
    closerId: z.string().min(1),
    scheduledAt: future,
    origin: z.enum(MEETING_ORIGINS),
  })
  .strict();
const done = schedule.extend({ scheduledAt: past }).strict();
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
  /** Reunião já realizada (NPAC-62, Igor 23/11/2026, "1A, 2A"): SDR do lead ou liderança. */
  @Post('done')
  @Can('meeting:schedule')
  createDone(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.meetings.createDone(u, validate(done, body));
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
  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.meetings.confirm(
      u,
      entityId(id),
      validate(z.object({ step: z.enum(['H1', 'M15']) }).strict(), body).step,
    );
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
