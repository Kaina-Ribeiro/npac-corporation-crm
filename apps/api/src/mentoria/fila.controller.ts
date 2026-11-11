import { Body, HttpCode, Param, Post, Put } from '@nestjs/common';
import { filaFeitoSchema, filaSchema, pme1EnviadoSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId } from '../common/validate.js';
import { validarComAviso } from './erros.js';
import { FilaService } from './fila.service.js';
import { MentoriaController } from './mentoria.guard.js';

/** Fila do dia (§5, D18). Leo (Mentor) não tem Fila: o guarda de perfil dá 404. */
@MentoriaController('fila')
export class FilaController {
  constructor(private readonly fila: FilaService) {}

  @Post()
  @HttpCode(200)
  listar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.fila.listar(u, validarComAviso(filaSchema, body ?? {}));
  }

  @Post('feito')
  @HttpCode(204)
  async feito(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    await this.fila.feito(u, validarComAviso(filaFeitoSchema, body).chave);
  }
}

@MentoriaController('inscricoes')
export class Pme1Controller {
  constructor(private readonly fila: FilaService) {}

  @Put(':id/pme1-enviado')
  pme1(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.fila.pme1(u, entityId(id), validarComAviso(pme1EnviadoSchema, body).enviado);
  }
}
