import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { LEAD_SOURCES, STAGE_KEYS, TIERS } from '@npac/shared';
import { z } from 'zod';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
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
    stage: z.enum(STAGE_KEYS).optional(),
    productId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
@Controller('reports')
@Can('report:view')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
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
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="npac-relatorio.csv"')
  csv(@CurrentUser() u: SessionUser, @Body() b: unknown) {
    return this.reports.csv(u, validate(query, b));
  }
}
