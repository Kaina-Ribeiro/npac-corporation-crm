import { BadRequestException, Body, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { conquistaCriarSchema, evolucaoPutSchema } from '@npac/shared';
import type { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId } from '../common/validate.js';
import { validarComAviso } from './erros.js';
import { EvolucaoService } from './evolucao.service.js';
import { MentoriaController } from './mentoria.guard.js';
import { Perfis } from './perfil.guard.js';

/** O limite de tamanho dos textos da evolução tem aviso próprio ("Escreva até …"): a tela mostra a frase. */
function validarEvolucao<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const r = schema.safeParse(body);
  const limite = r.success
    ? undefined
    : r.error.issues.find((i) => i.code === 'too_big' && i.message.startsWith('Escreva até'));
  if (limite) throw new BadRequestException(limite.message);
  return validarComAviso(schema, body);
}

/**
 * Aba Evolução (NPAC-57). Leitura: Admin, Acompanhamento e Operação; escrita: Admin e Acompanhamento (área
 * EVOLUCAO). A Especialista e o Mentor recebem 404. Fotos e mídia das conquistas: `MidiaController`.
 */
@MentoriaController('')
export class EvolucaoController {
  constructor(private readonly evolucao: EvolucaoService) {}

  @Get('inscricoes/:id/evolucao')
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  ler(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.evolucao.ler(u, entityId(id));
  }

  @Put('inscricoes/:id/evolucao')
  @Perfis('ACOMPANHAMENTO')
  salvar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.evolucao.salvar(u, entityId(id), validarEvolucao(evolucaoPutSchema, body));
  }

  @Post('inscricoes/:id/conquistas')
  @HttpCode(201)
  @Perfis('ACOMPANHAMENTO')
  criarConquista(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.evolucao.criarConquista(
      u,
      entityId(id),
      validarEvolucao(conquistaCriarSchema, body),
    );
  }

  @Delete('conquistas/:id')
  @HttpCode(204)
  @Perfis('ACOMPANHAMENTO')
  async excluirConquista(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    await this.evolucao.excluirConquista(u, entityId(id));
  }
}
