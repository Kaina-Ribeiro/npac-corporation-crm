import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Action } from '@npac/shared';
import type { FastifyRequest } from 'fastify';
import { CAN } from './can.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const action = this.reflector.getAllAndOverride<Action | undefined>(CAN, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!action) return true;
    const user = ctx.switchToHttp().getRequest<FastifyRequest>().user;
    if (!user || !can(user, action)) throw new ForbiddenException();
    return true;
  }
}
