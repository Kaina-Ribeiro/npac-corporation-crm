import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { DbModule } from './common/db/db.module.js';
import { loggerOptions } from './common/logging/logger.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: loggerOptions }), DbModule],
  controllers: [HealthController],
})
export class AppModule {}
