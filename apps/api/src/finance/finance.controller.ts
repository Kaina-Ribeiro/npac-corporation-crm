import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { FinanceService } from './finance.service.js';
import { receiptSchema, reverseSchema, saleSchema } from './schemas.js';
import { financialConflict } from './conflict.js';
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}
  @Get('products') products(@CurrentUser() u: SessionUser) {
    return this.finance.catalog(u);
  }
  @Get('leads/:id') list(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.finance.list(u, entityId(id));
  }
  @Post('deals') @Can('sale:register') create(
    @CurrentUser() u: SessionUser,
    @Body() body: unknown,
  ) {
    return this.finance.register(u, validate(saleSchema, body)).catch(financialConflict);
  }
  @Post('payments/:id/receive') @HttpCode(200) @Can('sale:register') receive(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.finance
      .receive(u, entityId(id), validate(receiptSchema, body))
      .catch(financialConflict);
  }
  @Post('deals/:id/reverse') @HttpCode(200) @Can('sale:reverse') reverse(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.finance.reverse(u, entityId(id), validate(reverseSchema, body).version);
  }
}
