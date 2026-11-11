import { Body, Delete, HttpCode, Inject, Injectable, Param, Post } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import { transferirCarteiraSchema, type AuthUser, type TransferirCarteira } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { entityId } from '../common/validate.js';
import { erroDoBanco, validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { SoAdmin } from './perfil.guard.js';

/** Excluir, anonimizar e transferir carteira (§3, §9): só Admin, sempre pelas funções do banco. */
@Injectable()
export class CarteiraService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  excluir(u: AuthUser, id: string): Promise<void> {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select mentoria_excluir_inscricao(${id}::uuid)`);
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.inscricao.excluida',
          entityType: 'mentoria_inscricao',
          entityId: id,
        },
        tx,
      );
    }).catch((e) => erroDoBanco(e));
  }

  anonimizar(u: AuthUser, id: string): Promise<void> {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select mentoria_anonimizar_inscricao(${id}::uuid)`);
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.inscricao.anonimizada',
          entityType: 'mentoria_inscricao',
          entityId: id,
        },
        tx,
      );
    }).catch((e) => erroDoBanco(e));
  }

  transferir(u: AuthUser, b: TransferirCarteira): Promise<{ inscricoes: number; acoes: number }> {
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.execute<{ inscricoes: number; acoes: number }>(
        sql`select * from mentoria_transferir_carteira(${b.de}, ${b.para})`,
      );
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.carteira.transferida',
          entityType: 'user',
          entityId: b.de,
          data: { para: b.para, inscricoes: r!.inscricoes, acoes: r!.acoes },
        },
        tx,
      );
      return r!;
    }).catch((e) => erroDoBanco(e));
  }
}

@MentoriaController('inscricoes')
@SoAdmin()
export class ExclusaoController {
  constructor(private readonly carteira: CarteiraService) {}

  @Delete(':id')
  @HttpCode(204)
  async excluir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    await this.carteira.excluir(u, entityId(id));
  }

  @Post(':id/anonimizar')
  @HttpCode(204)
  async anonimizar(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    await this.carteira.anonimizar(u, entityId(id));
  }
}

@MentoriaController('carteira')
@SoAdmin()
export class CarteiraController {
  constructor(private readonly carteira: CarteiraService) {}

  @Post('transferir')
  @HttpCode(200)
  transferir(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.carteira.transferir(u, validarComAviso(transferirCarteiraSchema, body));
  }
}
