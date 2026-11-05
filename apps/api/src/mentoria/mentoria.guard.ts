import {
  applyDecorators,
  Controller,
  Injectable,
  NotFoundException,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Role } from '@npac/shared';
import type { FastifyRequest } from 'fastify';
import { RequiresMfa } from '../auth/requires-mfa.decorator.js';

const PAPEIS: readonly Role[] = ['DIRETOR', 'ACOMPANHAMENTO'];

/**
 * Só Diretoria e Acompanhamento enxergam o módulo (D1). Os demais recebem 404, não 403: o
 * módulo não se revela (D14). A RLS (mentoria_pode) repete a regra no banco.
 */
@Injectable()
export class MentoriaGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const u = ctx.switchToHttp().getRequest<FastifyRequest>().user;
    if (!u || !PAPEIS.includes(u.role)) throw new NotFoundException();
    return true;
  }
}

/**
 * Controller do módulo: prefixo `mentoria/...`, MFA obrigatório (default-deny, D18) e guarda
 * de papel. Todo controller do módulo usa este decorator; um teste varre as rotas.
 */
export const MentoriaController = (path: string) =>
  applyDecorators(Controller(`mentoria/${path}`), RequiresMfa(), UseGuards(MentoriaGuard));
