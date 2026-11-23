import { Module } from '@nestjs/common';
import { MentoriaModule } from '../mentoria/mentoria.module.js';
import { LeadsController } from './leads.controller.js';
import { LeadsRepository } from './leads.repository.js';
import { LeadsService } from './leads.service.js';
import { LeadMutationsService } from './lead-mutations.service.js';
import { LeadActivityController } from './lead-activity.controller.js';
import { LeadActivityService } from './lead-activity.service.js';
import { TaskCompleteService } from './task-complete.service.js';

@Module({
  // Cadastro em Venda Fechada com a venda registrada vira mentorado (NPAC-56).
  imports: [MentoriaModule],
  controllers: [LeadsController, LeadActivityController],
  providers: [
    LeadsService,
    LeadsRepository,
    LeadMutationsService,
    LeadActivityService,
    TaskCompleteService,
  ],
})
export class LeadsModule {}
