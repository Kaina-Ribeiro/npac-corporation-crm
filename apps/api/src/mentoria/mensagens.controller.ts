import { Body, Get, Inject, Injectable, Put } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import {
  mensagemPutSchema,
  type AuthUser,
  type MensagemModelo,
  type MensagemPut,
} from '@npac/shared';
import { sql } from 'drizzle-orm';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { conflitoDeVersao, erroDoBanco, validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { SoAdmin } from './perfil.guard.js';

const ORDEM = sql`array_position(array['BOAS_VINDAS','PASSO_1','PASSO_2','PASSO_3','LEMBRETE_IDR',
  'EVENTO','OUTRO'], momento)`;

/** Mensagens-modelo: quem opera o módulo lê; só Admin escreve (§3). */
@Injectable()
export class MensagensService {
  constructor(@Inject(DB) private readonly db: Db) {}

  listar(u: AuthUser): Promise<MensagemModelo[]> {
    return withUser(this.db, u.id, async (tx) => {
      const linhas = await tx.execute<MensagemModelo>(sql`
        select momento, nome, texto_individual as "textoIndividual", texto_casal as "textoCasal",
          version
        from mentoria_mensagens_modelo order by ${ORDEM}`);
      return [...linhas];
    });
  }

  salvar(u: AuthUser, b: MensagemPut): Promise<{ version: number }> {
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.execute<{ version: number }>(sql`
        update mentoria_mensagens_modelo set texto_individual = ${b.textoIndividual},
          texto_casal = ${b.textoCasal}, version = version + 1, atualizado_por = app_user_id(),
          atualizado_em = now()
        where momento = ${b.momento} and version = ${b.version}
        returning version`);
      if (!r) throw conflitoDeVersao();
      return r;
    }).catch((e) => erroDoBanco(e));
  }
}

@MentoriaController('mensagens')
export class MensagensController {
  constructor(private readonly mensagens: MensagensService) {}

  @Get()
  listar(@CurrentUser() u: SessionUser) {
    return this.mensagens.listar(u);
  }

  @Put()
  @SoAdmin()
  salvar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.mensagens.salvar(u, validarComAviso(mensagemPutSchema, body));
  }
}
