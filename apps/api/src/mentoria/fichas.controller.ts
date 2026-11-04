import { Body, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { atualizarFichaSchema, criarFichaSchema, versionSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { validarRegistro } from './erros.js';
import { EscritaService } from './escrita.service.js';
import { buscaFichas, FichasService } from './fichas.service.js';
import { MentoriaController } from './mentoria.guard.js';

/** Linha do tempo (Módulo 2): ficha editável com a version da ficha (D5). URL só com UUID. */
@MentoriaController('fichas')
export class FichasController {
  constructor(
    private readonly escrita: EscritaService,
    private readonly fichas: FichasService,
  ) {}

  @Post()
  @HttpCode(201)
  criar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.fichas.criar(u, validate(criarFichaSchema, body));
  }

  @Post('search')
  @HttpCode(200)
  buscar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.fichas.buscar(u, validate(buscaFichas, body ?? {}));
  }

  @Get(':id')
  abrir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.fichas.abrir(u, entityId(id));
  }

  @Patch(':id')
  atualizar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.escrita.atualizarFicha(
      u,
      entityId(id),
      validarRegistro(atualizarFichaSchema, body),
    );
  }

  @Post(':id/conquistas')
  @HttpCode(201)
  novaConquista(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.fichas.novaConquista(u, entityId(id), validate(versionSchema, body).version);
  }
}
