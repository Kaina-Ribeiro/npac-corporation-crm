import { Body, Param, Patch } from '@nestjs/common';
import { atualizarFichaSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId } from '../common/validate.js';
import { validarRegistro } from './erros.js';
import { EscritaService } from './escrita.service.js';
import { MentoriaController } from './mentoria.guard.js';

/** Linha do tempo (Módulo 2): ficha editável com a version da ficha (D5). */
@MentoriaController('fichas')
export class FichasController {
  constructor(private readonly escrita: EscritaService) {}

  @Patch(':id')
  atualizar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.escrita.atualizarFicha(
      u,
      entityId(id),
      validarRegistro(atualizarFichaSchema, body),
    );
  }
}
