import { Body, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import {
  acaoPatchSchema,
  dataIdrSchema,
  planoListaSchema,
  planoModeloPutSchema,
} from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { Perfis, SoAdmin } from './perfil.guard.js';
import { PlanoService } from './plano.service.js';

@MentoriaController('')
export class PlanoController {
  constructor(private readonly plano: PlanoService) {}

  @Post('plano/lista')
  @HttpCode(200)
  listar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.plano.listar(u, validate(planoListaSchema, body));
  }

  @Post('plano/semana')
  @HttpCode(200)
  semana(@CurrentUser() u: SessionUser) {
    return this.plano.semana(u);
  }

  @Get('acoes/:id')
  abrir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.plano.abrirAcao(u, entityId(id));
  }

  @Patch('acoes/:id')
  atualizar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.plano.atualizarAcao(u, entityId(id), validarComAviso(acaoPatchSchema, body));
  }

  @Get('plano-modelo')
  @SoAdmin()
  modelo(@CurrentUser() u: SessionUser) {
    return this.plano.modelo(u);
  }

  @Put('plano-modelo')
  @SoAdmin()
  salvarModelo(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.plano.salvarModelo(u, validarComAviso(planoModeloPutSchema, body));
  }

  @Put('inscricoes/:id/data-idr')
  @Perfis('ACOMPANHAMENTO')
  dataIdr(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.plano.corrigirIdr(u, entityId(id), validarComAviso(dataIdrSchema, body));
  }
}
