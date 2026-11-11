import { Body, Post } from '@nestjs/common';
import { contatoSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { ReunioesService } from './reunioes.service.js';

/** Contatos com o mentorado: só acréscimo (§4). Especialista e Mentor não registram (§3). */
@MentoriaController('contatos')
export class ContatosController {
  constructor(private readonly reunioes: ReunioesService) {}

  @Post()
  registrar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.reunioes.registrarContato(u, validarComAviso(contatoSchema, body));
  }
}
