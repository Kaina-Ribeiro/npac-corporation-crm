import { Body, Get, Inject, Put } from '@nestjs/common';
import type { Db } from '@npac/db';
import { perfilPutSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { validate } from '../common/validate.js';
import { MentoriaController } from './mentoria.guard.js';
import { lerEu, SemPerfil, SoAdmin } from './perfil.guard.js';
import { PerfisService } from './perfis.service.js';

@MentoriaController('')
export class PerfisController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly perfis: PerfisService,
  ) {}

  @Get('eu')
  @SemPerfil()
  eu(@CurrentUser() u: SessionUser) {
    return lerEu(this.db, u.id);
  }

  @Get('perfis')
  @SoAdmin()
  listar(@CurrentUser() u: SessionUser) {
    return this.perfis.listar(u);
  }

  @Put('perfis')
  @SoAdmin()
  definir(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = validate(perfilPutSchema, body);
    return this.perfis.definir(u, b.userId, b.perfil, b.admin);
  }

  @Get('condutores')
  condutores(@CurrentUser() u: SessionUser) {
    return this.perfis.condutores(u);
  }

  @Get('responsaveis')
  responsaveis(@CurrentUser() u: SessionUser) {
    return this.perfis.responsaveis(u);
  }
}
