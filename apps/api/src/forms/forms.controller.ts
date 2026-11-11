import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { FORM_INCOME_BANDS, FormsService } from './forms.service.js';

const submission = z
  .object({
    responseId: z.string().min(1).max(200),
    submittedAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    name: z.string().trim().min(1).max(200),
    phone: z.string().max(40).optional(),
    instagram: z.string().max(200).optional(),
    email: z.string().max(254).optional(),
    incomeBand: z.enum(FORM_INCOME_BANDS),
    answers: z
      .array(z.object({ q: z.string().max(300), a: z.string().max(5000) }).strict())
      .max(100),
  })
  .strict();

@Controller()
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  /** Chamado pelo Apps Script do Google Forms. O token vem antes de olhar o corpo. */
  @Public()
  @Post('webhooks/forms')
  @HttpCode(200)
  receive(@Headers('x-forms-token') token: string | undefined, @Body() body: unknown) {
    this.forms.assertToken(token);
    return this.forms.receive(validate(submission, body));
  }

  @Get('leads/:id/form-responses')
  list(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.forms.list(u, entityId(id));
  }
}
