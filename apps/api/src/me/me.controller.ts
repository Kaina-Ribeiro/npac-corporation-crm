import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { withUser, type Db, type Tx } from '@npac/db';
import { novidadeExiste, ULTIMA_NOVIDADE, versaoNaTela, vistaAvanca } from '@npac/shared/novidades';
import { sql } from 'drizzle-orm';
import { lerMinhaConta } from '../admin/areas.js';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { AllowIncomplete } from '../auth/public.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { photoUrl } from '../conta/photo-url.js';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { RevisionService } from '../events/revision.service.js';

@AllRoles()
@Controller('me')
export class MeController {
  constructor(
    private readonly revision: RevisionService,
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @AllowIncomplete()
  async me(@CurrentUser() u: SessionUser) {
    // Fonte do cargo (NPAC-54): Diretoria (`mestre`) e vínculos por área; `role` é o resumo.
    const { eu, novidadesVista } = await withUser(this.db, u.id, async (tx) => ({
      eu: await lerMinhaConta(tx, u.id),
      novidadesVista: await lerVista(tx, u.id),
    }));
    return {
      id: u.id,
      name: u.name,
      photo: photoUrl(u.id, u.image),
      role: u.role,
      mestre: eu.mestre,
      areas: eu.areas,
      canProspect: u.canProspect,
      canClose: u.canClose,
      twoFactorEnabled: u.twoFactorEnabled,
      mustChangePassword: u.mustChangePassword,
      // Módulos além do comercial: o web mostra a entrada só para quem tem acesso.
      modules: {
        mentoria: eu.mestre || eu.areas.some((a) => a.area === 'ACOMPANHAMENTO'),
      },
      // Contador do canal ao vivo no momento do render: a aba o devolve ao conectar em
      // /api/events e só recarrega se algo mudou desde então (sem dado nenhum: é um número global).
      revision: await this.revision.read(),
      // NPAC-77: número no ar (X.Y.Z ou "dev") e a novidade mais nova que a pessoa já viu.
      versao: versaoNaTela(this.env.APP_VERSION),
      novidadesVista,
    };
  }

  /** "Já vi até `ate`" (NPAC-77): só avança; id desconhecido 400. Sem auditoria. */
  @Post('novidades/vista')
  @HttpCode(200)
  async novidadesVista(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const ate = (body as { ate?: unknown } | null)?.ate;
    if (typeof ate !== 'string' || !novidadeExiste(ate)) {
      throw new BadRequestException('Novidade desconhecida.');
    }
    const novidadesVista = await withUser(this.db, u.id, async (tx) => {
      const [row] = await tx.execute<{ vista: string | null }>(
        sql`select novidades_vista as vista from "user" where id = ${u.id} for update`,
      );
      const atual = row?.vista ?? null;
      if (!vistaAvanca(atual, ate)) return atual;
      await tx.execute(sql`update "user" set novidades_vista = ${ate} where id = ${u.id}`);
      return ate;
    });
    return { novidadesVista };
  }
}

/** Coluna vazia (conta criada depois da subida; quem já existia ganhou a vista pela 0089): grava a mais nova e não abre nada (S2). */
// Lê antes: /api/me roda a cada tela, e um UPDATE por render gravaria a linha sem mudar nada.
async function lerVista(tx: Tx, id: string): Promise<string> {
  const [row] = await tx.execute<{ vista: string | null }>(
    sql`select novidades_vista as vista from "user" where id = ${id}`,
  );
  if (row?.vista) return row.vista;
  await tx.execute(
    sql`update "user" set novidades_vista = ${ULTIMA_NOVIDADE}
        where id = ${id} and novidades_vista is null`,
  );
  return ULTIMA_NOVIDADE;
}
