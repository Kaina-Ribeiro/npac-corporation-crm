import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { HandoffController, HandoffService } from './handoff.js';
import { PlaybookController, PlaybookService } from './playbook.js';
import { TeamController, TeamService } from './team.js';

@Module({
  imports: [FinanceModule],
  controllers: [ChatController, HandoffController, TeamController, PlaybookController],
  providers: [ChatService, HandoffService, TeamService, PlaybookService],
})
export class CollabModule {}
