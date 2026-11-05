import { isIP } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { auditLog, type Db, type Tx } from '@npac/db';
import { DB } from '../common/db/db.module.js';

export interface AuditEvent {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  /** Só ids e nomes de campos — nunca dado pessoal. */
  data?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Com `tx`, grava na mesma transação da mudança (falhou uma, reverte as duas). */
  async record(e: AuditEvent, tx?: Tx): Promise<void> {
    await (tx ?? this.db).insert(auditLog).values({
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      ip: e.ip && isIP(e.ip) ? e.ip : null,
      userAgent: e.userAgent ?? null,
      data: e.data ?? {},
    });
  }
}
