import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import type { AuthUser } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { erroDoBanco } from './erros.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';

const HOJE = sql`(now() at time zone 'America/Sao_Paulo')::date`;

/** Pausar e retomar (§5): por ação própria, nunca por PATCH de status. */
@Injectable()
export class PausaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
  ) {}

  pausar(u: AuthUser, inscricaoId: string, motivo: string | null | undefined) {
    const id = randomUUID();
    const cifrado = this.crypto.cifrarOpcional(
      motivo ?? null,
      aad('mentoria_pausas', 'motivo', id),
    );
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.execute<{ version: number }>(sql`
        select mentoria_pausar(${inscricaoId}::uuid, ${id}::uuid, ${cifrado}::text, ${HOJE}) as version`);
      return { version: r!.version };
    }).catch((e) => erroDoBanco(e, 'Esta inscrição já está pausada'));
  }

  retomar(u: AuthUser, inscricaoId: string) {
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.execute<{ version: number }>(sql`
        select mentoria_retomar(${inscricaoId}::uuid, ${HOJE}) as version`);
      return { version: r!.version };
    }).catch((e) => erroDoBanco(e));
  }
}
