import { Body, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { atualizarMentoradoSchema, criarMentoradoSchema } from '@npac/shared';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { EscritaService } from './escrita.service.js';
import { MentoriaController } from './mentoria.guard.js';
import { buscaMentorados, MentoriaService } from './mentoria.service.js';

/** Dashboard (Módulo 1). Busca só por POST: nome e termo nunca vão para a URL nem para o log. */
@MentoriaController('mentorados')
export class MentoradosController {
  constructor(
    private readonly mentoria: MentoriaService,
    private readonly escrita: EscritaService,
  ) {}

  /** Cadastro manual. Nome repetido (sem acento e caixa) é recusado com 409 (D40). */
  @Post()
  @HttpCode(201)
  criar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.escrita.criarMentorado(u, validate(criarMentoradoSchema, body));
  }

  @Patch(':id')
  atualizar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.escrita.atualizarMentorado(
      u,
      entityId(id),
      validate(atualizarMentoradoSchema, body),
    );
  }

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
