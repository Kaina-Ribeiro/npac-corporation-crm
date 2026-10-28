import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { Db } from '@npac/db';
import { AuditService } from '../audit/audit.service.js';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { AUTH, createAuth } from './auth.js';
import { AuthController } from './auth.controller.js';
import { PermissionsGuard } from './permissions.guard.js';
import { SessionGuard } from './session.guard.js';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH,
      inject: [DB, ENV, AuditService],
      useFactory: (db: Db, env: Env, audit: AuditService) => createAuth(db, env, audit),
    },
    // Ordem importa: a sessão é resolvida antes da checagem de permissão.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AUTH],
})
export class AuthModule {}
