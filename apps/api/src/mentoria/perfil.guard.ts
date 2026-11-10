import {
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { withUser, type Db } from '@npac/db';
import type { EuMentoria, Perfil } from '@npac/shared';
import { sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { DB } from '../common/db/db.module.js';

const PERFIS_KEY = 'mentoria:perfis';
const SO_ADMIN_KEY = 'mentoria:so-admin';
const SEM_PERFIL_KEY = 'mentoria:sem-perfil';

/** Restringe a rota a estes perfis (Admin sempre passa). */
export const Perfis = (...p: Perfil[]) => SetMetadata(PERFIS_KEY, p);
/** Só quem tem o selo de Admin. */
export const SoAdmin = () => SetMetadata(SO_ADMIN_KEY, true);
/** Rota aberta a quem entra no módulo mesmo sem perfil (a tela "Peça ao Admin"). */
export const SemPerfil = () => SetMetadata(SEM_PERFIL_KEY, true);

/** Sem `@Perfis`, a rota vale para quem opera o módulo. Mentor fica de fora até o painel (D14). */
const PADRAO: readonly Perfil[] = ['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'];

export async function lerEu(db: Db, userId: string): Promise<EuMentoria> {
  return withUser(db, userId, async (tx) => {
    const [r] = await tx.execute<{ perfil: Perfil | null; admin: boolean }>(
      sql`select mentoria_perfil() as perfil, mentoria_admin() as admin`,
    );
    return { perfil: r?.perfil ?? null, admin: r?.admin === true };
  });
}

/**
 * Perfil dentro do módulo (§3). Depois do `MentoriaGuard`, que olha o cargo. Invisível = 404: a
 * rota não se revela a quem não tem o perfil. A RLS repete a regra no banco.
 */
@Injectable()
export class PerfilGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SEM_PERFIL_KEY, targets)) return true;
    const u = ctx.switchToHttp().getRequest<FastifyRequest>().user;
    if (!u) throw new NotFoundException();
    const eu = await lerEu(this.db, u.id);
    if (eu.admin) return true;
    if (this.reflector.getAllAndOverride<boolean>(SO_ADMIN_KEY, targets))
      throw new NotFoundException();
    const aceitos =
      this.reflector.getAllAndOverride<Perfil[] | undefined>(PERFIS_KEY, targets) ?? PADRAO;
    if (!eu.perfil || !aceitos.includes(eu.perfil)) throw new NotFoundException();
    return true;
  }
}
