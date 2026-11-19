import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { session as sessionTable, type Db } from '@npac/db';
import { MFA_LIGADO, type Role } from '@npac/shared';
import { acessoDoPedido } from '../mentoria/perfil.guard.js';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { DB } from '../common/db/db.module.js';
import { AUTH, type Auth } from './auth.js';
import { toHeaders } from './headers.js';
import { ALLOW_INCOMPLETE, IS_PUBLIC } from './public.decorator.js';
import { REQUIRES_MFA } from './requires-mfa.decorator.js';
import { UltimoUso } from './ultimo-uso.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DB) private readonly db: Db,
    private readonly ultimoUso: UltimoUso,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const found = await this.auth.api.getSession({ headers: toHeaders(req) });
    if (!found) throw new UnauthorizedException();
    const u = found.user;

    if (!u.active) {
      // Saiu da empresa: derruba todas as sessões na hora.
      await this.db.delete(sessionTable).where(eq(sessionTable.userId, u.id));
      throw new UnauthorizedException();
    }

    req.user = {
      id: u.id,
      name: u.name,
      role: u.role as Role,
      canProspect: u.canProspect,
      canClose: u.canClose,
      twoFactorEnabled: u.twoFactorEnabled === true,
      mustChangePassword: u.mustChangePassword,
      image: u.image ?? null,
      email: u.email,
      username: (u as { username?: string | null }).username ?? '',
    };
    // "Entrou há X" (NPAC-54, D12): uso do sistema, no máximo uma gravação a cada 15 min.
    await this.ultimoUso.marcar(u.id);

    if (this.reflector.getAllAndOverride<boolean>(ALLOW_INCOMPLETE, targets)) return true;
    if (req.user.mustChangePassword) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Troque a senha inicial para continuar.',
      });
    }
    // Só para quem usa o módulo (Diretoria ou vínculo no Acompanhamento, NPAC-54 Fase 4): os
    // demais seguem e recebem 404 da guarda do módulo. A consulta só roda em rota que exige MFA, sem
    // o autenticador. MFA desligado (`MFA_LIGADO`, 05/11/2026): o módulo não exige por ora.
    if (
      MFA_LIGADO &&
      this.reflector.getAllAndOverride<boolean>(REQUIRES_MFA, targets) &&
      !req.user.twoFactorEnabled &&
      (await acessoDoPedido(this.db, req)).membro
    ) {
      throw new ForbiddenException({
        code: 'MFA_REQUIRED',
        message: 'Ative a verificação em duas etapas em Conta > MFA para usar o Acompanhamento.',
      });
    }
    return true;
  }
}
