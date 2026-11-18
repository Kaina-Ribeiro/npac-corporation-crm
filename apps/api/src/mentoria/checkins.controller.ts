import { Body, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { checkinCriarSchema, checkinPatchSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId } from '../common/validate.js';
import { CheckinsService } from './checkins.service.js';
import { validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { Perfis } from './perfil.guard.js';

/**
 * Check-in da semana (Fase 2, Parte 3, E9): Admin e Acompanhamento lançam na ficha (área CHECKIN).
 * A leitura vem com a ficha; Operação lê, a Especialista e o Mentor recebem 404.
 */
@MentoriaController('')
export class CheckinsController {
  constructor(private readonly checkins: CheckinsService) {}

  @Post('inscricoes/:id/checkins')
  @HttpCode(201)
  @Perfis('ACOMPANHAMENTO')
  criar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.checkins.criar(u, entityId(id), validarComAviso(checkinCriarSchema, body));
  }

  @Patch('checkins/:id')
  @Perfis('ACOMPANHAMENTO')
  atualizar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.checkins.atualizar(u, entityId(id), validarComAviso(checkinPatchSchema, body));
  }
}
