import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './common/db/db.module.js';
import { loggerOptions } from './common/logging/logger.js';
import { HealthController } from './health/health.controller.js';
import { LeadsModule } from './leads/leads.module.js';
import { MeController } from './me/me.controller.js';
import { MeetingsModule } from './meetings/meetings.module.js';
import { TodayModule } from './today/today.module.js';
import { EventsModule } from './events/events.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: loggerOptions }),
    DbModule,
    AuditModule,
    AuthModule,
    LeadsModule,
    MeetingsModule,
    TodayModule,
    EventsModule,
  ],
  controllers: [HealthController, MeController],
})
export class AppModule {}
