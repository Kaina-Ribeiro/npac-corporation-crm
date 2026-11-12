import { Body, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { metaCriarSchema, metaPatchSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId } from '../common/validate.js';
import { validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { MetasService } from './metas.service.js';
import { Perfis } from './perfil.guard.js';

/**
 * Metas (Fase 2, Parte 2). Leitura: Admin, Acompanhamento e Operação; escrita: Admin e
 * Acompanhamento (área META). A Especialista e o Mentor recebem 404.
 */
@MentoriaController('')
export class MetasController {
  constructor(private readonly metas: MetasService) {}

  @Post('inscricoes/:id/metas')
  @HttpCode(201)
  @Perfis('ACOMPANHAMENTO')
  criar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.metas.criar(u, entityId(id), validarComAviso(metaCriarSchema, body));
  }

  @Get('metas/:id')
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  abrir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.metas.abrir(u, entityId(id));
  }

  @Patch('metas/:id')
  @Perfis('ACOMPANHAMENTO')
  atualizar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.metas.atualizar(u, entityId(id), validarComAviso(metaPatchSchema, body));
  }

  @Delete('metas/:id')
  @HttpCode(204)
  @Perfis('ACOMPANHAMENTO')
  async excluir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    await this.metas.excluir(u, entityId(id));
  }
}
