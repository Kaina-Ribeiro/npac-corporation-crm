import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { LEAD_SOURCES, stageKeySchema, TIERS } from '@npac/shared';
import { z } from 'zod';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { csvHeaders } from '../common/csv.js';
import { validate } from '../common/validate.js';
import { ReportsService } from './reports.service.js';
const query = z
  .object({
    period: z.enum(['TODAY', 'MONTH', 'RANGE']).default('MONTH'),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sdrId: z.string().optional(),
    closerId: z.string().optional(),
    source: z.enum(LEAD_SOURCES).optional(),
    tier: z.enum(TIERS).optional(),
    stage: stageKeySchema.optional(),
    productId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
/** CSV também exporta tudo (sem data); a busca da tela continua limitada a 1 ano. */
const csvQuery = query.extend({
  period: z.enum(['TODAY', 'MONTH', 'RANGE', 'ALL']).default('MONTH'),
});
@Controller('reports')
@Can('report:view')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('activity') @Can('audit:view') activity(@CurrentUser() u: SessionUser) {
    return this.reports.activity(u);
  }
  @Post('search') @HttpCode(200) search(@CurrentUser() u: SessionUser, @Body() b: unknown) {
    return this.reports.search(u, validate(query, b));
  }
  @Post('summary') @HttpCode(200) @Can('export:whatsapp') summary(
    @CurrentUser() u: SessionUser,
    @Body() b: unknown,
  ) {
    return this.reports.summary(u, validate(query, b));
  }
  @Post('csv')
  @HttpCode(200)
  @Can('export:csv')
  async csv(
    @CurrentUser() u: SessionUser,
    @Body() b: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const body = await this.reports.csv(u, validate(csvQuery, b));
    csvHeaders(reply, 'npac-relatorio.csv');
    return body;
  }
}
