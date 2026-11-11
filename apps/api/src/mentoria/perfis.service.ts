import { Inject, Injectable } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import type { AuthUser, PerfilLinha } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { DB } from '../common/db/db.module.js';
import { erroDoBanco } from './erros.js';

@Injectable()
export class PerfisService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /** Quem pode receber perfil: cargo Acompanhamento ativo. A Diretoria é Admin sem linha. */
  listar(u: AuthUser): Promise<PerfilLinha[]> {
    return withUser(this.db, u.id, async (tx) => {
      const rows = await tx.execute<PerfilLinha>(sql`
        select u.id, u.name as nome, p.perfil, coalesce(p.admin, false) as admin
        from "user" u left join mentoria_perfis p on p.user_id = u.id
        where u.active and u.role::text = 'ACOMPANHAMENTO'
        order by u.name`);
      return [...rows];
    });
  }

  definir(u: AuthUser, alvo: string, perfil: string | null, admin: boolean) {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select mentoria_definir_perfil(${alvo}, ${perfil}, ${admin})`);
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.perfil.definido',
          entityType: 'user',
          entityId: alvo,
          data: { perfil, admin },
        },
        tx,
      );
      return { perfil, admin };
    }).catch((e) => erroDoBanco(e));
  }

  /** Quem pode conduzir uma reunião: qualquer usuário ativo (§3), sem dar acesso ao módulo. */
  condutores(u: AuthUser) {
    return withUser(this.db, u.id, async (tx) => {
      const rows = await tx.execute<{ id: string; nome: string }>(
        sql`select id, name as nome from "user" where active order by name`,
      );
      return [...rows];
    });
  }

  /** Quem pode ser responsável por uma inscrição: as pessoas do módulo. */
  responsaveis(u: AuthUser) {
    return withUser(this.db, u.id, async (tx) => {
      const rows = await tx.execute<{ id: string; nome: string }>(sql`
        select id, name as nome from "user"
        where active and role::text in ('ACOMPANHAMENTO', 'DIRETOR') order by name`);
      return [...rows];
    });
  }
}
