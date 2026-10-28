import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './common/db/db.module.js';
import { loggerOptions } from './common/logging/logger.js';
import { HealthController } from './health/health.controller.js';
import { MeController } from './me/me.controller.js';

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: loggerOptions }), DbModule, AuditModule, AuthModule],
  controllers: [HealthController, MeController],
})
export class AppModule {}
