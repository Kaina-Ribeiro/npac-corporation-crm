import { Body, Get, Header, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import {
  atualizarRdvSchema,
  colarDiagnosticoSchema,
  colarEventosSchema,
  colarLinkSchema,
  criarRdvSchema,
  novoEventoSchema,
  nomeArquivoBackup,
  novoQuadroSchema,
  previaDiagnosticoSchema,
  previaEventosSchema,
} from '@npac/shared';
import type { FastifyReply } from 'fastify';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { validarComAviso } from './erros.js';
import { ImportService } from './import.service.js';
import { MentoriaController } from './mentoria.guard.js';
import { buscaRdv, RdvService } from './rdv.service.js';

/**
 * Linha do tempo RDV (Módulo 3). PATCH aceita nome, eventos e a descrição dos quadros: pasta,
 * diagnóstico e data de item de quadro são campos de fonte (regra 5, D34). URL só com UUID.
 */
@MentoriaController('rdv')
export class RdvController {
  constructor(
    private readonly rdv: RdvService,
    private readonly imports: ImportService,
  ) {}

  /**
   * Exportar .json do RDV (o mesmo do ImportController): declarado aqui porque `GET rdv/:id`
   * capturaria `rdv/exportar.json` e responderia 404.
   */
  @Get('exportar.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  async exportar(@CurrentUser() u: SessionUser, @Res({ passthrough: true }) res: FastifyReply) {
    const arquivo = await this.imports.exportar(u, 'rdv');
    res.header(
      'Content-Disposition',
      `attachment; filename="${nomeArquivoBackup('rdv', arquivo.exportadoEm)}"`,
    );
    return arquivo;
  }

  @Post()
  @HttpCode(201)
  criar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.rdv.criar(u, validate(criarRdvSchema, body));
  }

  @Post('search')
  @HttpCode(200)
  buscar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.rdv.buscar(u, validate(buscaRdv, body ?? {}));
  }

  @Get(':id')
  abrir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.rdv.abrir(u, entityId(id));
  }

  @Patch(':id')
  atualizar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.rdv.atualizar(u, entityId(id), validarComAviso(atualizarRdvSchema, body));
  }

  @Post(':id/diagnostico/previa')
  @HttpCode(200)
  previa(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.rdv.previaDiagnostico(
      u,
      entityId(id),
      validate(previaDiagnosticoSchema, body).texto,
    );
  }

  @Post(':id/diagnostico/colar')
  @HttpCode(200)
  colarDiagnostico(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(colarDiagnosticoSchema, body);
    return this.rdv.colarDiagnostico(u, entityId(id), b.version, b.texto);
  }

  @Post(':id/pasta')
  @HttpCode(200)
  colarLink(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validarComAviso(colarLinkSchema, body);
    return this.rdv.colarLink(u, entityId(id), b.version, b.url);
  }

  @Post(':id/eventos')
  @HttpCode(201)
  novoEvento(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validarComAviso(novoEventoSchema, body);
    return this.rdv.novoEvento(u, entityId(id), b.version, b.data, b.descricao);
  }

  @Post(':id/eventos/colar/previa')
  @HttpCode(200)
  previaEventos(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.rdv.previaEventos(u, entityId(id), validate(previaEventosSchema, body).texto);
  }

  @Post(':id/eventos/colar')
  @HttpCode(200)
  colarEventos(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.rdv.colarEventos(u, entityId(id), validarComAviso(colarEventosSchema, body));
  }

  @Post(':id/quadros')
  @HttpCode(201)
  novoQuadro(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.rdv.novoQuadro(u, entityId(id), validarComAviso(novoQuadroSchema, body));
  }

  @Post(':id/imprimir')
  @HttpCode(204)
  async imprimir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    await this.rdv.imprimir(u, entityId(id));
  }
}
