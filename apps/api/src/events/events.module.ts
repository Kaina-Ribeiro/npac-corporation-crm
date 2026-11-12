import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EventsController } from './events.controller.js';
import { RevisionService } from './revision.service.js';

@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [RevisionService],
  exports: [RevisionService],
})
export class EventsModule {}
