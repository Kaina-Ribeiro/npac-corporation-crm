import {
  BadRequestException,
  Body,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Put,
} from '@nestjs/common';
import { mentoriaPmes, withUser, type Db } from '@npac/db';
import { pmePutSchema, type AuthUser, type PmeDTO, type PmePut } from '@npac/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { conflitoDeVersao, erroDoBanco, validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { SoAdmin } from './perfil.guard.js';

const emDto = (p: typeof mentoriaPmes.$inferSelect): PmeDTO => ({
  id: p.id,
  version: p.version,
  numero: p.numero,
  titulo: p.titulo,
  foco: p.foco,
  linkMaterial: p.linkMaterial,
  atividadesExtras: p.atividadesExtras,
  encerramento: p.encerramento,
  ativo: p.ativo,
});

/** Catálogo de PMEs (E1): a Eduarda cadastra; vale para os próximos envios. */
@Injectable()
export class PmesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  listar(u: AuthUser): Promise<PmeDTO[]> {
    return withUser(this.db, u.id, async (tx) =>
      (await tx.select().from(mentoriaPmes).orderBy(asc(mentoriaPmes.numero))).map(emDto),
    );
  }

  salvar(u: AuthUser, b: PmePut): Promise<{ id: string; version: number }> {
    return withUser(this.db, u.id, async (tx) => {
      const { id, version, numero, ...campos } = b;
      if (!id) {
        if (numero === undefined) throw new BadRequestException('Informe o número do PME');
        const [r] = await tx
          .insert(mentoriaPmes)
          .values({ ...campos, numero, criadoPor: u.id })
          .returning({ id: mentoriaPmes.id, version: mentoriaPmes.version });
        return r!;
      }
      if (version === undefined) throw new BadRequestException('Informe a versão');
      if (numero !== undefined) throw new BadRequestException('O número de um PME não muda');
      const [r] = await tx
        .update(mentoriaPmes)
        .set({ ...campos, version: sql`${mentoriaPmes.version} + 1`, atualizadoEm: sql`now()` })
        .where(and(eq(mentoriaPmes.id, id), eq(mentoriaPmes.version, version)))
        .returning({ id: mentoriaPmes.id, version: mentoriaPmes.version });
      if (r) return r;
      const [existe] = await tx
        .select({ id: mentoriaPmes.id })
        .from(mentoriaPmes)
        .where(eq(mentoriaPmes.id, id));
      if (!existe) throw new NotFoundException();
      throw conflitoDeVersao();
    }).catch((e) => erroDoBanco(e, 'Este número de PME já está cadastrado'));
  }
}

@MentoriaController('pmes')
export class PmesController {
  constructor(private readonly pmes: PmesService) {}

  @Get()
  @SoAdmin()
  listar(@CurrentUser() u: SessionUser) {
    return this.pmes.listar(u);
  }

  @Put()
  @SoAdmin()
  salvar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.pmes.salvar(u, validarComAviso(pmePutSchema, body));
  }
}
