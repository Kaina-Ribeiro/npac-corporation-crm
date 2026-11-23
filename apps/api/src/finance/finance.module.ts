import { Module } from '@nestjs/common';
import { MentoriaModule } from '../mentoria/mentoria.module.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
@Module({
  // Venda de RDV, 2M ou 6M vira mentorado (NPAC-56).
  imports: [MentoriaModule],
  controllers: [FinanceController, ReportsController],
  providers: [FinanceService, ReportsService],
  exports: [ReportsService],
})
export class FinanceModule {}
