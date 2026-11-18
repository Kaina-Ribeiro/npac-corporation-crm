import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser, Role } from '@npac/shared';
import type { FastifyRequest } from 'fastify';

export interface SessionUser extends AuthUser {
  name: string;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  /** Meu perfil (NPAC-53): versão da foto (`user.image`), e-mail e usuário de login. */
  image: string | null;
  email: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

export type { Role };

/** Usuário autenticado colocado em `req.user` pelo SessionGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const user = ctx.switchToHttp().getRequest<FastifyRequest>().user;
  if (!user) throw new Error('CurrentUser usado em rota sem SessionGuard');
  return user;
});
