import { Body, HttpCode, Post } from '@nestjs/common';
import { importarCarteiraSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../../auth/current-user.decorator.js';
import { validarComAviso } from '../erros.js';
import { MentoriaController } from '../mentoria.guard.js';
import { SoAdmin } from '../perfil.guard.js';
import { ImportacaoService } from './importacao.service.js';

/** Rotas no formato `mentoria/<recurso>/importar(/previa)`: `app.setup.ts` dá 25 MB só a elas (T1). */
@MentoriaController('carteira')
@SoAdmin()
export class ImportacaoController {
  constructor(private readonly importacao: ImportacaoService) {}

  @Post('importar/previa')
  @HttpCode(200)
  previa(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.importacao.previa(u, validarComAviso(importarCarteiraSchema, body));
  }

  @Post('importar')
  @HttpCode(200)
  importar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.importacao.importar(u, validarComAviso(importarCarteiraSchema, body));
  }
}
