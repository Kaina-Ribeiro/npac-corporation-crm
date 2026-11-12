import { Body, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  cicloAnteriorSchema,
  cicloPatchSchema,
  envioPmeSchema,
  tarefaCriarSchema,
  tarefaPatchSchema,
} from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId } from '../common/validate.js';
import { CiclosService } from './ciclos.service.js';
import { validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { Perfis } from './perfil.guard.js';

/**
 * PMEs e ciclos (Fase 2, Parte 1). Envio e datas: Admin, Acompanhamento e Operação. Tarefas: quem
 * marca decide a RLS (Admin, Acompanhamento; Especialista, as das próprias reuniões).
 */
@MentoriaController('')
export class CiclosController {
  constructor(private readonly ciclos: CiclosService) {}

  @Post('inscricoes/:id/ciclos')
  @HttpCode(201)
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  enviar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.ciclos.enviar(u, entityId(id), validarComAviso(envioPmeSchema, body ?? {}));
  }

  @Post('inscricoes/:id/ciclos/anterior')
  @HttpCode(201)
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  anterior(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.ciclos.anterior(u, entityId(id), validarComAviso(cicloAnteriorSchema, body));
  }

  @Patch('ciclos/:id')
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  atualizarCiclo(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.ciclos.atualizarCiclo(u, entityId(id), validarComAviso(cicloPatchSchema, body));
  }

  @Get('tarefas/:id')
  abrirTarefa(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.ciclos.abrirTarefa(u, entityId(id));
  }

  @Patch('tarefas/:id')
  atualizarTarefa(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.ciclos.atualizarTarefa(u, entityId(id), validarComAviso(tarefaPatchSchema, body));
  }

  /** Tarefa da semana combinada na reunião (Parte 2): até 3, prazo obrigatório. */
  @Post('reunioes/:id/tarefas')
  @HttpCode(201)
  criarTarefa(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.ciclos.criarTarefa(u, entityId(id), validarComAviso(tarefaCriarSchema, body));
  }

  /** Só a tarefa da reunião ainda pendente (combinada por engano). */
  @Delete('tarefas/:id')
  @HttpCode(204)
  async excluirTarefa(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    await this.ciclos.excluirTarefa(u, entityId(id));
  }
}
