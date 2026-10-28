import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
@Module({
  controllers: [FinanceController, ReportsController],
  providers: [FinanceService, ReportsService],
})
export class FinanceModule {}
