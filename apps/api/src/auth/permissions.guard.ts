import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, hasCommercialAccess, type Action } from '@npac/shared';
import type { FastifyRequest } from 'fastify';
import { ALL_ROLES } from './all-roles.decorator.js';
import { CAN } from './can.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const user = ctx.switchToHttp().getRequest<FastifyRequest>().user;
    // Sem comercial (Acompanhamento): só as rotas marcadas com @AllRoles; o resto não existe.
    if (
      user &&
      !hasCommercialAccess(user.role) &&
      !this.reflector.getAllAndOverride<boolean>(ALL_ROLES, targets)
    )
      throw new NotFoundException();
    const action = this.reflector.getAllAndOverride<Action | undefined>(CAN, targets);
    if (!action) return true;
    if (!user || !can(user, action)) throw new ForbiddenException();
    return true;
  }
}
