import { Body, HttpCode, Post } from '@nestjs/common';
import { importarCronogramaSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../../auth/current-user.decorator.js';
import { validarComAviso } from '../erros.js';
import { MentoriaController } from '../mentoria.guard.js';
import { SoAdmin } from '../perfil.guard.js';
import { CronogramaImportacaoService } from './cronograma-importacao.service.js';

/**
 * Importação da planilha do cronograma (NPAC-60, C13): só a Admin. Rotas no formato
 * `mentoria/<recurso>/importar(/previa)`, que o `app.setup.ts` deixa ir a 25 MB.
 */
@MentoriaController('cronograma')
@SoAdmin()
export class CronogramaImportacaoController {
  constructor(private readonly importacao: CronogramaImportacaoService) {}

  @Post('importar/previa')
  @HttpCode(200)
  previa(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.importacao.previa(u, validarComAviso(importarCronogramaSchema, body));
  }

  @Post('importar')
  @HttpCode(200)
  importar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.importacao.importar(u, validarComAviso(importarCronogramaSchema, body));
  }
}
