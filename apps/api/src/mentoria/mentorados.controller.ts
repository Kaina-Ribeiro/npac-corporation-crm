import { Body, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { MentoriaController } from './mentoria.guard.js';
import { buscaMentorados, MentoriaService } from './mentoria.service.js';

/** Dashboard (Módulo 1). Busca só por POST: nome e termo nunca vão para a URL nem para o log. */
@MentoriaController('mentorados')
export class MentoradosController {
  constructor(private readonly mentoria: MentoriaService) {}

  @Get()
  listar(@CurrentUser() u: SessionUser, @Query('cursor') cursor?: string) {
    const f = validate(z.object({ cursor: z.string().max(400).optional() }), { cursor });
    return this.mentoria.listarMentorados(u, f);
  }

  @Post('search')
  @HttpCode(200)
  buscar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.mentoria.listarMentorados(u, validate(buscaMentorados, body ?? {}));
  }

  @Get(':id')
  abrir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.mentoria.abrirMentorado(u, entityId(id));
  }
}
