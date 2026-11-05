import { Body, Get, Header, HttpCode, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { MODULOS, nomeArquivoBackup, type Modulo } from '@npac/shared';
import type { FastifyReply } from 'fastify';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { validate } from '../common/validate.js';
import { entradaImportacao, ImportService } from './import.service.js';
import { MentoriaController } from './mentoria.guard.js';

/** Limite de corpo da importação (R10): o resto da API segue no padrão do Fastify. */
export const LIMITE_CORPO_IMPORTACAO = 25 * 1024 * 1024;

const modulo = (m: string): Modulo => {
  if (!(MODULOS as readonly string[]).includes(m)) throw new NotFoundException();
  return m as Modulo;
};

/** Entrada e saída dos três módulos (D6, D36): prévia sem gravar, importação e `.json`. */
@MentoriaController(':modulo')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post('importar/previa')
  @HttpCode(200)
  previa(@CurrentUser() u: SessionUser, @Param('modulo') m: string, @Body() body: unknown) {
    return this.imports.previa(u, modulo(m), validate(entradaImportacao, body));
  }

  @Post('importar')
  @HttpCode(200)
  importar(@CurrentUser() u: SessionUser, @Param('modulo') m: string, @Body() body: unknown) {
    return this.imports.importar(u, modulo(m), validate(entradaImportacao, body));
  }

  @Get('exportar.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  async exportar(
    @CurrentUser() u: SessionUser,
    @Param('modulo') m: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const mod = modulo(m);
    const arquivo = await this.imports.exportar(u, mod);
    res.header(
      'Content-Disposition',
      `attachment; filename="${nomeArquivoBackup(mod, arquivo.exportadoEm)}"`,
    );
    return arquivo;
  }
}
