import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { LeadsRepository } from './leads.repository.js';
import { LeadsService } from './leads.service.js';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, LeadsRepository],
})
export class LeadsModule {}
