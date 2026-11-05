import { Get, Inject } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import { LIMITE_REGISTRO_BYTES } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { LIMITE_REGISTROS } from './import.service.js';
import { MentoriaController } from './mentoria.guard.js';
import { LIMITE_ARQUIVO } from './midia.controller.js';

/** Limites técnicos do PDF, com o uso atual (soma dos três módulos). O medidor fica na mídia. */
@MentoriaController('backup')
export class BackupController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get('limites')
  limites(@CurrentUser() u: SessionUser) {
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.execute<{ n: number }>(sql`select
        ((select count(*) from mentoria_mentorados) + (select count(*) from mentoria_fichas)
          + (select count(*) from mentoria_rdv_pessoas))::int as n`);
      return {
        registroBytes: LIMITE_REGISTRO_BYTES,
        registrosTotal: LIMITE_REGISTROS,
        arquivoBytes: LIMITE_ARQUIVO,
        registrosUsados: Number(r?.n ?? 0),
      };
    });
  }
}
