import { Body, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import {
  anotacaoSchema,
  avaliacaoSchema,
  buscaSchema,
  enderecoSchema,
  inscricaoNovaSchema,
  inscricaoPatchSchema,
  inscricoesListaSchema,
  momentoSchema,
  pausarSchema,
  pessoaNovaSchema,
  pessoaPatchSchema,
} from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { validarComAviso } from './erros.js';
import { FichaService } from './ficha.service.js';
import { InscricoesService } from './inscricoes.service.js';
import { MentoriaController } from './mentoria.guard.js';
import { PausaService } from './pausa.service.js';
import { Perfis, SoAdmin } from './perfil.guard.js';

@MentoriaController('')
export class InscricoesController {
  constructor(
    private readonly inscricoes: InscricoesService,
    private readonly ficha: FichaService,
    private readonly pausa: PausaService,
  ) {}

  @Post('inscricoes')
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  criar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.inscricoes.criar(u, validarComAviso(inscricaoNovaSchema, body));
  }

  @Post('inscricoes/lista')
  @HttpCode(200)
  listar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.inscricoes.listar(u, validate(inscricoesListaSchema, body));
  }

  @Post('busca')
  @HttpCode(200)
  buscar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.inscricoes.buscar(u, validate(buscaSchema, body).termo);
  }

  @Get('inscricoes/:id')
  abrir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.ficha.abrir(u, entityId(id));
  }

  @Patch('inscricoes/:id')
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  atualizar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.inscricoes.atualizar(u, entityId(id), validarComAviso(inscricaoPatchSchema, body));
  }

  @Patch('pessoas/:id')
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  atualizarPessoa(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.inscricoes.atualizarPessoa(
      u,
      entityId(id),
      validarComAviso(pessoaPatchSchema, body),
    );
  }

  @Post('inscricoes/:id/pessoa-2')
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  adicionarPessoa2(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.inscricoes.adicionarPessoa2(
      u,
      entityId(id),
      validarComAviso(pessoaNovaSchema, body),
    );
  }

  @Delete('inscricoes/:id/pessoa-2')
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  removerPessoa2(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.inscricoes.removerPessoa2(u, entityId(id));
  }

  @Put('inscricoes/:id/endereco')
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  endereco(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.ficha.salvarEndereco(u, entityId(id), validarComAviso(enderecoSchema, body));
  }

  @Put('inscricoes/:id/momento')
  @Perfis('ACOMPANHAMENTO')
  momento(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.ficha.salvarMomento(u, entityId(id), validarComAviso(momentoSchema, body));
  }

  @Post('inscricoes/:id/momento/concluir')
  @HttpCode(200)
  @Perfis('ACOMPANHAMENTO')
  concluirMomento(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.ficha.concluirMomento(u, entityId(id));
  }

  @Post('inscricoes/:id/momento/destravar')
  @HttpCode(200)
  @SoAdmin()
  destravarMomento(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.ficha.destravarMomento(u, entityId(id));
  }

  @Put('pessoas/:id/avaliacoes')
  @Perfis('ACOMPANHAMENTO')
  avaliacao(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.ficha.salvarAvaliacao(u, entityId(id), validarComAviso(avaliacaoSchema, body));
  }

  @Post('inscricoes/:id/anotacoes')
  anotar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.ficha.anotar(u, entityId(id), validate(anotacaoSchema, body).texto);
  }

  @Post('inscricoes/:id/pausar')
  @HttpCode(200)
  @Perfis('ACOMPANHAMENTO')
  pausar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.pausa.pausar(u, entityId(id), validate(pausarSchema, body ?? {}).motivo);
  }

  @Post('inscricoes/:id/retomar')
  @HttpCode(200)
  @Perfis('ACOMPANHAMENTO')
  retomar(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.pausa.retomar(u, entityId(id));
  }

  @Get('inscricoes/:id/historico')
  historico(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.ficha.historico(u, entityId(id));
  }
}
