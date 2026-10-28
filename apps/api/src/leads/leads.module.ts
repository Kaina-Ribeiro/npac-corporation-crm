import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { LeadsRepository } from './leads.repository.js';
import { LeadsService } from './leads.service.js';
import { LeadMutationsService } from './lead-mutations.service.js';
import { LeadActivityController } from './lead-activity.controller.js';
import { LeadActivityService } from './lead-activity.service.js';

@Module({
  controllers: [LeadsController, LeadActivityController],
  providers: [LeadsService, LeadsRepository, LeadMutationsService, LeadActivityService],
})
export class LeadsModule {}
