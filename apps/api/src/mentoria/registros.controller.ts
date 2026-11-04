import { Body, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { excluirRegistroSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { EscritaService, KINDS, type KindUrl } from './escrita.service.js';
import { MentoriaController } from './mentoria.guard.js';

/**
 * Exclusão genérica (regra 6): a tela confirma antes; aqui só a version. Não há rota de
 * restauração. A mídia do registro e dos filhos vai para a fila de exclusão (regra 7).
 */
@MentoriaController('registros')
export class RegistrosController {
  constructor(private readonly escrita: EscritaService) {}

  @Post(':kind/:id/excluir')
  @HttpCode(204)
  async excluir(
    @CurrentUser() u: SessionUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!Object.hasOwn(KINDS, kind)) throw new NotFoundException();
    const { version } = validate(excluirRegistroSchema, body);
    await this.escrita.excluir(u, kind as KindUrl, entityId(id), version);
  }
}
