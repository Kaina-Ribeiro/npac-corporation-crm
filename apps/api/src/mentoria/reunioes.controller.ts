import { Body, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  agendaSchema,
  controleMensalSchema,
  reuniaoCriarSchema,
  reuniaoPatchSchema,
  reuniaoRemarcarSchema,
  semReuniaoSchema,
} from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId } from '../common/validate.js';
import { validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { ReunioesService } from './reunioes.service.js';

/** Reuniões (§6). Quem vê e quem edita cada linha é a RLS (Especialista: só as dela). */
@MentoriaController('reunioes')
export class ReunioesController {
  constructor(private readonly reunioes: ReunioesService) {}

  @Post()
  criar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.reunioes.criar(u, validarComAviso(reuniaoCriarSchema, body));
  }

  @Post('agenda')
  @HttpCode(200)
  agenda(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.reunioes.agenda(u, validarComAviso(agendaSchema, body));
  }

  @Post('controle-mensal')
  @HttpCode(200)
  controleMensal(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.reunioes.controleMensal(u, validarComAviso(controleMensalSchema, body));
  }

  @Post('sem-reuniao')
  @HttpCode(200)
  semReuniao(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.reunioes.semReuniao(u, validarComAviso(semReuniaoSchema, body));
  }

  @Get('condutores')
  condutores(@CurrentUser() u: SessionUser) {
    return this.reunioes.condutores(u);
  }

  @Get(':id')
  abrir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.reunioes.abrir(u, entityId(id));
  }

  @Patch(':id')
  atualizar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.reunioes.atualizar(u, entityId(id), validarComAviso(reuniaoPatchSchema, body));
  }

  @Post(':id/remarcar')
  @HttpCode(200)
  remarcar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.reunioes.remarcar(u, entityId(id), validarComAviso(reuniaoRemarcarSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  async excluir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    await this.reunioes.excluir(u, entityId(id));
  }
}
